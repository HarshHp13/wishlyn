'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useCart } from '@/context/CartContext';
import { refreshAuthSession, type AuthUser } from '@/lib/authClient';
import { commerceTotals, formatMoney, GIFT_WRAP_PAISE, SHIPPING_PAISE, FREE_SHIPPING_THRESHOLD_PAISE, TAX_RATE_PERCENT } from '@/lib/commerce-rules';
import { CommerceRequestError, commerceRequest } from '@/lib/commerce/client';
import { bagMatchesPurchase } from '@/lib/commerce/bag-match';
import { loadRazorpay } from '@/lib/commerce/razorpay-client';
import { CheckoutValidationError, INDIAN_STATES, validateShipping } from '@/lib/commerce/validation';
import type { Purchase, ShippingAddress } from '@/lib/commerce/types';
import styles from './checkout.module.css';

const emptyShipping: ShippingAddress = { firstName: '', lastName: '', phone: '', address: '', city: '', state: '', zipCode: '', country: 'India' };
const message = (error: unknown) => error instanceof Error ? error.message : 'This request could not be completed. Please retry.';

function Checkout() {
  const router = useRouter();
  const params = useSearchParams();
  const orderParam = params.get('order');
  const { cartItems, cartTotal, clearCart } = useCart();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [shipping, setShipping] = useState<ShippingAddress>(emptyShipping);
  const [order, setOrder] = useState<Purchase | null>(null);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
  const [authRetry, setAuthRetry] = useState(0);
  const account = useRef<string | null>(null);
  const requestKey = useRef({ fingerprint: '', key: '' });
  const itemsRef = useRef(cartItems);
  useEffect(() => { itemsRef.current = cartItems; }, [cartItems]);

  useEffect(() => {
    let live = true;
    const sync = async () => {
      try {
        const current = await refreshAuthSession();
        if (!live) return;
        if (account.current && account.current !== current?.id) { setOrder(null); setShipping(emptyShipping); setApproved(false); setBusy(false); requestKey.current = { fingerprint: '', key: '' }; }
        account.current = current?.id || null;
        setUser(current);
        setAuthLoading(false);
        if (!current) router.replace(`/login?redirect=${encodeURIComponent(orderParam ? `/checkout?order=${orderParam}` : '/checkout')}`);
      } catch { if (live) { setError('Your account could not be verified. Retry before continuing.'); setAuthLoading(false); } }
    };
    void sync();
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ user: AuthUser | null; status?: string }>).detail;
      if (detail?.status === 'loading') { setAuthLoading(true); return; }
      setAuthLoading(false);
      if (detail?.status === 'error') { setUser(null); setError('Your account could not be verified. Retry before continuing.'); return; }
      const next = detail?.user;
      if (next?.id === account.current) { setUser(next || null); return; }
      account.current = next?.id || null;
      setUser(next || null); setOrder(null); setShipping(emptyShipping); setApproved(false); setBusy(false);
      requestKey.current = { fingerprint: '', key: '' };
      if (!next) router.replace('/login?redirect=%2Fcheckout');
    };
    window.addEventListener('wishlyn-auth-change', changed);
    return () => { live = false; window.removeEventListener('wishlyn-auth-change', changed); };
  }, [router, orderParam, authRetry]);

  useEffect(() => {
    if (!user || !orderParam || order?.id === orderParam) return;
    const controller = new AbortController();
    const owner = user.id;
    commerceRequest<{ order: Purchase }>(`/api/orders/${encodeURIComponent(orderParam)}`, undefined, controller.signal)
      .then(result => { if (account.current === owner) { setOrder(result.order); setShipping(result.order.shipping); setApproved(false); } })
      .catch(error => { if (!controller.signal.aborted && account.current === owner) setError(message(error)); });
    return () => controller.abort();
  }, [user, orderParam, order?.id]);

  const lines = () => itemsRef.current.map(item => ({ variantId: item.variantId, quantity: item.quantity, giftWrap: item.giftWrap, giftMessage: item.giftMessage || '' }));
  const review = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setFields({}); setError('');
    let validShipping: ShippingAddress;
    try { validShipping = validateShipping(shipping); }
    catch (error) {
      if (error instanceof CheckoutValidationError) { setFields(error.fields); document.getElementById(Object.keys(error.fields)[0])?.focus(); }
      setError(message(error)); return;
    }
    setBusy(true);
    const owner = user.id;
    try {
      const payload = { items: lines(), shipping: validShipping };
      const fingerprint = JSON.stringify(payload);
      if (requestKey.current.fingerprint !== fingerprint) requestKey.current = { fingerprint, key: crypto.randomUUID() };
      const result = await commerceRequest<{ order: Purchase }>('/api/checkout/quote', { ...payload, requestKey: requestKey.current.key });
      if (account.current !== owner) return;
      setOrder(result.order); setApproved(false);
      router.replace(`/checkout?order=${result.order.id}`);
    } catch (error) {
      if (account.current !== owner) return;
      if (error instanceof CommerceRequestError && error.fields) setFields(error.fields);
      setError(message(error));
    } finally { if (account.current === owner) setBusy(false); }
  };

  const pay = async () => {
    if (!user || !order || !approved) return;
    setBusy(true); setError('');
    const owner = user.id, orderId = order.id;
    try {
      const Razorpay = await loadRazorpay();
      const data = await commerceRequest<{ key: string; amount: number; currency: string; providerOrderId: string }>('/api/create-order', { orderId });
      if (account.current !== owner) return;
      if (data.amount !== order.totalPaise || data.currency !== order.currency) throw new Error('Payment details changed. Reopen the order to review them.');
      const checkout = new Razorpay({
        key: data.key, amount: data.amount, currency: data.currency, order_id: data.providerOrderId,
        name: 'Wishlyn', description: `Order ${orderId}`,
        prefill: { name: `${order.shipping.firstName} ${order.shipping.lastName}`, email: user.email, contact: order.shipping.phone },
        theme: { color: '#3b312a' },
        modal: { ondismiss: () => { if (account.current === owner) { setBusy(false); setError('The payment window closed. Check this order before paying again.'); } } },
        handler: async proof => {
          if (account.current !== owner) return;
          try {
            const result = await commerceRequest<{ order: Purchase; verified: boolean }>('/api/verify-payment', { orderId, ...proof });
            if (account.current !== owner) return;
            setOrder(result.order);
            if (result.verified) {
              if (bagMatchesPurchase(lines(), result.order.items)) clearCart();
              router.push(`/orders/${orderId}`);
            } else setError('Your payment requires review. Open this order for its current status and support.');
          } catch { if (account.current === owner) setError('Payment status could not be confirmed. Your order reference is saved. Check the order before attempting another payment.'); }
          finally { if (account.current === owner) setBusy(false); }
        },
      });
      checkout.on('payment.failed', () => { if (account.current === owner) { setBusy(false); setError('Payment was not confirmed. Open this order to check its status before retrying.'); } });
      checkout.open();
    } catch (error) { if (account.current === owner) { setError(message(error)); setBusy(false); } }
  };

  const edit = async () => {
    if (!order || !user) return;
    const owner = user.id;
    setBusy(true); setError('');
    try {
      await commerceRequest(`/api/orders/${order.id}`, { action: 'cancel' });
      if (account.current !== owner) return;
      setOrder(null); setApproved(false); requestKey.current = { fingerprint: '', key: '' };
      router.replace('/checkout');
    } catch (error) { if (account.current === owner) setError(message(error)); }
    finally { if (account.current === owner) setBusy(false); }
  };

  const provisional = commerceTotals(Math.round(cartTotal * 100));
  const totals = order || provisional;
  const summaryLines = order?.items || cartItems.map(item => ({ variantId: item.variantId, productId: item.product.id, title: item.product.title, metalType: item.variant.metalType, purity: item.variant.purity, size: item.variant.size, quantity: item.quantity, giftWrap: item.giftWrap, giftMessage: item.giftMessage || '', lineTotalPaise: (Math.round(item.variant.price * 100) + (item.giftWrap ? GIFT_WRAP_PAISE : 0)) * item.quantity }));
  const addressFields = [
    { key: 'firstName', label: 'First name', auto: 'given-name', max: 80 },
    { key: 'lastName', label: 'Last name', auto: 'family-name', max: 80 },
    { key: 'phone', label: 'Mobile number', auto: 'tel', max: 20, type: 'tel' },
    { key: 'address', label: 'Street address', auto: 'street-address', max: 300 },
    { key: 'city', label: 'City', auto: 'address-level2', max: 80 },
    { key: 'zipCode', label: 'PIN code', auto: 'postal-code', max: 6 },
  ] as const;

  return <><Header /><main id="main-content" className={styles.page}><div className="container">
    <div className={styles.heading}><p>YOUR PURCHASE</p><h1>Checkout</h1><Link href="/orders">View saved orders</Link></div>
    {error && <div role="alert" className={styles.error}>{error}{order && <> <Link href={`/orders/${order.id}`}>Check order {order.id}</Link></>}</div>}
    {authLoading ? <p role="status">Verifying your account…</p> : !user ? <div><p>Sign in to continue with your purchase.</p><button className={styles.secondaryBtn} onClick={() => { setAuthLoading(true); setAuthRetry(value => value + 1); }}>Retry account check</button><Link href="/login?redirect=%2Fcheckout">Sign in</Link></div> :
      !cartItems.length && !order && !orderParam ? <div className={styles.emptyState}><p>Your bag is empty.</p><Link href="/" className={styles.homeLink}>Browse jewellery</Link></div> :
      orderParam && !order ? <p role="status">Loading your saved order. You can also find it in <Link href="/orders">your orders</Link>.</p> :
      <div className={styles.grid}><section className={styles.formPanel} aria-label="Delivery and payment">
        {!order ? <form onSubmit={review} noValidate><h2 className={styles.sectionTitle}>Delivery details</h2><p className={styles.note}>Account: {user.email}. Checkout currently supports India. Delivery eligibility and service policies must be confirmed for your destination.</p>
          <div className={styles.fieldRow}>{addressFields.map(field => <div className={styles.field} key={field.key}><label className={styles.label} htmlFor={field.key}>{field.label}</label><input className={styles.input} id={field.key} name={field.key} autoComplete={field.auto} type={'type' in field ? field.type : 'text'} inputMode={field.key === 'zipCode' ? 'numeric' : undefined} maxLength={field.max} required value={shipping[field.key]} onChange={event => setShipping(value => ({ ...value, [field.key]: event.target.value }))} aria-invalid={Boolean(fields[field.key])} aria-describedby={fields[field.key] ? `${field.key}-error` : undefined} />{fields[field.key] && <span className={styles.fieldError} id={`${field.key}-error`}>{fields[field.key]}</span>}</div>)}
          <div className={styles.field}><label className={styles.label} htmlFor="state">State / union territory</label><select className={styles.input} id="state" autoComplete="address-level1" value={shipping.state} onChange={event => setShipping(value => ({ ...value, state: event.target.value }))} aria-invalid={Boolean(fields.state)} aria-describedby={fields.state ? 'state-error' : undefined}><option value="">Choose your state</option>{INDIAN_STATES.map(state => <option key={state}>{state}</option>)}</select>{fields.state && <span id="state-error" className={styles.fieldError}>{fields.state}</span>}</div>
          <div className={styles.field}><label className={styles.label} htmlFor="country">Country</label><input id="country" className={styles.input} value="India" readOnly autoComplete="country-name" /></div></div>
          <div className={styles.btnRow}><Link href="/" className={styles.secondaryBtn}>Back to shop</Link><button className={styles.primaryBtn} disabled={busy}>{busy ? 'Checking prices and stock…' : 'Review current total'}</button></div></form> :
          <><h2 className={styles.sectionTitle}>Review your order</h2><p className={styles.reference}>Reference: <Link href={`/orders/${order.id}`}>{order.id}</Link></p>
            <address className={styles.address}>{order.shipping.firstName} {order.shipping.lastName}<br />{order.shipping.address}<br />{order.shipping.city}, {order.shipping.state} {order.shipping.zipCode}<br />{order.shipping.phone}</address>
            {order.status === 'pending_payment' ? <><p className={styles.note}>These prices and gift instructions are saved with your order. The stock reservation ends {new Date(order.expiresAt).toLocaleString('en-IN')}. Payment is confirmed only after verification.</p>
              {order.subtotalPaise !== provisional.subtotalPaise && <p className={styles.changed} role="status">The current catalogue total differs from your bag. Review the prices shown here before continuing.</p>}
              <label className={styles.approval}><input type="checkbox" checked={approved} onChange={event => setApproved(event.target.checked)} disabled={busy} />I have reviewed the delivery details, gift instructions and total of {formatMoney(order.totalPaise)}.</label>
              <div className={styles.btnRow}><button className={styles.secondaryBtn} onClick={edit} disabled={busy}>Cancel this quote and edit</button><button className={styles.primaryBtn} disabled={busy || !approved} onClick={pay}>{busy ? 'Opening or verifying payment…' : `Pay ${formatMoney(order.totalPaise)}`}</button></div>
              <p className={styles.note}>If payment is interrupted, open <Link href={`/orders/${order.id}`}>this saved order</Link> to check its status before trying again.</p></> : <p>This order is {order.status.replaceAll('_', ' ')}. <Link href={`/orders/${order.id}`}>Open its details and next steps</Link>.</p>}
          </>}
      </section><aside className={styles.summaryPanel} aria-label="Purchase summary"><div className={styles.summaryHeader}><h2>Purchase summary</h2></div><ul className={styles.summaryItems}>{summaryLines.map((line, index) => <li key={`${line.variantId}-${index}`} className={styles.summaryItem}><div className={styles.summaryItemInfo}><Link href={`/product/${line.productId}`} className={styles.summaryItemTitle}>{line.title}</Link><span className={styles.summaryItemMeta}>{line.metalType} · {line.purity}{line.size ? ` · Size ${line.size}` : ''} · Quantity {line.quantity}</span>{line.giftWrap && <span className={styles.summaryItemMeta}>Gift wrapping: {formatMoney(GIFT_WRAP_PAISE)} per piece{line.giftMessage ? ` · “${line.giftMessage}”` : ''}</span>}</div><span className={styles.summaryItemPrice}>{formatMoney(line.lineTotalPaise)}</span></li>)}</ul>
        <div className={styles.summaryFooter}><div className={styles.summaryRow}><span>Items and gift wrapping</span><span>{formatMoney(totals.subtotalPaise)}</span></div><div className={styles.summaryRow}><span>Shipping</span><span>{totals.shippingPaise ? formatMoney(totals.shippingPaise) : 'Included'}</span></div><div className={styles.summaryRow}><span>Tax ({TAX_RATE_PERCENT}%, rounded)</span><span>{formatMoney(totals.taxPaise)}</span></div><div className={styles.summaryTotal}><span>Total</span><span>{formatMoney(totals.totalPaise)}</span></div>{!order && <p className={styles.note}>Estimated from your bag. Current prices and available stock are checked before payment.</p>}<p className={styles.note}>Shipping is {formatMoney(SHIPPING_PAISE)} below {formatMoney(FREE_SHIPPING_THRESHOLD_PAISE)}; included at or above that subtotal. Gift wrapping is optional.</p></div></aside></div>}
  </div></main><Footer /></>;
}

export default function CheckoutPage() { return <Suspense fallback={<p role="status">Loading checkout…</p>}><Checkout /></Suspense>; }
