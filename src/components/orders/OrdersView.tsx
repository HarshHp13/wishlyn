'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { CommerceRequestError, commerceRequest } from '@/lib/commerce/client';
import { getAuthState, getServerAuthState, subscribeAuth, refreshAuthSession } from '@/lib/authClient';
import { formatMoney } from '@/lib/commerce-rules';
import type { Purchase } from '@/lib/commerce/types';
import styles from './orders.module.css';

const statusLabel = (order: Purchase) => ({ pending_payment: 'Awaiting payment', paid: 'Payment confirmed', cancelled: 'Cancelled before confirmation', expired: 'Payment reservation expired', review_required: 'Payment needs review' })[order.status];
const descriptions = {
  pending_payment: 'This purchase is saved, but payment is not confirmed. Check payment status before attempting another payment.',
  paid: 'Payment and inventory have been recorded. Fulfillment progress appears below.',
  cancelled: 'This unpaid purchase was cancelled. If money was debited, check payment status and request support using this reference.',
  expired: 'The stock reservation ended. If money was debited, check payment status before placing another purchase.',
  review_required: 'A payment was received that needs staff review. This is not a confirmed fulfillment or refund. Use the support request for this order.',
};

export default function OrdersView({ admin = false, id }: { admin?: boolean; id?: string }) {
  const auth = useSyncExternalStore(subscribeAuth, getAuthState, getServerAuthState);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [orders, setOrders] = useState<Purchase[]>([]);
  const [order, setOrder] = useState<Purchase | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState('');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [unauthenticated, setUnauthenticated] = useState(false);
  const [shipment, setShipment] = useState({ trackingCarrier: '', trackingNumber: '', trackingUrl: '' });
  const base = admin ? '/admin/orders' : '/orders';
  const endpoint = `/api${base}${id ? `/${encodeURIComponent(id)}` : `?offset=${offset}${filter ? `&status=${filter}` : ''}`}`;

  const requestKey = auth.status === 'authenticated' && auth.user ? JSON.stringify([auth.user.id, auth.user.role, endpoint]) : null;

  useEffect(() => { void refreshAuthSession().catch(() => undefined); }, []);

  useEffect(() => {
    if (!requestKey) return;
    const key = requestKey;
    const controller = new AbortController();
    commerceRequest<{ order?: Purchase; orders?: Purchase[]; nextOffset?: number | null }>(endpoint, undefined, controller.signal)
      .then(data => { if (!controller.signal.aborted) { setOrder(data.order || null); setOrders(data.orders || []); setNextOffset(data.nextOffset ?? null); setLoadedKey(key); setLoading(false); setError(''); setUnauthenticated(false); } })
      .catch(error => { if (!controller.signal.aborted) { setOrder(null); setOrders([]); setNextOffset(null); setError(error instanceof Error ? error.message : 'Orders could not be loaded. Please retry.'); setUnauthenticated(error instanceof CommerceRequestError && error.status === 401); setLoadedKey(key); setLoading(false); } });
    return () => controller.abort();
  }, [endpoint, revision, requestKey]);

  const reload = () => { setLoading(true); setError(''); setRevision(value => value + 1); };
  const action = async (payload: Record<string, unknown>) => {
    setBusy(true); setError('');
    try { await commerceRequest(endpoint, payload); reload(); }
    catch (error) { setError(error instanceof Error ? error.message : 'The order update could not be confirmed. Refresh before retrying.'); }
    finally { setBusy(false); }
  };
  const nextFulfillment = order ? ({ unfulfilled: 'processing', processing: 'shipped', shipped: 'delivered', delivered: null } as const)[order.fulfillmentStatus] : null;

  return <><Header /><main id="main-content" className={styles.page}><div className="container">
    <nav className={styles.nav} aria-label="Order navigation"><Link href={admin ? '/admin' : '/profile'}>{admin ? 'Store administration' : 'My account'}</Link>{id && <Link href={base}>All orders</Link>}<Link href="/">Shop</Link></nav>
    <h1>{id ? (admin ? 'Order workspace' : 'Your order') : (admin ? 'Orders and payment exceptions' : 'Your orders')}</h1>
    {admin && !id && <p className={styles.intro}>Review payments, prepare confirmed purchases and record dispatch. Historical orders created before verified checkout are retained separately for a controlled migration.</p>}
    {requestKey && loadedKey === requestKey && error && <div role="alert" className={styles.error}>{error} {unauthenticated ? <Link href={`/login?redirect=${encodeURIComponent(id ? `${base}/${id}` : base)}`}>Sign in</Link> : <button onClick={reload}>Retry loading</button>}</div>}
    {auth.status === 'loading' ? <p role="status">Verifying your account…</p> : auth.status === 'error' ? <div role="alert"><p>Your account could not be verified.</p><button onClick={() => { void refreshAuthSession().catch(() => undefined); }}>Retry account check</button></div> : auth.status === 'guest' ? <p><Link href={`/login?redirect=${encodeURIComponent(id ? `${base}/${id}` : base)}`}>Sign in to view orders</Link></p> : loading || loadedKey !== requestKey ? <p role="status">Loading order details…</p> : id && order ? <>
      <div className={styles.heading}><div><p className={styles.reference}>{order.id}</p><h2>{statusLabel(order)}</h2><p>{descriptions[order.status]}</p></div><div className={styles.actions}>
        {(order.providerOrderId || order.paymentSetupState !== 'idle') && <button disabled={busy} onClick={() => action({ action: 'reconcile' })}>{busy ? 'Checking…' : 'Check payment status'}</button>}
        {!admin && order.status === 'pending_payment' && <><Link href={`/checkout?order=${order.id}`}>Review and pay</Link><button disabled={busy} onClick={() => action({ action: 'cancel' })}>Cancel unpaid order</button></>}
        {!admin && <Link href={`/support?order=${order.id}`}>Request help with this order</Link>}
        <button className={styles.print} onClick={() => window.print()}>Print order record</button>
      </div></div>
      <div className={styles.grid}><section className={styles.panel}><h2>{order.status === 'paid' ? 'Payment receipt' : 'Purchase record'}</h2><p className={styles.note}>Created {new Date(order.createdAt).toLocaleString('en-IN')}. This record is not a statutory tax invoice.</p><ul className={styles.items}>{order.items.map((item, index) => <li key={`${item.variantId}-${index}`}><div><Link href={`/product/${item.productId}`}>{item.title}</Link><p>{item.metalType} · {item.purity}{item.size ? ` · Size ${item.size}` : ''} · Quantity {item.quantity}</p><p>Item: {formatMoney(item.unitPricePaise)} per piece</p>{item.giftWrap && <p>Gift wrapping: {formatMoney(item.giftWrapPaise)} per piece{item.giftMessage ? ` · Message: “${item.giftMessage}”` : ' · No message'}</p>}</div><strong>{formatMoney(item.lineTotalPaise)}</strong></li>)}</ul><dl className={styles.totals}><div><dt>Items and gift wrapping</dt><dd>{formatMoney(order.subtotalPaise)}</dd></div><div><dt>Shipping</dt><dd>{formatMoney(order.shippingPaise)}</dd></div><div><dt>Tax</dt><dd>{formatMoney(order.taxPaise)}</dd></div><div><dt>Total</dt><dd>{formatMoney(order.totalPaise)}</dd></div></dl>{order.providerPaymentId && <p className={styles.reference}>Payment reference: {order.providerPaymentId}</p>}</section>
        <section className={styles.panel}><h2>Delivery and fulfillment</h2><p><strong>{order.fulfillmentStatus.replaceAll('_', ' ')}</strong></p><address>{order.shipping.firstName} {order.shipping.lastName}<br />{order.shipping.address}<br />{order.shipping.city}, {order.shipping.state} {order.shipping.zipCode}<br />{order.shipping.country}<br />{order.shipping.phone}<br />{order.email}</address>{order.trackingNumber && <p>{order.trackingCarrier}: {order.trackingNumber}{order.trackingUrl && <> · <a href={order.trackingUrl} target="_blank" rel="noopener noreferrer">Open carrier tracking</a></>}</p>}
          {admin && order.status === 'paid' && nextFulfillment && <form className={styles.form} onSubmit={event => { event.preventDefault(); void action({ action: 'fulfillment', fulfillmentStatus: nextFulfillment, ...shipment }); }}><h3>Next fulfillment step</h3>{nextFulfillment === 'shipped' && <>{([['trackingCarrier', 'Carrier', 80], ['trackingNumber', 'Tracking number', 120], ['trackingUrl', 'Tracking link (optional)', 500]] as const).map(([key, label, max]) => <label key={key} htmlFor={key}>{label}<input id={key} maxLength={max} required={key !== 'trackingUrl'} type={key === 'trackingUrl' ? 'url' : 'text'} value={shipment[key]} onChange={event => setShipment(value => ({ ...value, [key]: event.target.value }))} /></label>)}</>}<button disabled={busy}>{busy ? 'Saving…' : `Mark ${nextFulfillment}`}</button><p className={styles.note}>Record only completed operational actions. This does not book a carrier or issue a refund.</p></form>}
          {admin && order.status === 'review_required' && <p className={styles.error}>Reconcile the payment and contact the customer through the support workflow. Do not dispatch or tell the customer a refund has completed without provider evidence.</p>}
        </section></div>
      <section className={styles.panel}><h2>Order history</h2><ol className={styles.timeline}>{order.events?.map(event => <li key={event.id}><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString('en-IN')}</time><p>{event.message}</p></li>)}</ol></section>
    </> : !id && <>
      {admin && <label className={styles.filter} htmlFor="order-filter">Payment status<select id="order-filter" value={filter} onChange={event => { setFilter(event.target.value); setOffset(0); setLoading(true); }}><option value="">All orders</option><option value="review_required">Needs review</option><option value="paid">Confirmed payments</option><option value="pending_payment">Awaiting payment</option><option value="expired">Expired reservations</option><option value="cancelled">Cancelled purchases</option></select></label>}
      {!orders.length && !error ? <p>No orders match this view. <Link href="/">Continue shopping</Link>.</p> : <ul className={styles.orderList}>{orders.map(order => <li key={order.id}><div><Link href={`${base}/${order.id}`}>{order.id}</Link><p>{new Date(order.createdAt).toLocaleDateString('en-IN')} · {statusLabel(order)} · {order.fulfillmentStatus}</p>{admin && <p>{order.email}</p>}</div><strong>{formatMoney(order.totalPaise)}</strong></li>)}</ul>}
      <nav className={styles.pagination} aria-label="Order pages">{offset > 0 && <button onClick={() => { setOffset(Math.max(0, offset - 20)); setLoading(true); }}>Previous orders</button>}{nextOffset !== null && <button onClick={() => { setOffset(nextOffset); setLoading(true); }}>More orders</button>}</nav>
    </>}
  </div></main><Footer /></>;
}
