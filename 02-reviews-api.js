// ============================================================================
// POST-DELIVERY RATING & ADMIN OVERRIDE SYSTEM — API (Express + PostgreSQL)
// ============================================================================
// Assumes elsewhere in the app:
//   - `db`            a pg.Pool (or equivalent) exposing db.query(sql, params)
//   - `io`             a socket.io server instance, for pushing live updates
//   - `requireAuth`    middleware that verifies a JWT and sets req.user = {id, role}
//   - `requireAdmin`   middleware that 403s unless req.user.role === 'admin'
// Mount with: app.use('/api', reviewsRouter)
// ============================================================================

const express = require('express');
const router = express.Router();

const REVIEW_TEXT_MAX = 320;      // ~2-3 lines at typical UI width
const REVIEW_TEXT_MIN = 10;       // reject empty/near-empty "reviews"

function validateReviewText(text) {
  if (typeof text !== 'string') return 'Review text is required.';
  const trimmed = text.trim();
  if (trimmed.length < REVIEW_TEXT_MIN) return 'Review is too short.';
  if (trimmed.length > REVIEW_TEXT_MAX) return 'Keep it to about 2–3 lines (max 320 characters).';
  return null;
}

// ----------------------------------------------------------------------------
// PATCH /api/admin/orders/:orderId/status
// Admin marks an order's fulfillment state. Setting it to 'delivered' is what
// unlocks the review for that order — there is no separate "unlock" endpoint;
// the lock is *derived* from order status, so there's only one source of truth.
// ----------------------------------------------------------------------------
router.patch('/admin/orders/:orderId/status', requireAuth, requireAdmin, async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;
  const allowed = ['pending', 'processing', 'delivered', 'cancelled'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }

  const deliveredAtClause = status === 'delivered' ? ', delivered_at = now()' : '';
  const { rows } = await db.query(
    `UPDATE orders SET status = $1, updated_at = now() ${deliveredAtClause}
     WHERE id = $2 RETURNING id, status, delivered_at`,
    [status, orderId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Order not found' });

  // Let the customer's client know their review is now unlockable (e.g. to
  // flip a "Submit Review" button from disabled to enabled without a refresh).
  io.to(`order:${orderId}`).emit('order:status_changed', rows[0]);
  res.json(rows[0]);
});

// ----------------------------------------------------------------------------
// GET /api/orders/:orderId/review-status
// Customer-facing check the frontend calls to decide whether to render the
// review form or the locked state. Ownership-checked: you can only query
// your own orders.
// ----------------------------------------------------------------------------
router.get('/orders/:orderId/review-status', requireAuth, async (req, res) => {
  const { orderId } = req.params;
  const { rows } = await db.query(
    `SELECT o.status, o.delivered_at, r.id AS existing_review_id
     FROM orders o
     LEFT JOIN reviews r ON r.order_id = o.id
     WHERE o.id = $1 AND o.user_id = $2`,
    [orderId, req.user.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Order not found' });

  const order = rows[0];
  res.json({
    locked: order.status !== 'delivered',
    reason: order.status !== 'delivered' ? 'Reviews unlock once your order is marked delivered.' : null,
    alreadyReviewed: order.existing_review_id !== null,
    deliveredAt: order.delivered_at
  });
});

// ----------------------------------------------------------------------------
// POST /api/reviews
// Customer submits their one review for a delivered order. The DB trigger
// (see schema) is the hard backstop; this check is the fast, friendly one
// that returns a proper 4xx instead of a raw DB exception.
// ----------------------------------------------------------------------------
router.post('/reviews', requireAuth, async (req, res) => {
  const { orderId, rating, reviewText } = req.body;

  const textError = validateReviewText(reviewText);
  if (textError) return res.status(400).json({ error: textError });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating must be an integer from 1 to 5.' });
  }

  const orderRes = await db.query(
    `SELECT o.status, oi.product_id
     FROM orders o JOIN order_items oi ON oi.order_id = o.id
     WHERE o.id = $1 AND o.user_id = $2 LIMIT 1`,
    [orderId, req.user.id]
  );
  if (orderRes.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
  if (orderRes.rows[0].status !== 'delivered') {
    return res.status(403).json({ error: 'Reviews unlock only after the order is marked delivered.' });
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO reviews (order_id, product_id, user_id, rating, review_text)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [orderId, orderRes.rows[0].product_id, req.user.id, rating, reviewText.trim()]
    );
    const review = rows[0];

    // "Instantly render... visible to any guest" — push to everyone currently
    // viewing this product's page, not just the reviewer.
    io.to(`product:${review.product_id}`).emit('review:created', review);

    res.status(201).json(review);
  } catch (err) {
    if (err.code === '23505') { // unique_violation on order_id
      return res.status(409).json({ error: 'You already reviewed this order.' });
    }
    throw err;
  }
});

// ----------------------------------------------------------------------------
// GET /api/products/:productId/reviews
// PUBLIC — no auth required. Any guest or logged-in user browsing the product
// page can read this. Only 'visible' reviews are returned; admin replies are
// nested inline so the frontend can render them directly beneath the review.
// ----------------------------------------------------------------------------
router.get('/products/:productId/reviews', async (req, res) => {
  const { rows } = await db.query(
    `SELECT r.id, r.rating, r.review_text, r.admin_reply, r.admin_reply_at,
            r.is_edited_by_admin, r.created_at,
            u.name AS reviewer_name
     FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.product_id = $1 AND r.status = 'visible'
     ORDER BY r.created_at DESC`,
    [req.params.productId]
  );
  // Mask to "First L." for public display — full name stays in the DB/admin view only.
  const publicRows = rows.map(r => ({
    ...r,
    reviewer_name: r.reviewer_name.replace(/^(\S+)\s+(\S).*$/, '$1 $2.')
  }));
  res.json(publicRows);
});

// ----------------------------------------------------------------------------
// POST /api/admin/reviews/:reviewId/reply   — [Reply]
// ----------------------------------------------------------------------------
router.post('/admin/reviews/:reviewId/reply', requireAuth, requireAdmin, async (req, res) => {
  const { reviewId } = req.params;
  const { replyText } = req.body;
  const textError = validateReviewText(replyText);
  if (textError) return res.status(400).json({ error: textError });

  const { rows } = await db.query(
    `UPDATE reviews SET admin_reply = $1, admin_reply_by = $2, admin_reply_at = now(), updated_at = now()
     WHERE id = $3 RETURNING *`,
    [replyText.trim(), req.user.id, reviewId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Review not found' });

  await db.query(
    `INSERT INTO review_moderation_log (review_id, order_id, action, admin_id, detail)
     VALUES ($1, $2, 'reply', $3, $4)`,
    [reviewId, rows[0].order_id, req.user.id, JSON.stringify({ replyText })]
  );

  io.to(`product:${rows[0].product_id}`).emit('review:replied', rows[0]);
  res.json(rows[0]);
});

// ----------------------------------------------------------------------------
// PATCH /api/admin/reviews/:reviewId   — [Edit]
// The *first* time an admin edits a review, we snapshot the original text —
// subsequent edits don't overwrite that snapshot, so there's always a record
// of what the customer actually wrote.
// ----------------------------------------------------------------------------
router.patch('/admin/reviews/:reviewId', requireAuth, requireAdmin, async (req, res) => {
  const { reviewId } = req.params;
  const { reviewText } = req.body;
  const textError = validateReviewText(reviewText);
  if (textError) return res.status(400).json({ error: textError });

  const { rows } = await db.query(
    `UPDATE reviews
     SET review_text = $1,
         original_text = COALESCE(original_text, review_text), -- only set once
         is_edited_by_admin = true,
         updated_at = now()
     WHERE id = $2 RETURNING *`,
    [reviewText.trim(), reviewId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Review not found' });

  await db.query(
    `INSERT INTO review_moderation_log (review_id, order_id, action, admin_id, detail)
     VALUES ($1, $2, 'edit', $3, $4)`,
    [reviewId, rows[0].order_id, req.user.id, JSON.stringify({ after: reviewText })]
  );

  io.to(`product:${rows[0].product_id}`).emit('review:updated', rows[0]);
  res.json(rows[0]);
});

// ----------------------------------------------------------------------------
// DELETE /api/admin/reviews/:reviewId   — [Delete]
// Hard delete, matching "permanently delete... from the public feed" literally.
// The moderation log entry is written BEFORE the delete and is on a separate
// table with no FK to reviews, so the accountability trail survives even
// though the review itself is gone for good.
// ----------------------------------------------------------------------------
router.delete('/admin/reviews/:reviewId', requireAuth, requireAdmin, async (req, res) => {
  const { reviewId } = req.params;

  const existing = await db.query('SELECT * FROM reviews WHERE id = $1', [reviewId]);
  if (existing.rows.length === 0) return res.status(404).json({ error: 'Review not found' });
  const review = existing.rows[0];

  await db.query(
    `INSERT INTO review_moderation_log (review_id, order_id, action, admin_id, detail)
     VALUES ($1, $2, 'delete', $3, $4)`,
    [reviewId, review.order_id, req.user.id, JSON.stringify({ deletedText: review.review_text })]
  );
  await db.query('DELETE FROM reviews WHERE id = $1', [reviewId]);

  io.to(`product:${review.product_id}`).emit('review:deleted', { id: Number(reviewId) });
  res.status(204).send();
});

module.exports = router;
