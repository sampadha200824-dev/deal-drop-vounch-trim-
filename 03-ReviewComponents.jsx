// ============================================================================
// POST-DELIVERY RATING & ADMIN OVERRIDE SYSTEM — FRONTEND (React)
// ============================================================================
// Exports:
//   useReviewLock(orderId)              hook — polls/derives lock state
//   <StarRatingInput />                 controlled 1-5 star picker
//   <SubmitReviewForm />                locked state OR form, with loader + success check
//   <PublicReviewsTimeline />           public feed, live-updating via socket.io
//   <AdminReviewDashboard />            admin-only Reply / Edit / Delete controls
//
// Assumes a shared `api` client (fetch wrapper that attaches the JWT) and a
// shared `socket` (socket.io-client instance) are available via imports —
// stubbed at the top so this file is drop-in runnable against the API in
// 02-reviews-api.js.
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';

const api = {
  get: (url) => fetch(url, { credentials: 'include' }).then(r => r.json()),
  post: (url, body) => fetch(url, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }).then(async r => { if (!r.ok) throw await r.json(); return r.json(); }),
  patch: (url, body) => fetch(url, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }).then(async r => { if (!r.ok) throw await r.json(); return r.json(); }),
  del: (url) => fetch(url, { method: 'DELETE', credentials: 'include' })
};
const socket = io('/', { autoConnect: true });

// ----------------------------------------------------------------------------
// useReviewLock — single source of truth for "is the Submit Review button
// enabled". Re-checks live when the admin changes order status, via the
// order:status_changed socket event the API emits — no manual refresh needed.
// ----------------------------------------------------------------------------
export function useReviewLock(orderId) {
  const [state, setState] = useState({ loading: true, locked: true, reason: '', alreadyReviewed: false });

  useEffect(() => {
    let cancelled = false;
    api.get(`/api/orders/${orderId}/review-status`).then(data => {
      if (!cancelled) setState({ loading: false, ...data });
    });

    socket.emit('join', `order:${orderId}`);
    const onStatusChange = (order) => {
      setState(s => ({ ...s, locked: order.status !== 'delivered' }));
    };
    socket.on('order:status_changed', onStatusChange);

    return () => { cancelled = true; socket.off('order:status_changed', onStatusChange); };
  }, [orderId]);

  return state;
}

