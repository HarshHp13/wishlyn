import { NextResponse } from 'next/server';
import { ApiError, apiError, assertSameOrigin, readJson, requireObject } from '../api';
import { requireSession, requireAdmin } from '../session';
import { rateLimit } from '../rateLimit';
import { createPurchase, getPurchase, startPayment, applyPayment, cancelPurchase, reconcilePurchase, updateFulfillment, listPurchases } from './service';
import { paymentGateway, verifyCheckoutSignature, assertPaymentReady } from './gateway';
import { CheckoutValidationError, validateOrderId } from './validation';

export const privateJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export function commerceError(error: unknown) {
  if (error instanceof CheckoutValidationError) return privateJson({ error: error.message, code: 'validation_error', fields: error.fields }, 400);
  return apiError(error);
}
async function customerMutation(request: Request, scope: string) {
  assertSameOrigin(request);
  const user = await requireSession(request);
  await rateLimit(request, { scope, identity: user.id, limit: 20, windowSeconds: 60 });
  return user;
}

function requireCheckoutEnabled() {
  if (process.env.COMMERCE_CHECKOUT_ENABLED !== 'true') throw new ApiError(503, 'checkout_unavailable', 'New checkout is temporarily unavailable. Existing orders remain available in your account.');
}

export async function quotePOST(request: Request) {
  try {
    requireCheckoutEnabled();
    const user = await customerMutation(request, 'checkout-quote');
    return privateJson({ order: await createPurchase(user, requireObject(await readJson(request, 32_768))) }, 201);
  } catch (error) { return commerceError(error); }
}

export async function paymentPOST(request: Request) {
  try {
    requireCheckoutEnabled();
    const user = await customerMutation(request, 'checkout-payment');
    const body = requireObject(await readJson(request));
    assertPaymentReady();
    return privateJson(await startPayment(validateOrderId(body.orderId), user.id, paymentGateway()));
  } catch (error) { return commerceError(error); }
}

export async function verifyPOST(request: Request) {
  try {
    const user = await customerMutation(request, 'checkout-verify');
    const body = requireObject(await readJson(request));
    const order = await getPurchase(validateOrderId(body.orderId), user.id);
    const providerOrderId = body.razorpay_order_id;
    const paymentId = body.razorpay_payment_id;
    const signature = body.razorpay_signature;
    if (typeof providerOrderId !== 'string' || typeof paymentId !== 'string' || typeof signature !== 'string' || providerOrderId !== order.providerOrderId || !verifyCheckoutSignature(providerOrderId, paymentId, signature)) throw new ApiError(400, 'invalid_payment_proof', 'Payment proof does not match this purchase. Use the order page to check its status.');
    const payment = await paymentGateway().fetchPayment(paymentId);
    if (payment.order_id !== order.providerOrderId || payment.id !== paymentId) throw new ApiError(409, 'payment_mismatch', 'Payment does not belong to this purchase.');
    const updated = await applyPayment(payment, 'callback');
    return privateJson({ verified: updated.status === 'paid', order: updated });
  } catch (error) { return commerceError(error); }
}

export async function customerOrdersGET(request: Request) {
  try {
    const user = await requireSession(request);
    const params = new URL(request.url).searchParams;
    return privateJson(await listPurchases(user.id, { offset: Number(params.get('offset') || 0) }));
  } catch (error) { return commerceError(error); }
}

export async function customerOrderGET(request: Request, id: string) {
  try {
    const user = await requireSession(request);
    return privateJson({ order: await getPurchase(id, user.id) });
  } catch (error) { return commerceError(error); }
}

export async function customerOrderPOST(request: Request, id: string) {
  try {
    const user = await customerMutation(request, 'order-action');
    const body = requireObject(await readJson(request));
    if (body.action === 'cancel') return privateJson({ order: await cancelPurchase(id, user.id) });
    if (body.action === 'reconcile') return privateJson({ order: await reconcilePurchase(id, user.id, paymentGateway()) });
    throw new ApiError(400, 'invalid_action', 'Choose a supported order action.');
  } catch (error) { return commerceError(error); }
}

export async function adminOrdersGET(request: Request) {
  try {
    await requireAdmin(request);
    const params = new URL(request.url).searchParams;
    return privateJson(await listPurchases(null, { offset: Number(params.get('offset') || 0), status: params.get('status') || undefined }));
  } catch (error) { return commerceError(error); }
}

export async function adminOrderGET(request: Request, id: string) {
  try { await requireAdmin(request); return privateJson({ order: await getPurchase(id) }); }
  catch (error) { return commerceError(error); }
}

export async function adminOrderPOST(request: Request, id: string) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin(request);
    await rateLimit(request, { scope: 'admin-order-action', identity: admin.id, limit: 60, windowSeconds: 60 });
    const body = requireObject(await readJson(request));
    if (body.action === 'reconcile') return privateJson({ order: await reconcilePurchase(id, undefined, paymentGateway()) });
    if (body.action === 'fulfillment') return privateJson({ order: await updateFulfillment(id, admin.id, body) });
    throw new ApiError(400, 'invalid_action', 'Choose a supported order action.');
  } catch (error) { return commerceError(error); }
}
