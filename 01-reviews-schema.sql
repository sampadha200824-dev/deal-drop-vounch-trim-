-- ============================================================================
-- POST-DELIVERY RATING & ADMIN OVERRIDE SYSTEM — SCHEMA (PostgreSQL)
-- ============================================================================
-- Design notes:
--   * One review per order (UNIQUE on reviews.order_id) — matches "post-delivery"
--     review model: you're rating a specific fulfilled purchase, not the product
--     in the abstract.
--   * The "hard lock" (no review before delivery) is enforced in TWO layers:
--       1. API layer (fast, user-friendly error) — see 02-reviews-api.js
--       2. DB trigger below (defense in depth — holds even if a bug or a rogue
--          script bypasses the API and inserts directly)
--   * "Permanently delete from the public feed" is honored literally — the row
--     is hard-DELETEd from `reviews`. But we still keep an admin accountability
--     trail in `review_moderation_log`, which is a separate table the public
--     feed never reads from, so deletion is real but not silent to admins.
-- ============================================================================

CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  uid           VARCHAR(20) UNIQUE NOT NULL,        -- app-facing ID, e.g. '202600001'
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  phone         VARCHAR(20) NOT NULL,
  role          VARCHAR(10) NOT NULL DEFAULT 'customer'
                  CHECK (role IN ('customer', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id            BIGSERIAL PRIMARY KEY,
  brand         VARCHAR(100) NOT NULL,
  name          VARCHAR(200) NOT NULL,
  category      VARCHAR(50)
);

CREATE TABLE orders (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'delivered', 'cancelled')),
  delivered_at  TIMESTAMPTZ,                         -- stamped only when status -> 'delivered'
  total_amount  NUMERIC(10, 2) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_user ON orders(user_id);

CREATE TABLE order_items (
  id            BIGSERIAL PRIMARY KEY,
  order_id      BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    BIGINT NOT NULL REFERENCES products(id),
  product_name  VARCHAR(200) NOT NULL,               -- snapshot of name at purchase time
  quantity      INT NOT NULL DEFAULT 1,
  unit_price    NUMERIC(10, 2) NOT NULL
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

CREATE TABLE reviews (
  id                  BIGSERIAL PRIMARY KEY,
  order_id            BIGINT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  product_id          BIGINT NOT NULL REFERENCES products(id),
  user_id             BIGINT NOT NULL REFERENCES users(id),
  rating              SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text         VARCHAR(320) NOT NULL,          -- ~2-3 lines; also enforced at API layer
  original_text       VARCHAR(320),                   -- snapshot taken the first time an admin edits
  is_edited_by_admin  BOOLEAN NOT NULL DEFAULT false,
  admin_reply         VARCHAR(320),
  admin_reply_by      BIGINT REFERENCES users(id),
  admin_reply_at      TIMESTAMPTZ,
  status              VARCHAR(10) NOT NULL DEFAULT 'visible'
                        CHECK (status IN ('visible', 'hidden')),  -- soft-hide option, separate from hard delete
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reviews_product ON reviews(product_id) WHERE status = 'visible';

-- Admin accountability trail. Deliberately NOT a foreign key on review_id, because a
-- 'delete' log entry must still exist and be readable *after* the review row is gone.
CREATE TABLE review_moderation_log (
  id            BIGSERIAL PRIMARY KEY,
  review_id     BIGINT,                               -- may point to a since-deleted review
  order_id      BIGINT NOT NULL,
  action        VARCHAR(10) NOT NULL CHECK (action IN ('reply', 'edit', 'delete')),
  admin_id      BIGINT NOT NULL REFERENCES users(id),
  detail        JSONB,                                -- e.g. {"before": "...", "after": "..."}
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- Hard lock, enforced at the database itself: a review can only be inserted
-- if its order is already 'delivered'. This is the last line of defense —
-- the API should never reach this in normal operation because it checks first,
-- but this guarantees the rule holds even against a bug or a direct DB write.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_order_delivered() RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM orders WHERE id = NEW.order_id AND status = 'delivered'
  ) THEN
    RAISE EXCEPTION 'Cannot submit a review: order % is not marked delivered', NEW.order_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_review_requires_delivery
BEFORE INSERT ON reviews
FOR EACH ROW EXECUTE FUNCTION check_order_delivered();