// ----------------------------------------------------------------------------
// StarRatingInput — controlled, keyboard-accessible star picker.
// ----------------------------------------------------------------------------
export function StarRatingInput({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Rating" style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          onClick={() => onChange(n)}
          style={{ fontSize: 24, background: 'none', border: 'none', cursor: 'pointer',
                   color: n <= value ? '#ffc14f' : '#3a3a42', transition: 'color .15s ease' }}
        >★</button>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// SubmitReviewForm — the hard-locked / unlocked review entry point.
// Renders one of three states: locked, unlocked+form, or already-submitted.
// Includes a loading spinner while the POST is in flight and a success
// checkmark animation on completion (CSS classes referenced, not inlined —
// see the .review-* class names, styled to match the app's existing
// success-toast/checkmark pattern).
// ----------------------------------------------------------------------------
export function SubmitReviewForm({ orderId, productId, onSubmitted }) {
  const lock = useReviewLock(orderId);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const MAX_LEN = 320;

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError('');
    if (rating < 1) return setError('Pick a star rating first.');
    if (text.trim().length < 10) return setError('Say a little more — a couple of sentences is plenty.');

    setSubmitting(true);
    try {
      await api.post('/api/reviews', { orderId, rating, reviewText: text.trim() });
      setSubmitting(false);
      setSuccess(true);          // triggers the checkmark animation state
      onSubmitted?.();
    } catch (err) {
      setSubmitting(false);
      setError(err.error || 'Could not submit your review — try again.');
    }
  }, [orderId, rating, text, onSubmitted]);

  if (lock.loading) return <div className="review-skeleton" />;

  if (lock.alreadyReviewed || success) {
    return (
      <div className="review-success">
        <span className="review-success-check">✓</span>
        <p>Thanks — your review is live.</p>
      </div>
    );
  }

  if (lock.locked) {
    return (
      <div className="review-locked" aria-disabled="true">
        <span className="review-locked-icon">🔒</span>
        <p>Submit Review unlocks once this order is marked <strong>Delivered</strong>.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="review-form">
      <StarRatingInput value={rating} onChange={setRating} />
      <textarea
        value={text}
        maxLength={MAX_LEN}
        onChange={e => setText(e.target.value)}
        placeholder="2–3 lines on how it went — was delivery fast, did the code work first try?"
        rows={3}
      />
      <div className="review-char-count">{text.length}/{MAX_LEN}</div>
      {error && <p className="review-error">{error}</p>}
      <button type="submit" disabled={submitting} className="review-submit-btn">
        {submitting ? <span className="review-spinner" /> : 'Submit Review'}
      </button>
    </form>
  );
}

// ----------------------------------------------------------------------------
// PublicReviewsTimeline — no auth required to render this; guests see it too.
// Subscribes to the product's socket room so a review posted by anyone,
// anywhere, appears here instantly without a page refresh.
// ----------------------------------------------------------------------------
export function PublicReviewsTimeline({ productId }) {
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    api.get(`/api/products/${productId}/reviews`).then(setReviews);

    socket.emit('join', `product:${productId}`);
    const onCreated = (r) => setReviews(list => [r, ...list]);
    const onUpdated = (r) => setReviews(list => list.map(x => x.id === r.id ? r : x));
    const onReplied = (r) => setReviews(list => list.map(x => x.id === r.id ? r : x));
    const onDeleted = ({ id }) => setReviews(list => list.filter(x => x.id !== id));

    socket.on('review:created', onCreated);
    socket.on('review:updated', onUpdated);
    socket.on('review:replied', onReplied);
    socket.on('review:deleted', onDeleted);
    return () => {
      socket.off('review:created', onCreated);
      socket.off('review:updated', onUpdated);
      socket.off('review:replied', onReplied);
      socket.off('review:deleted', onDeleted);
    };
  }, [productId]);

  if (reviews.length === 0) return <p className="reviews-empty">No reviews yet — be the first after delivery.</p>;

  return (
    <div className="reviews-timeline">
      {reviews.map(r => (
        <article key={r.id} className="review-card">
          <div className="review-card-head">
            <span className="review-stars">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
            <span className="review-author">{r.reviewer_name}</span>
            {r.is_edited_by_admin && <span className="review-edited-tag">edited by store</span>}
          </div>
          <p className="review-text">{r.review_text}</p>
          {r.admin_reply && (
            <div className="review-admin-reply">
              <strong>Store reply</strong>
              <p>{r.admin_reply}</p>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// AdminReviewDashboard — Reply / Edit / Delete, all optimistic-then-confirmed.
// Meant to be mounted inside the existing admin shell, scoped to one product
// or fed a full cross-product list depending on the route it's given.
// ----------------------------------------------------------------------------
export function AdminReviewDashboard({ productId }) {
  const [reviews, setReviews] = useState([]);
  const [drafts, setDrafts] = useState({}); // { [reviewId]: { mode: 'reply'|'edit', text } }

  const load = useCallback(() => {
    api.get(`/api/products/${productId}/reviews`).then(setReviews);
  }, [productId]);

  useEffect(() => { load(); }, [load]);

  const openDraft = (id, mode, seedText = '') =>
    setDrafts(d => ({ ...d, [id]: { mode, text: seedText } }));
  const closeDraft = (id) =>
    setDrafts(d => { const next = { ...d }; delete next[id]; return next; });
  const setDraftText = (id, text) =>
    setDrafts(d => ({ ...d, [id]: { ...d[id], text } }));

  const submitReply = async (id) => {
    const text = drafts[id]?.text?.trim();
    if (!text) return;
    const updated = await api.post(`/api/admin/reviews/${id}/reply`, { replyText: text });
    setReviews(list => list.map(r => r.id === id ? updated : r));
    closeDraft(id);
  };

  const submitEdit = async (id) => {
    const text = drafts[id]?.text?.trim();
    if (!text) return;
    const updated = await api.patch(`/api/admin/reviews/${id}`, { reviewText: text });
    setReviews(list => list.map(r => r.id === id ? updated : r));
    closeDraft(id);
  };

  const remove = async (id) => {
    if (!window.confirm('Permanently delete this review? This cannot be undone.')) return;
    await api.del(`/api/admin/reviews/${id}`);
    setReviews(list => list.filter(r => r.id !== id)); // hard-removed from view, matching the API
  };

  return (
    <div className="admin-review-dashboard">
      {reviews.map(r => {
        const draft = drafts[r.id];
        return (
          <div key={r.id} className="admin-review-row">
            <div className="admin-review-summary">
              <span className="review-stars">{'★'.repeat(r.rating)}</span>
              <span className="review-author">{r.reviewer_name}</span>
            </div>
            <p className="review-text">{r.review_text}</p>
            {r.admin_reply && <p className="review-admin-reply-preview">Reply: {r.admin_reply}</p>}

            {draft?.mode === 'reply' && (
              <div className="admin-draft-box">
                <textarea value={draft.text} onChange={e => setDraftText(r.id, e.target.value)} rows={2} />
                <button onClick={() => submitReply(r.id)}>Post Reply</button>
                <button onClick={() => closeDraft(r.id)}>Cancel</button>
              </div>
            )}
            {draft?.mode === 'edit' && (
              <div className="admin-draft-box">
                <textarea value={draft.text} onChange={e => setDraftText(r.id, e.target.value)} rows={2} />
                <button onClick={() => submitEdit(r.id)}>Save Edit</button>
                <button onClick={() => closeDraft(r.id)}>Cancel</button>
              </div>
            )}

            {!draft && (
              <div className="admin-review-actions">
                <button onClick={() => openDraft(r.id, 'reply')}>Reply</button>
                <button onClick={() => openDraft(r.id, 'edit', r.review_text)}>Edit</button>
                <button onClick={() => remove(r.id)} className="danger">Delete</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
