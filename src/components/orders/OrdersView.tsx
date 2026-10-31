'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import MerchantNav from '@/components/admin/MerchantNav';
import { CommerceRequestError, commerceRequest, assertPurchaseOwner } from '@/lib/commerce/client';
import { getAuthState, getServerAuthState, subscribeAuth, refreshAuthSession, type AuthState } from '@/lib/authClient';
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
  const [owner, setOwner] = useState<string | null>(null);
  if (auth.status === 'authenticated' && auth.user && auth.user.id !== owner) setOwner(auth.user.id);
  if (auth.status === 'guest' && owner !== null) setOwner(null);
  useEffect(() => { void refreshAuthSession().catch(() => undefined); }, []);
  return <AccountOrders key={JSON.stringify([owner, admin, id])} auth={auth} admin={admin} id={id} />;
}

function AccountOrders({ auth, admin, id }: { auth: AuthState; admin: boolean; id?: string }) {
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const isCurrent = (owner: string) => active.current && getAuthState().status === 'authenticated' && getAuthState().user?.id === owner;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadedUser, setLoadedUser] = useState<AuthState['user']>(null);
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

  const ready = Boolean(requestKey && loadedKey === requestKey && loadedUser === auth.user && !loading);

  useEffect(() => {
    if (!requestKey || !auth.user) return;
    const key = requestKey;
    const owner = auth.user.id;
    const controller = new AbortController();
    commerceRequest<{ order?: Purchase; orders?: Purchase[]; nextOffset?: number | null }>(endpoint, owner, undefined, controller.signal)
      .then(data => {
        if (!admin) for (const purchase of data.order ? [data.order] : data.orders || []) assertPurchaseOwner(purchase, owner);
        if (!controller.signal.aborted && isCurrent(owner)) { setOrder(data.order || null); setOrders(data.orders || []); setNextOffset(data.nextOffset ?? null); setLoadedKey(key); setLoadedUser(auth.user); setLoading(false); setError(''); setUnauthenticated(false); }
      })
      .catch(error => { if (!controller.signal.aborted && isCurrent(owner)) { setOrder(null); setOrders([]); setNextOffset(null); setError(error instanceof Error ? error.message : 'Orders could not be loaded. Please retry.'); setUnauthenticated(error instanceof CommerceRequestError && error.status === 401); setLoadedKey(key); setLoadedUser(auth.user); setLoading(false); } });
    return () => controller.abort();
  }, [endpoint, revision, requestKey, auth.user, admin]);

  const reload = () => { setLoading(true); setError(''); setRevision(value => value + 1); };
  const action = async (payload: Record<string, unknown>) => {
    if (auth.status !== 'authenticated' || !auth.user || !ready || getAuthState().user !== loadedUser) return;
    const owner = auth.user.id;
    setBusy(true); setError('');
    try { await commerceRequest(endpoint, owner, payload); if (isCurrent(owner)) reload(); }
    catch (error) { if (isCurrent(owner)) setError(error instanceof Error ? error.message : 'The order update could not be confirmed. Refresh before retrying.'); }
    finally { if (active.current) setBusy(false); }
  };
  const nextFulfillment = order ? ({ unfulfilled: 'processing', processing: 'shipped', shipped: 'delivered', delivered: null } as const)[order.fulfillmentStatus] : null;

  return <><Header /><main id="main-content" className={styles.page}><div className="container">
    {!admin && <nav className={styles.nav} aria-label="Order navigation"><Link href="/profile">My account</Link>{id && <Link href={base}>All orders</Link>}<Link href="/">Shop</Link></nav>}
    {admin && <p className={styles.eyebrow}>STORE MANAGEMENT</p>}
    {admin && id && <Link className={styles.backLink} href={base}>← All orders</Link>}
    <h1>{id ? (admin ? 'Order workspace' : 'Your order') : (admin ? 'Orders and payment exceptions' : 'Your orders')}</h1>
    {admin && !id && <p className={styles.intro}>Review payments, prepare orders and keep every delivery moving.</p>}
    {admin && <MerchantNav active="orders" />}
    {ready && error && <div role="alert" className={styles.error}>{error} {unauthenticated ? <Link href={`/login?redirect=${encodeURIComponent(id ? `${base}/${id}` : base)}`}>Sign in</Link> : <button onClick={reload}>Retry loading</button>}</div>}
    {auth.status === 'loading' ? <p role="status">Verifying your account…</p> : auth.status === 'error' ? <div role="alert"><p>Your account could not be verified.</p><button onClick={() => { void refreshAuthSession().catch(() => undefined); }}>Retry account check</button></div> : auth.status === 'guest' ? <p><Link href={`/login?redirect=${encodeURIComponent(id ? `${base}/${id}` : base)}`}>Sign in to view orders</Link></p> : !ready ? <p role="status">Loading order details…</p> : id && order ? <>
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
      {!orders.length && !error ? <div className={styles.empty}><h2>{admin ? 'No orders in this view' : 'Your next favourite awaits'}</h2><p>{admin ? 'New orders will appear here. Try another payment status to find a purchase.' : <>Your orders will appear here once you make a purchase. <Link href="/">Continue shopping</Link>.</>}</p></div> : <ul className={styles.orderList}>{orders.map(order => <li key={order.id}><div><Link href={`${base}/${order.id}`}>{order.id}</Link><p>{new Date(order.createdAt).toLocaleDateString('en-IN')} · {statusLabel(order)} · {order.fulfillmentStatus}</p>{admin && <p>{order.email}</p>}</div><strong>{formatMoney(order.totalPaise)}</strong></li>)}</ul>}
      <nav className={styles.pagination} aria-label="Order pages">{offset > 0 && <button onClick={() => { setOffset(Math.max(0, offset - 20)); setLoading(true); }}>Previous orders</button>}{nextOffset !== null && <button onClick={() => { setOffset(nextOffset); setLoading(true); }}>More orders</button>}</nav>
    </>}
  </div></main><Footer /></>;
}
