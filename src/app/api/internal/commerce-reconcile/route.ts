import { timingSafeEqual } from 'node:crypto';
import { ApiError } from '@/lib/api';
import { query } from '@/lib/database';
import { commerceError, privateJson } from '@/lib/commerce/http';
import { paymentGateway } from '@/lib/commerce/gateway';
import { expireReservations, reconcilePurchase } from '@/lib/commerce/service';

export async function POST(request: Request) {
  try {
    const secret = process.env.COMMERCE_CRON_SECRET;
    if (!secret || secret.length < 32) throw new ApiError(503, 'reconciliation_unavailable', 'Reconciliation is not configured.');
    const supplied = request.headers.get('authorization') || '';
    const expected = `Bearer ${secret}`;
    if (Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw new ApiError(401, 'unauthorized', 'Authentication is required.');
    // The scheduler never receives customer addresses or payment credentials.
    const expired = await expireReservations(100);
    const gateway = paymentGateway();
    const { rows } = await query<{ id: string }>(`SELECT id FROM commerce_orders WHERE (provider_order_id IS NOT NULL OR payment_setup_state IN ('creating','uncertain')) AND created_at > now() - interval '30 days' AND status <> 'review_required' ORDER BY COALESCE(last_reconciled_at,created_at),id LIMIT 20`);
    let reconciled = 0, failed = 0;
    for (const { id } of rows) {
      try { await reconcilePurchase(id, undefined, gateway); reconciled++; }
      catch { failed++; }
      finally { await query('UPDATE commerce_orders SET last_reconciled_at=now() WHERE id=$1', [id]); }
    }
    return privateJson({ expired, reconciled, failed }, failed ? 503 : 200);
  } catch (error) { return commerceError(error); }
}
