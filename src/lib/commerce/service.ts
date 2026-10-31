import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient, QueryResultRow } from 'pg';
import { query, transaction } from '../database';
import { ApiError } from '../api';
import { commerceTotals, GIFT_WRAP_PAISE, MAX_ORDER_PAISE } from '../commerce-rules';
import { validateOrderId, validatePurchaseLines, validateShipping, validateIdempotencyKey } from './validation';
import type { FulfillmentStatus, GatewayPayment, PaymentGateway, Purchase, PurchaseLine, PurchaseStatus } from './types';

interface OrderRow extends QueryResultRow {
  id: string; owner_id: string; email: string; request_hash: string; items: PurchaseLine[]; shipping: Purchase['shipping']; currency: 'INR';
  subtotal_paise: string; shipping_paise: number; tax_paise: number; total_paise: string;
  payment_setup_state: Purchase['paymentSetupState'];
  status: PurchaseStatus; reservation_state: Purchase['reservationState']; provider_order_id: string | null; provider_payment_id: string | null;
  fulfillment_status: FulfillmentStatus; tracking_carrier: string | null; tracking_number: string | null; tracking_url: string | null;
  created_at: Date; expires_at: Date; updated_at: Date;
}
function map(row: OrderRow): Purchase {
  return { id: row.id, ownerId: row.owner_id, email: row.email, items: row.items, shipping: row.shipping, currency: row.currency,
    subtotalPaise: Number(row.subtotal_paise), shippingPaise: row.shipping_paise, taxPaise: row.tax_paise, totalPaise: Number(row.total_paise),
    status: row.status, paymentSetupState: row.payment_setup_state, reservationState: row.reservation_state, providerOrderId: row.provider_order_id, providerPaymentId: row.provider_payment_id,
    fulfillmentStatus: row.fulfillment_status, trackingCarrier: row.tracking_carrier, trackingNumber: row.tracking_number, trackingUrl: row.tracking_url,
    createdAt: row.created_at.toISOString(), expiresAt: row.expires_at.toISOString(), updatedAt: row.updated_at.toISOString() };
}
async function event(client: PoolClient, orderId: string, type: string, message: string, actorId?: string) {
  await client.query('INSERT INTO commerce_order_events(order_id,type,message,actor_id) VALUES($1,$2,$3,$4)', [orderId, type, message, actorId || null]);
}
async function lockedOrder(client: PoolClient, id: string, ownerId?: string): Promise<OrderRow> {
  const { rows } = await client.query<OrderRow>('SELECT * FROM commerce_orders WHERE id=$1 AND ($2::text IS NULL OR owner_id=$2) FOR UPDATE', [validateOrderId(id), ownerId || null]);
  if (!rows[0]) throw new ApiError(404, 'order_not_found', 'This order was not found.');
  return rows[0];
}
async function changeReservation(client: PoolClient, order: OrderRow, consume: boolean) {
  if (order.reservation_state !== 'active') return;
  const { rows } = await client.query<{ variant_id: string; quantity: number }>('SELECT variant_id,quantity FROM commerce_reservations WHERE order_id=$1 ORDER BY variant_id', [order.id]);
  if (!rows.length) throw new Error('Missing purchase reservation.');
  // All inventory paths lock variant IDs in the same order.
  await client.query('SELECT id FROM product_variants WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE', [rows.map(row => row.variant_id)]);
  for (const row of rows) {
    const result = await client.query(`UPDATE product_variants SET reserved_stock=reserved_stock-$2, stock=stock-$3 WHERE id=$1 AND reserved_stock >= $2 AND stock >= $3`, [row.variant_id, row.quantity, consume ? row.quantity : 0]);
    if (result.rowCount !== 1) throw new Error('Inventory reservation invariant failed.');
  }
}
async function release(client: PoolClient, order: OrderRow, status: 'expired' | 'cancelled', actorId?: string) {
  if (order.reservation_state !== 'active' || order.status !== 'pending_payment') return order;
  await changeReservation(client, order, false);
  const { rows } = await client.query<OrderRow>('UPDATE commerce_orders SET reservation_state=$2,status=$3,updated_at=now() WHERE id=$1 RETURNING *', [order.id, 'released', status]);
  await event(client, order.id, status, status === 'expired' ? 'The payment reservation expired. Any later payment requires review.' : 'The unpaid purchase was cancelled. Any later payment requires review.', actorId);
  return rows[0];
}

