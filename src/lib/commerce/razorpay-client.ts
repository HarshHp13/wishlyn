'use client';

export interface CheckoutProof { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
interface CheckoutOptions {
  key: string; amount: number; currency: string; name: string; description: string; order_id: string;
  prefill: { name: string; email: string; contact: string };
  handler: (proof: CheckoutProof) => void | Promise<void>;
  modal: { ondismiss: () => void };
  theme: { color: string };
}
export interface RazorpayInstance { open(): void; on(event: 'payment.failed', callback: () => void): void }
export type RazorpayConstructor = new (options: CheckoutOptions) => RazorpayInstance;
declare global { interface Window { Razorpay?: RazorpayConstructor } }

let loading: Promise<RazorpayConstructor> | undefined;

/** Failed/partial script elements never trap future calls waiting for an event that already fired. */
export function loadRazorpay(timeoutMs = 10_000): Promise<RazorpayConstructor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (loading) return loading;
  document.querySelector('script[data-wishlyn-payment-sdk]')?.remove();
  loading = new Promise<RazorpayConstructor>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.wishlynPaymentSdk = 'true';
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      script.onload = null; script.onerror = null;
      if (error || !window.Razorpay) {
        script.remove();
        reject(error || new Error('Payment could not load. Please retry.'));
      } else resolve(window.Razorpay);
    };
    const timer = setTimeout(() => finish(new Error('Payment took too long to load. Check your connection and retry.')), timeoutMs);
    script.onload = () => finish();
    script.onerror = () => finish(new Error('Payment could not load. Check your connection and retry.'));
    document.head.appendChild(script);
  }).catch(error => { loading = undefined; throw error; });
  return loading;
}
