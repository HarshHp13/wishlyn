import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../api';
import type { GatewayOrder, GatewayPayment, PaymentGateway } from './types';

function configuration(name: string): string {
  const value = process.env[name];
  if (!value) throw new ApiError(503, 'payment_unavailable', 'Payment is temporarily unavailable. Your order reference remains available in your account.');
  return value;
}

export function verifyHmac(body: string, signature: string, secret: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  return timingSafeEqual(Buffer.from(createHmac('sha256', secret).update(body).digest('hex'), 'hex'), Buffer.from(signature, 'hex'));
}

export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  return verifyHmac(`${orderId}|${paymentId}`, signature, configuration('RAZORPAY_KEY_SECRET'));
}

export function verifyWebhookSignature(body: string, signature: string): boolean {
  return verifyHmac(body, signature, configuration('RAZORPAY_WEBHOOK_SECRET'));
}

export function assertPaymentReady(): void {
  if (process.env.COMMERCE_PAYMENTS_ENABLED !== 'true' || process.env.COMMERCE_POLICY_APPROVED !== 'true') throw new ApiError(503, 'payment_unavailable', 'Payments are not enabled. Your order remains available in your account.');
  configuration('RAZORPAY_KEY_ID'); configuration('RAZORPAY_KEY_SECRET'); configuration('RAZORPAY_WEBHOOK_SECRET');
}

export function paymentGateway(): PaymentGateway {
  const keyId = configuration('RAZORPAY_KEY_ID');
  const secret = configuration('RAZORPAY_KEY_SECRET');
  const authorization = `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}`;
  async function request(path: string, body?: unknown): Promise<unknown> {
    try {
      const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10_000), cache: 'no-store',
      });
      if (!response.ok) throw new Error('Payment provider request failed.');
      return await response.json();
    } catch {
      throw new ApiError(503, 'payment_unavailable', 'The payment service could not confirm this request. Check this order before attempting another payment.');
    }
  }
  const payment = (input: unknown): GatewayPayment => {
    const p = input as Partial<GatewayPayment> | null;
    if (!p || typeof p.id !== 'string' || typeof p.order_id !== 'string' || !Number.isSafeInteger(p.amount) || typeof p.currency !== 'string' || typeof p.status !== 'string' || typeof p.captured !== 'boolean' || !Number.isSafeInteger(p.amount_refunded)) throw new ApiError(503, 'invalid_provider_response', 'Payment status is temporarily unavailable.');
    return p as GatewayPayment;
  };
  return {
    keyId,
    async createOrder(order) {
      assertPaymentReady();
      const result = await request('orders', { amount: order.totalPaise, currency: order.currency, receipt: order.id }) as Partial<GatewayOrder> | null;
      if (!result || !/^order_[a-zA-Z0-9]+$/.test(result.id || '') || result.amount !== order.totalPaise || result.currency !== order.currency || result.receipt !== order.id) throw new ApiError(503, 'invalid_provider_response', 'The payment service returned an unexpected order. Payment has not started.');
      return result as GatewayOrder;
    },
    async fetchPayment(id) {
      if (!/^pay_[a-zA-Z0-9]+$/.test(id)) throw new ApiError(400, 'invalid_payment_id', 'Invalid payment reference.');
      return payment(await request(`payments/${encodeURIComponent(id)}`));
    },
    async findOrdersByReceipt(receipt) {
      const result = await request(`orders?receipt=${encodeURIComponent(receipt)}&count=100`) as { items?: GatewayOrder[] } | null;
      if (!result || !Array.isArray(result.items) || result.items.length >= 100) throw new ApiError(503, 'invalid_provider_response', 'Payment creation needs manual review.');
      return result.items.filter(order => order.receipt === receipt);
    },
    async fetchOrderPayments(id) {
      if (!/^order_[a-zA-Z0-9]+$/.test(id)) throw new ApiError(400, 'invalid_payment_order', 'Invalid payment order reference.');
      const result = await request(`orders/${encodeURIComponent(id)}/payments`) as { items?: unknown[] } | null;
      if (!result || !Array.isArray(result.items) || result.items.length > 100) throw new ApiError(503, 'invalid_provider_response', 'Payment status is temporarily unavailable.');
      return result.items.map(payment);
    },
  };
}