export async function expireReservations(limit = 50, now = new Date()): Promise<number> {
  const { rows } = await query<{ id: string }>('SELECT id FROM commerce_orders WHERE status=$1 AND reservation_state=$2 AND expires_at <= $3 ORDER BY expires_at,id LIMIT $4', ['pending_payment', 'active', now, Math.min(Math.max(limit, 1), 100)]);
  let count = 0;
  for (const { id } of rows) {
    // One order per transaction avoids lock-order inversion across unrelated baskets.
    await transaction(async client => {
      const order = await lockedOrder(client, id);
      if (order.expires_at <= now && order.status === 'pending_payment' && order.reservation_state === 'active') { await release(client, order, 'expired'); count++; }
    });
  }
  return count;
}

export async function createPurchase(owner: { id: string; email: string }, body: Record<string, unknown>): Promise<Purchase> {
  const lines = validatePurchaseLines(body.items);
  const shipping = validateShipping(body.shipping);
  const requestKey = validateIdempotencyKey(body.requestKey);
  const hash = createHash('sha256').update(JSON.stringify({ lines, shipping })).digest('hex');
  await expireReservations(20);
  return transaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`checkout:${owner.id}:${requestKey}`]);
    const existing = await client.query<OrderRow>('SELECT * FROM commerce_orders WHERE owner_id=$1 AND request_key=$2', [owner.id, requestKey]);
    if (existing.rows[0]) {
      if (existing.rows[0].request_hash !== hash) throw new ApiError(409, 'checkout_changed', 'This checkout reference belongs to different details. Start a new review.');
      return map(existing.rows[0]);
    }
    // Bound open reservations per account, including across concurrent requests with different keys.
    await client.query('SELECT id FROM profiles WHERE id=$1 FOR UPDATE', [owner.id]);
    const active = await client.query<{ count: string }>('SELECT count(*) FROM commerce_orders WHERE owner_id=$1 AND reservation_state=$2', [owner.id, 'active']);
    if (Number(active.rows[0].count) >= 3) throw new ApiError(409, 'open_orders', 'Finish or cancel an existing pending order before starting another.');
    const demand = new Map<string, number>();
    lines.forEach(line => demand.set(line.variantId, (demand.get(line.variantId) || 0) + line.quantity));
    const ids = [...demand.keys()].sort();
    // Freeze publication and product details before taking variant locks. Merchant saves
    // use the same product-to-variant order, preventing a mixed snapshot or archive race.
    await client.query('SELECT id FROM products WHERE id IN (SELECT product_id FROM product_variants WHERE id=ANY($1::text[])) ORDER BY id FOR SHARE', [ids]);
    const { rows: variants } = await client.query<{
      id: string; product_id: string; metal_type: string; purity: string; size: string | null; price: string; stock: number; reserved_stock: number; title: string; images: string[];
    }>(`SELECT v.*,p.title,p.images FROM product_variants v JOIN products p ON p.id=v.product_id
      WHERE v.id=ANY($1::text[]) AND COALESCE(to_jsonb(p)->>'status','published')='published' AND COALESCE((to_jsonb(v)->>'active')::boolean,true) ORDER BY v.id FOR UPDATE OF v`, [ids]);
    if (variants.length !== ids.length) throw new ApiError(409, 'unavailable_items', 'Some pieces are no longer available. Return to your bag to review them.');
    for (const variant of variants) {
      const needed = demand.get(variant.id)!;
      if (variant.stock - variant.reserved_stock < needed) throw new ApiError(409, 'insufficient_stock', `${variant.title} has insufficient available stock. Review your bag.`);
      const amount = Number(variant.price) * 100;
      if (!Number.isFinite(amount) || !Number.isSafeInteger(Math.round(amount)) || amount <= 0) throw new ApiError(503, 'invalid_catalogue_price', 'A piece cannot currently be priced. Please try again later.');
    }
    const items: PurchaseLine[] = lines.map(line => {
      const variant = variants.find(v => v.id === line.variantId)!;
      const unitPricePaise = Math.round(Number(variant.price) * 100);
      const giftWrapPaise = line.giftWrap ? GIFT_WRAP_PAISE : 0;
      return { ...line, productId: variant.product_id, title: variant.title, metalType: variant.metal_type, purity: variant.purity, size: variant.size, image: variant.images[0] || null, unitPricePaise, giftWrapPaise, lineTotalPaise: (unitPricePaise + giftWrapPaise) * line.quantity };
    });
    const subtotal = items.reduce((sum, item) => sum + item.lineTotalPaise, 0);
    if (!Number.isSafeInteger(subtotal) || subtotal <= 0 || subtotal > MAX_ORDER_PAISE) throw new ApiError(400, 'order_limit', 'This order exceeds the online purchase limit.');
    const totals = commerceTotals(subtotal);
    const id = `WISH-${randomUUID().replaceAll('-', '').toUpperCase()}`;
    const { rows } = await client.query<OrderRow>(`INSERT INTO commerce_orders(id,owner_id,email,request_key,request_hash,items,shipping,subtotal_paise,shipping_paise,tax_paise,total_paise)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [id, owner.id, owner.email, requestKey, hash, JSON.stringify(items), JSON.stringify(shipping), totals.subtotalPaise, totals.shippingPaise, totals.taxPaise, totals.totalPaise]);
    for (const id of ids) {
      const quantity = demand.get(id)!;
      const update = await client.query('UPDATE product_variants SET reserved_stock=reserved_stock+$2 WHERE id=$1 AND stock-reserved_stock >= $2', [id, quantity]);
      if (update.rowCount !== 1) throw new ApiError(409, 'insufficient_stock', 'Available stock changed. Review your bag.');
      await client.query('INSERT INTO commerce_reservations(order_id,variant_id,quantity) VALUES($1,$2,$3)', [rows[0].id, id, quantity]);
    }
    await event(client, rows[0].id, 'quoted', 'Purchase details and prices saved. Stock is reserved for 15 minutes.', owner.id);
    return map(rows[0]);
  });
}

export async function getPurchase(id: string, ownerId?: string): Promise<Purchase> {
  const order = await transaction(async client => {
    const row = await lockedOrder(client, id, ownerId);
    return map(row.expires_at <= new Date() ? await release(client, row, 'expired') : row);
  });
  const { rows } = await query<{ id: string; type: string; message: string; created_at: Date }>('SELECT id,type,message,created_at FROM commerce_order_events WHERE order_id=$1 ORDER BY id LIMIT 200', [id]);
  return { ...order, events: rows.map(row => ({ id: row.id, type: row.type, message: row.message, createdAt: row.created_at.toISOString() })) };
}

export async function listPurchases(ownerId: string | null, options: { offset?: number; status?: string } = {}) {
  const offset = Number.isSafeInteger(options.offset) ? Math.max(0, Math.min(options.offset!, 10_000)) : 0;
  const status = ['pending_payment','paid','expired','cancelled','review_required'].includes(options.status || '') ? options.status : null;
  const { rows } = await query<OrderRow>('SELECT * FROM commerce_orders WHERE ($1::text IS NULL OR owner_id=$1) AND ($2::text IS NULL OR status=$2) ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET $3', [ownerId, status, offset]);
  return { orders: rows.slice(0, 20).map(map), nextOffset: rows.length > 20 ? offset + 20 : null };
}

export async function startPayment(id: string, ownerId: string, gateway: PaymentGateway) {
  const attempt = await transaction(async client => {
    const order = await lockedOrder(client, id, ownerId);
    if (order.status !== 'pending_payment' || order.reservation_state !== 'active' || order.expires_at <= new Date()) throw new ApiError(409, 'order_not_payable', 'This order is no longer payable. Open its details before starting another.');
    if (order.provider_order_id) return { order, create: false };
    if (order.payment_setup_state !== 'idle') throw new ApiError(409, 'payment_setup_uncertain', 'Payment setup is already in progress or needs checking. Open the saved order and check payment status before retrying.');
    await client.query("UPDATE commerce_orders SET payment_setup_state='creating',updated_at=now() WHERE id=$1", [id]);
    await event(client, id, 'payment_setup_started', 'Payment setup started. Interrupted setup must be reconciled before another attempt.', ownerId);
    return { order, create: true };
  });
  let providerOrderId = attempt.order.provider_order_id;
  if (attempt.create) {
    try {
      const created = await gateway.createOrder(map(attempt.order));
      if (created.amount !== Number(attempt.order.total_paise) || created.currency !== attempt.order.currency || created.receipt !== id || !/^order_[a-zA-Z0-9]+$/.test(created.id)) throw new ApiError(503, 'provider_order_mismatch', 'The payment service returned an unexpected purchase.');
      await transaction(async client => {
        const latest = await lockedOrder(client, id, ownerId);
        if (latest.provider_order_id && latest.provider_order_id !== created.id) throw new ApiError(409, 'provider_binding_conflict', 'Payment setup needs staff review.');
        await client.query("UPDATE commerce_orders SET provider_order_id=$2,payment_setup_state='bound',updated_at=now() WHERE id=$1", [id, created.id]);
        await event(client, id, 'payment_started', 'Payment reference saved. Payment is not yet confirmed.', ownerId);
      });
      providerOrderId = created.id;
    } catch (error) {
      await transaction(async client => {
        const latest = await lockedOrder(client, id, ownerId);
        if (!latest.provider_order_id) {
          await client.query("UPDATE commerce_orders SET payment_setup_state='uncertain',updated_at=now() WHERE id=$1", [id]);
          await event(client, id, 'payment_setup_uncertain', 'The provider response was not confirmed. Check payment status to recover the existing reference.', ownerId);
        }
      }).catch(() => undefined); // The committed 'creating' state also prevents a duplicate creation after persistence failure.
      throw error;
    }
  }
  const latest = await getPurchase(id, ownerId);
  if (latest.status !== 'pending_payment' || latest.reservationState !== 'active') throw new ApiError(409, 'order_not_payable', 'This order changed during payment setup. Open its details.');
  return { orderId: id, key: gateway.keyId, providerOrderId: providerOrderId!, amount: latest.totalPaise, currency: latest.currency };
}

export async function applyPayment(payment: GatewayPayment, source: 'callback' | 'webhook' | 'reconcile', now = new Date()): Promise<Purchase> {
  return transaction(async client => {
    const found = await client.query<OrderRow>('SELECT * FROM commerce_orders WHERE provider_order_id=$1 FOR UPDATE', [payment.order_id]);
    let order = found.rows[0];
    if (!order) throw new ApiError(404, 'payment_order_not_found', 'The payment order reference is not yet available. Please retry.');
    if (payment.amount !== Number(order.total_paise) || payment.currency !== order.currency) throw new ApiError(409, 'payment_mismatch', 'Payment details do not match this order.');
    if (!((payment.status === 'captured' && payment.captured) || (payment.status === 'refunded' && payment.amount_refunded > 0))) throw new ApiError(409, 'payment_pending', 'Payment has not been captured. Check the order status again shortly.');
    if (order.provider_payment_id === payment.id && (payment.amount_refunded === 0 || order.status === 'review_required')) return map(order);
    if (order.reservation_state === 'active' && order.expires_at <= now) order = await release(client, order, 'expired');
    if (order.provider_payment_id || order.status !== 'pending_payment' || order.reservation_state !== 'active' || payment.amount_refunded > 0) {
      // Captured after cancellation/expiry, refunded or duplicate captures require staff review, never re-reservation.
      if (order.reservation_state === 'active') {
        await changeReservation(client, order, false);
        order.reservation_state = 'released';
      }
      const { rows } = await client.query<OrderRow>(`UPDATE commerce_orders SET status='review_required',reservation_state=$3,provider_payment_id=COALESCE(provider_payment_id,$2),updated_at=now() WHERE id=$1 RETURNING *`, [order.id, payment.id, order.reservation_state]);
      await event(client, order.id, 'payment_review', `Captured payment ${payment.id} requires staff review (${source}). No additional stock was sold.`);
      return map(rows[0]);
    }
    await changeReservation(client, order, true);
    const { rows } = await client.query<OrderRow>(`UPDATE commerce_orders SET status='paid',reservation_state='consumed',provider_payment_id=$2,updated_at=now() WHERE id=$1 RETURNING *`, [order.id, payment.id]);
    await event(client, order.id, 'paid', `Captured payment verified and inventory committed (${source}).`);
    return map(rows[0]);
  });
}

export async function reconcilePurchase(id: string, ownerId: string | undefined, gateway: PaymentGateway): Promise<Purchase> {
  let order = await getPurchase(id, ownerId);
  if (!order.providerOrderId && order.paymentSetupState !== 'idle') {
    const candidates = await gateway.findOrdersByReceipt(order.id);
    if (candidates.length === 0) return order; // No automatic retry: a delayed provider response may still exist.
    if (candidates.length !== 1 || candidates[0].amount !== order.totalPaise || candidates[0].currency !== order.currency || !/^order_[a-zA-Z0-9]+$/.test(candidates[0].id)) throw new ApiError(409, 'provider_setup_review', 'Payment setup needs staff review. Do not attempt another payment for this order.');
    await transaction(async client => {
      const latest = await lockedOrder(client, id, ownerId);
      if (latest.provider_order_id && latest.provider_order_id !== candidates[0].id) throw new ApiError(409, 'provider_binding_conflict', 'Payment setup needs staff review.');
      if (!latest.provider_order_id) {
        await client.query("UPDATE commerce_orders SET provider_order_id=$2,payment_setup_state='bound',updated_at=now() WHERE id=$1", [id, candidates[0].id]);
        await event(client, id, 'payment_setup_recovered', 'The existing provider order was recovered using its receipt. No new payment order was created.');
      }
    });
    order = await getPurchase(id, ownerId);
  }
  if (!order.providerOrderId) return order;
  const payments = await gateway.fetchOrderPayments(order.providerOrderId);
  const captured = payments.filter(payment => (payment.status === 'captured' && payment.captured) || (payment.status === 'refunded' && payment.amount_refunded > 0));
  for (const payment of captured) {
    if (payment.order_id !== order.providerOrderId) throw new ApiError(503, 'invalid_provider_response', 'Unexpected payment status. Please try again.');
    await applyPayment(payment, 'reconcile');
  }
  return getPurchase(id, ownerId);
}

export async function cancelPurchase(id: string, ownerId: string): Promise<Purchase> {
  return transaction(async client => {
    const order = await lockedOrder(client, id, ownerId);
    if (order.status === 'cancelled' || order.status === 'expired') return map(order);
    if (order.status !== 'pending_payment') throw new ApiError(409, 'cannot_cancel', 'This purchase needs a support request rather than unpaid-order cancellation.');
    return map(await release(client, order, 'cancelled', ownerId));
  });
}

export async function updateFulfillment(id: string, adminId: string, body: Record<string, unknown>): Promise<Purchase> {
  const status = body.fulfillmentStatus;
  if (!['processing','shipped','delivered'].includes(String(status))) throw new ApiError(400, 'invalid_fulfillment', 'Choose a valid fulfillment state.');
  const clean = (value: unknown, max: number) => typeof value === 'string' && value.trim().length <= max && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : '';
  const carrier = clean(body.trackingCarrier, 80), number = clean(body.trackingNumber, 120), url = clean(body.trackingUrl, 500);
  if (status === 'shipped' && (!carrier || !number)) throw new ApiError(400, 'tracking_required', 'Shipment updates need a carrier and tracking number.');
  if (url) { try { const parsed = new URL(url); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error(); } catch { throw new ApiError(400, 'invalid_tracking_url', 'Tracking links must be valid HTTPS URLs.'); } }
  return transaction(async client => {
    const order = await lockedOrder(client, id);
    if (order.status !== 'paid') throw new ApiError(409, 'payment_not_confirmed', 'Only a confirmed paid order can enter fulfillment.');
    const next: Record<FulfillmentStatus, string> = { unfulfilled: 'processing', processing: 'shipped', shipped: 'delivered', delivered: '' };
    if (next[order.fulfillment_status] !== status) throw new ApiError(409, 'fulfillment_conflict', 'This order has changed. Refresh it and follow the next fulfillment step.');
    const { rows } = await client.query<OrderRow>(`UPDATE commerce_orders SET fulfillment_status=$2,tracking_carrier=COALESCE($3,tracking_carrier),tracking_number=COALESCE($4,tracking_number),tracking_url=COALESCE($5,tracking_url),updated_at=now() WHERE id=$1 RETURNING *`, [id, status, status === 'shipped' ? carrier : null, status === 'shipped' ? number : null, status === 'shipped' ? url || null : null]);
    await event(client, id, String(status), status === 'shipped' ? `Staff recorded dispatch with ${carrier}, tracking ${number}.` : `Staff marked this order ${status}.`, adminId);
    return map(rows[0]);
  });
}
