import { ApiError, readBody } from '@/lib/api';
import { commerceError, privateJson } from '@/lib/commerce/http';
import { paymentGateway, verifyWebhookSignature } from '@/lib/commerce/gateway';
import { applyPayment } from '@/lib/commerce/service';

export async function POST(request: Request) {
  try {
    const signature = request.headers.get('x-razorpay-signature') || '';
    if (!/^[a-f0-9]{64}$/i.test(signature)) throw new ApiError(400, 'invalid_webhook_signature', 'Invalid webhook signature.');
    const body = new TextDecoder('utf-8', { fatal: true }).decode(await readBody(request, 65_536));
    if (!verifyWebhookSignature(body, signature)) throw new ApiError(400, 'invalid_webhook_signature', 'Invalid webhook signature.');
    let payload: { event?: string; payload?: { payment?: { entity?: { id?: string } }; refund?: { entity?: { payment_id?: string } } } };
    try { payload = JSON.parse(body); } catch { throw new ApiError(400, 'invalid_webhook', 'Malformed webhook body.'); }
    if (!['payment.captured', 'order.paid', 'refund.processed'].includes(payload?.event || '')) return privateJson({ received: true, processed: false });
    const id = payload?.event === 'refund.processed' ? payload?.payload?.refund?.entity?.payment_id : payload?.payload?.payment?.entity?.id;
    if (typeof id !== 'string') throw new ApiError(400, 'invalid_webhook', 'A payment reference is required.');
    // The signed event is a trigger; fresh provider facts establish capture/amount/currency.
    const payment = await paymentGateway().fetchPayment(id);
    if (payment.id !== id) throw new ApiError(503, 'invalid_provider_response', 'Unexpected payment reference.');
    await applyPayment(payment, 'webhook');
    return privateJson({ received: true, processed: true });
  } catch (error) { return commerceError(error); }
}
