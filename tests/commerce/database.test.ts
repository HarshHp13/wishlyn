import assert from 'node:assert/strict';
import { before, beforeEach, after, describe, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { query, transaction, closeDatabase } from '../../src/lib/database';
import { createPurchase, startPayment, applyPayment, getPurchase, cancelPurchase, expireReservations, reconcilePurchase, updateFulfillment } from '../../src/lib/commerce/service';
import type { GatewayPayment, PaymentGateway } from '../../src/lib/commerce/types';

const testUrl = process.env.COMMERCE_TEST_DATABASE_URL;
const address = { firstName: 'Asha', lastName: 'Fixture', phone: '9876543210', address: '123 Test Only Lane', city: 'Mumbai', state: 'Maharashtra', zipCode: '400001', country: 'India' };
const alice = { id: 'test-a', email: 'a@example.test' }, bob = { id: 'test-b', email: 'b@example.test' };
let counter = 0;
const payload = (items = [{ variantId: 'v1', quantity: 1, giftWrap: false, giftMessage: '' }]) => ({ items, shipping: address, requestKey: `fixture-request-${++counter}` });
function gateway(): PaymentGateway {
  return { keyId: 'test-only', createOrder: async order => ({ id: `order_${order.id.replaceAll('-', '')}`, receipt: order.id, amount: order.totalPaise, currency: 'INR' }), fetchPayment: async () => { throw new Error('No external payment access'); }, fetchOrderPayments: async () => [], findOrdersByReceipt: async () => [] };
}
async function prepare(owner = alice, items?: Parameters<typeof payload>[0]) {
  const order = await createPurchase(owner, payload(items));
  const started = await startPayment(order.id, owner.id, gateway());
  const payment: GatewayPayment = { id: `pay_${order.id.replaceAll('-', '')}`, order_id: started.providerOrderId, amount: order.totalPaise, currency: 'INR', status: 'captured', captured: true, amount_refunded: 0 };
  return { order, payment };
}
async function inventory(id = 'v1') { return (await query<{ stock: number; reserved_stock: number }>('SELECT stock,reserved_stock FROM product_variants WHERE id=$1', [id])).rows[0]; }

// Destructive fixtures are allowed only on this explicitly named loopback disposable database.
describe('commerce PostgreSQL transaction invariants', { skip: !testUrl }, () => {
  before(async () => {
    const url = new URL(testUrl!);
    assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
    assert.equal(url.pathname, '/wishlyn_test_commerce');
    process.env.DATABASE_URL = testUrl;
    process.env.DB_ALLOW_LOCAL_PLAINTEXT = 'true';
    process.env.NODE_ENV = 'test';
    await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await transaction(async client => {
      for (const name of ['001-initial.sql','002-identity.sql','003-commerce.sql']) await client.query(await readFile(new URL(`../../db/migrations/${name}`, import.meta.url), 'utf8'));
    });
  });
  beforeEach(async () => {
    await query('TRUNCATE commerce_order_events,commerce_reservations,commerce_orders,product_variants,products,categories,profiles CASCADE');
    await query("INSERT INTO profiles(id,email,password_hash,role) VALUES('test-a','a@example.test','unused','customer'),('test-b','b@example.test','unused','customer'),('test-admin','admin@example.test','unused','admin')");
    await query("INSERT INTO categories(id,name,slug) VALUES('test','Test','test')");
    await query("INSERT INTO products(id,title,description,category_id,images) VALUES('p1','Test piece','Fixture only','test','{}'),('p2','Second piece','Fixture only','test','{}')");
    await query("INSERT INTO product_variants(id,product_id,metal_type,purity,price,stock) VALUES('v1','p1','Steel','Plated',199,5),('v2','p2','Steel','Plated',299,5)");
  });
  after(async () => { await closeDatabase(); });

  test('authoritative totals ignore client amount/email and persist personalization snapshots', async () => {
    const body = payload([{ variantId: 'v1', quantity: 1, giftWrap: true, giftMessage: 'For A' }, { variantId: 'v1', quantity: 2, giftWrap: false, giftMessage: '' }]);
    const order = await createPurchase(alice, { ...body, amount: 1, email: bob.email });
    assert.equal(order.email, alice.email);
    assert.equal(order.subtotalPaise, 94_700);
    assert.equal(order.totalPaise, 122_500);
    assert.equal(order.items.length, 2);
    assert.equal(order.items.find(item => item.giftWrap)?.giftMessage, 'For A');
    assert.deepEqual(await inventory(), { stock: 5, reserved_stock: 3 });
    await query("UPDATE product_variants SET price=999 WHERE id='v1'");
    assert.equal((await getPurchase(order.id, alice.id)).totalPaise, order.totalPaise);
    await assert.rejects(query("UPDATE commerce_orders SET total_paise=1 WHERE id=$1", [order.id]));
  });
  test('invalid carts fail before any order or reservation is written', async () => {
    for (const quantity of [0, -1, 1.2, 100]) await assert.rejects(createPurchase(alice, payload([{ variantId: 'v1', quantity, giftWrap: false, giftMessage: '' }])));
    await assert.rejects(createPurchase(alice, payload([{ variantId: 'missing', quantity: 1, giftWrap: false, giftMessage: '' }])));
    assert.equal((await query('SELECT * FROM commerce_orders')).rowCount, 0);
    assert.deepEqual(await inventory(), { stock: 5, reserved_stock: 0 });
  });
  test('duplicate variant demand cannot exceed stock across different gift lines', async () => {
    await assert.rejects(createPurchase(alice, payload([{ variantId: 'v1', quantity: 3, giftWrap: true, giftMessage: 'A' }, { variantId: 'v1', quantity: 3, giftWrap: true, giftMessage: 'B' }])));
    assert.deepEqual(await inventory(), { stock: 5, reserved_stock: 0 });
  });
  test('concurrent last-unit purchases reserve only once', async () => {
    await query("UPDATE product_variants SET stock=1 WHERE id='v1'");
    const results = await Promise.allSettled([createPurchase(alice, payload()), createPurchase(bob, payload())]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((await query('SELECT * FROM commerce_orders')).rowCount, 1);
    assert.deepEqual(await inventory(), { stock: 1, reserved_stock: 1 });
  });
  test('same-key simultaneous retries return one immutable order', async () => {
    const body = payload();
    const results = await Promise.all([createPurchase(alice, body), createPurchase(alice, body), createPurchase(alice, body)]);
    assert.equal(new Set(results.map(order => order.id)).size, 1);
    assert.deepEqual(await inventory(), { stock: 5, reserved_stock: 1 });
    await assert.rejects(createPurchase(alice, { ...body, shipping: { ...address, city: 'Pune' } }));
  });
  test('provider creation serializes retries and never starts a different amount', async () => {
    const order = await createPurchase(alice, payload());
    let calls = 0;
    const provider = gateway();
    const original = provider.createOrder;
    provider.createOrder = async value => { calls++; await new Promise(resolve => setTimeout(resolve, 25)); return original(value); };
    const results = await Promise.allSettled([startPayment(order.id, alice.id, provider), startPayment(order.id, alice.id, provider)]);
    assert.equal(calls, 1); assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const retry = await startPayment(order.id, alice.id, provider);
    assert.equal(calls, 1); assert.equal(retry.amount, 45_500);
  });
  test('ambiguous provider creation cannot create a second provider order and reconciles by receipt', async () => {
    const order = await createPurchase(alice, payload());
    const provider = gateway();
    let calls = 0;
    const created = { id: 'order_ambiguous', amount: order.totalPaise, currency: 'INR', receipt: order.id };
    provider.createOrder = async () => { calls++; throw new Error('Injected timeout after provider acceptance'); };
    await assert.rejects(startPayment(order.id, alice.id, provider));
    await assert.rejects(startPayment(order.id, alice.id, provider));
    assert.equal(calls, 1);
    assert.equal((await getPurchase(order.id, alice.id)).paymentSetupState, 'uncertain');
    provider.findOrdersByReceipt = async () => [created];
    const recovered = await reconcilePurchase(order.id, alice.id, provider);
    assert.equal(recovered.providerOrderId, created.id);
    const retry = await startPayment(order.id, alice.id, provider);
    assert.equal(retry.providerOrderId, created.id); assert.equal(calls, 1);
  });
  test('duplicate callback/webhook/reconciliation commits payment and stock exactly once', async () => {
    const { order, payment } = await prepare();
    const results = await Promise.all([applyPayment(payment, 'callback'), applyPayment(payment, 'webhook'), applyPayment(payment, 'reconcile')]);
    assert.ok(results.every(order => order.status === 'paid'));
    assert.deepEqual(await inventory(), { stock: 4, reserved_stock: 0 });
    assert.equal((await query("SELECT * FROM commerce_order_events WHERE order_id=$1 AND type='paid'", [order.id])).rowCount, 1);
    await applyPayment(payment, 'callback');
    assert.deepEqual(await inventory(), { stock: 4, reserved_stock: 0 });
  });
  test('wrong amount/currency and uncaptured proof never fulfill', async () => {
    const { order, payment } = await prepare();
    for (const changes of [{ amount: 1 }, { currency: 'USD' }, { status: 'authorized', captured: false }]) await assert.rejects(applyPayment({ ...payment, ...changes }, 'callback'));
    assert.equal((await getPurchase(order.id, alice.id)).status, 'pending_payment');
    assert.deepEqual(await inventory(), { stock: 5, reserved_stock: 1 });
  });
  test('failed reservation step rolls back the order and earlier stock writes', async () => {
    await query("CREATE FUNCTION fail_second_reservation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='v2' THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_second_reservation BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION fail_second_reservation()");
    try { await assert.rejects(createPurchase(alice, payload([{ variantId: 'v1', quantity: 1, giftWrap: false, giftMessage: '' }, { variantId: 'v2', quantity: 1, giftWrap: false, giftMessage: '' }]))); }
    finally { await query('DROP TRIGGER fail_second_reservation ON product_variants; DROP FUNCTION fail_second_reservation()'); }
    assert.equal((await query('SELECT * FROM commerce_orders')).rowCount, 0);
    assert.deepEqual(await inventory(), { stock: 5, reserved_stock: 0 });
  });
  test('failed final persistence leaves a durable pending order and permits safe retry', async () => {
    const { order, payment } = await prepare();
    await query("CREATE FUNCTION fail_paid_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type='paid' THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_paid_event BEFORE INSERT ON commerce_order_events FOR EACH ROW EXECUTE FUNCTION fail_paid_event()");
    try { await assert.rejects(applyPayment(payment, 'callback')); }
    finally { await query('DROP TRIGGER fail_paid_event ON commerce_order_events; DROP FUNCTION fail_paid_event()'); }
    assert.equal((await getPurchase(order.id, alice.id)).status, 'pending_payment');
    assert.deepEqual(await inventory(), { stock: 5, reserved_stock: 1 });
    assert.equal((await applyPayment(payment, 'webhook')).status, 'paid');
    assert.deepEqual(await inventory(), { stock: 4, reserved_stock: 0 });
  });
  test('cancellation releases once, and late capture enters review without selling stock', async () => {
    const { order, payment } = await prepare();
    await Promise.all([cancelPurchase(order.id, alice.id), cancelPurchase(order.id, alice.id)]);
    assert.deepEqual(await inventory(), { stock: 5, reserved_stock: 0 });
    assert.equal((await applyPayment(payment, 'webhook')).status, 'review_required');
    await applyPayment(payment, 'webhook');
    assert.deepEqual(await inventory(), { stock: 5, reserved_stock: 0 });
  });
  test('expiry releases reservations once and late payment cannot oversell another buyer', async () => {
    await query("UPDATE product_variants SET stock=1 WHERE id='v1'");
    const { order, payment } = await prepare();
    const future = new Date(Date.now() + 16 * 60_000);
    await Promise.all([expireReservations(100, future), expireReservations(100, future)]);
    assert.equal((await getPurchase(order.id, alice.id)).status, 'expired');
    const second = await prepare(bob);
    await applyPayment(second.payment, 'callback');
    assert.equal((await applyPayment(payment, 'webhook', future)).status, 'review_required');
    assert.deepEqual(await inventory(), { stock: 0, reserved_stock: 0 });
  });
  test('closed browser recovery uses provider facts and durable order ownership', async () => {
    const { order, payment } = await prepare();
    await assert.rejects(getPurchase(order.id, bob.id), error => (error as { status?: number }).status === 404);
    await assert.rejects(startPayment(order.id, bob.id, gateway()));
    await assert.rejects(cancelPurchase(order.id, bob.id));
    const provider = gateway(); provider.fetchOrderPayments = async () => [payment];
    assert.equal((await reconcilePurchase(order.id, alice.id, provider)).status, 'paid');
    assert.equal((await getPurchase(order.id, alice.id)).providerPaymentId, payment.id);
  });
  test('extra capture or refund creates a review exception without a second inventory effect', async () => {
    const { order, payment } = await prepare();
    await applyPayment(payment, 'callback');
    assert.equal((await applyPayment({ ...payment, id: `${payment.id}extra` }, 'webhook')).status, 'review_required');
    assert.equal((await getPurchase(order.id, alice.id)).providerPaymentId, payment.id);
    assert.deepEqual(await inventory(), { stock: 4, reserved_stock: 0 });
  });
  test('refunded provider payment is not represented as successful fulfillment', async () => {
    const { order, payment } = await prepare();
    await applyPayment(payment, 'callback');
    const refund = { ...payment, status: 'refunded', amount_refunded: payment.amount };
    assert.equal((await applyPayment(refund, 'webhook')).status, 'review_required');
    assert.equal((await getPurchase(order.id, alice.id)).status, 'review_required');
    assert.deepEqual(await inventory(), { stock: 4, reserved_stock: 0 });
  });
  test('only paid orders can follow sequential tracked fulfillment', async () => {
    const { order, payment } = await prepare();
    await assert.rejects(updateFulfillment(order.id, 'test-admin', { fulfillmentStatus: 'processing' }));
    await applyPayment(payment, 'callback');
    await assert.rejects(updateFulfillment(order.id, 'test-admin', { fulfillmentStatus: 'delivered' }));
    await updateFulfillment(order.id, 'test-admin', { fulfillmentStatus: 'processing' });
    await assert.rejects(updateFulfillment(order.id, 'test-admin', { fulfillmentStatus: 'shipped', trackingCarrier: 'Fixture' }));
    await updateFulfillment(order.id, 'test-admin', { fulfillmentStatus: 'shipped', trackingCarrier: 'Fixture carrier', trackingNumber: 'TEST123', trackingUrl: 'https://example.test/track/TEST123' });
    const delivered = await updateFulfillment(order.id, 'test-admin', { fulfillmentStatus: 'delivered' });
    assert.equal(delivered.fulfillmentStatus, 'delivered'); assert.equal(delivered.trackingNumber, 'TEST123');
  });
  test('database constraints reject impossible inventory and preserve referenced variants', async () => {
    await assert.rejects(query("UPDATE product_variants SET stock=-1 WHERE id='v1'"));
    await assert.rejects(query("UPDATE product_variants SET reserved_stock=6 WHERE id='v1'"));
    await assert.rejects(query("UPDATE product_variants SET price=0 WHERE id='v1'"));
    await createPurchase(alice, payload());
    await assert.rejects(query("DELETE FROM product_variants WHERE id='v1'"));
  });
});
