import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';
import pg from 'pg';
import { NextResponse } from 'next/server';
import { migrate } from '../../scripts/migrate.mjs';
import { query, closeDatabase } from '../../src/lib/database';
import { productInput, validateMerchantImages } from '../../src/lib/merchant/validation';
import { getMerchantProduct, listMerchantProducts, saveMerchantProduct } from '../../src/lib/merchant/service';
import { cataloguePage, catalogueVariants, catalogueProduct } from '../../src/lib/catalogue';
import { createPurchase, startPayment, applyPayment, getPurchase } from '../../src/lib/commerce/service';
import { productImage, isProductImageUrl } from '../../src/lib/productImages';
import { createSession, SESSION_COOKIE } from '../../src/lib/session';
import { GET, POST, PUT } from '../../src/app/api/admin/product/route';
import type { MerchantProduct } from '../../src/lib/merchant/types';
import type { PaymentGateway } from '../../src/lib/commerce/types';

const baseUrl = process.env.MERCHANT_TEST_DATABASE_URL;
const owner = { id: 'customer', email: 'customer@example.test' };
const address = { firstName: 'Asha', lastName: 'Fixture', phone: '9876543210', address: '123 Test Lane', city: 'Mumbai', state: 'Maharashtra', zipCode: '400001', country: 'India' };
function input() { return { requestKey: randomUUID(), title: 'Fixture ring', description: 'Synthetic steel ring', categoryId: 'rings', stone: '', dimensions: '', careInstructions: '', images: ['https://res.cloudinary.com/merchant-fixture/image/upload/v1/ring.png'], status: 'published', factsConfirmed: true, stockReason: 'Initial fixture delivery', variants: [{ metalType: 'Steel', purity: 'Gold plated', size: '7', price: 299.5, stockAdjustment: 5, active: true }] }; }
function edit(product: MerchantProduct) { return { ...product, stockReason: '', variants: product.variants.map(row => ({ id: row.id, metalType: row.metalType, purity: row.purity, size: row.size, price: row.price, stockAdjustment: 0, active: row.active })) }; }
async function quote(variantId: string) { return createPurchase(owner, { requestKey: randomUUID(), shipping: address, items: [{ variantId, quantity: 1, giftWrap: false, giftMessage: '' }] }); }
const provider: PaymentGateway = { keyId: 'test', createOrder: async order => ({ id: `order_${order.id.replaceAll('-', '')}`, receipt: order.id, amount: order.totalPaise, currency: 'INR' }), fetchPayment: async () => { throw new Error('No live provider'); }, fetchOrderPayments: async () => [], findOrdersByReceipt: async () => [] };

test('validation rejects arbitrary IDs, fractional stock, invalid prices, repeated options and publication without facts', () => {
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = 'merchant-fixture';
  const valid = input();
  assert.equal(productInput(valid, false).variants[0].size, '7');
  for (const overrides of [{ id: 'chosen-id' }, { images: [], status: 'published' }, { factsConfirmed: false }, { variants: [{ ...valid.variants[0], id: 'foreign' }] }, { variants: [{ ...valid.variants[0], stockAdjustment: 1.5 }] }, { variants: [{ ...valid.variants[0], price: 1.001 }] }, { variants: [valid.variants[0], valid.variants[0]] }, { stockReason: '' }]) assert.throws(() => productInput({ ...valid, ...overrides }, false));
  assert.equal(productInput({ ...valid, images: [], factsConfirmed: false, description: '', status: 'draft' }, false).status, 'draft');
});
test('configured media is shared with optimizer rules and unrelated new media is rejected', () => {
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = 'merchant-fixture';
  const image = input().images[0];
  validateMerchantImages([image]);
  assert.ok(isProductImageUrl(image));
  assert.ok(productImage(image).includes('/merchant-fixture/image/upload/f_auto'));
  assert.ok(isProductImageUrl('https://res.cloudinary.com/dk6aax1vi/image/upload/legacy.png'));
  for (const image of ['https://images.unsplash.com/photo-stock', '/hero_model.png', 'https://res.cloudinary.com/other-cloud/image/upload/product.png', 'https://res.cloudinary.com/merchant-fixture/image/upload/../../../other-cloud/product.png', 'https://res.cloudinary.com/merchant-fixture/image/upload/a?redirect=1']) assert.throws(() => validateMerchantImages([image]));
  validateMerchantImages(['https://images.unsplash.com/legacy-photo'], ['https://images.unsplash.com/legacy-photo']);
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = '../bad';
  assert.equal(isProductImageUrl('https://res.cloudinary.com/other-cloud/image/upload/product.png'), false);
  assert.throws(() => validateMerchantImages([image]));
});

describe('merchant PostgreSQL invariants', { skip: !baseUrl }, () => {
  let databaseUrl: string;
  let admin: pg.Client;
  let databaseName: string;
  before(async () => {
    const url = new URL(baseUrl!);
    assert.ok(['127.0.0.1','localhost'].includes(url.hostname));
    assert.match(url.pathname, /^\/wishlyn_.*test$/);
    databaseName = `wishlyn_merchant_${randomUUID().replaceAll('-', '')}_test`;
    admin = new pg.Client({ connectionString: url.toString() }); await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    url.pathname = `/${databaseName}`; databaseUrl = url.toString();
    process.env.DATABASE_URL = databaseUrl; process.env.DB_ALLOW_LOCAL_PLAINTEXT = 'true';
    Object.assign(process.env, { NODE_ENV: 'test', APP_ORIGIN: 'http://localhost:3144', NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: 'merchant-fixture' });
    const names = await migrate(databaseUrl, true);
    assert.ok(names.includes('004-merchant.sql')); assert.deepEqual(await migrate(databaseUrl, true), []);
  });
  beforeEach(async () => {
    await query('TRUNCATE commerce_order_events,commerce_reservations,commerce_orders,merchant_stock_events,product_variants,products,categories,profiles CASCADE');
    await query("INSERT INTO profiles(id,email,password_hash,role) VALUES('admin','admin@example.test','unused','admin'),('customer','customer@example.test','unused','customer')");
    await query("INSERT INTO categories(id,name,slug) VALUES('rings','Rings','rings')");
  });
  after(async () => { await closeDatabase(); if (admin) { await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`); await admin.end(); } });
  test('transactional create assigns IDs and preserves sized variants plus actor/reason stock history', async () => {
    const product = await saveMerchantProduct('admin', input());
    assert.match(product.id, /^fixture-ring-/); assert.match(product.variants[0].id, /^v-/);
    assert.equal(product.variants[0].size, '7'); assert.equal(product.variants[0].stock, 5);
    assert.equal(product.history[0].actorId, 'admin'); assert.equal(product.history[0].adjustment, 5);
    assert.equal(product.history[0].reason, 'Initial fixture delivery');
  });
  test('same create reference cannot duplicate products or initial stock after retry', async () => {
    const body = input();
    const products = await Promise.all([saveMerchantProduct('admin', body), saveMerchantProduct('admin', body)]);
    assert.equal(products[0].id, products[1].id);
    assert.equal((await query('SELECT * FROM merchant_stock_events')).rowCount, 1);
    await assert.rejects(saveMerchantProduct('admin', { ...body, title: 'Changed retry' }), /already saved/);
  });
  test('a cached create retry stays one coherent revision while a normal edit waits', async t => {
    const body = input();
    const product = await saveMerchantProduct('admin', body);
    const update = edit(product); update.title = 'Edited fixture title'; update.variants[0].price = 399;
    let observed = false, notify = () => {}, release = () => {};
    const readProduct = new Promise<void>(resolve => { notify = resolve; });
    const resume = new Promise<void>(resolve => { release = resolve; });
    type QueryCallback = (error: Error | null, result: pg.QueryResult) => void;
    type Execute = (this: pg.Client, statement: string, values?: unknown[] | QueryCallback, callback?: QueryCallback) => Promise<pg.QueryResult> | void;
    const execute = pg.Client.prototype.query as unknown as Execute;
    // All SQL remains real PostgreSQL; delay only delivery between the detail reads.
    t.mock.method(pg.Client.prototype, 'query', function(this: pg.Client, statement: string, values?: unknown[] | QueryCallback, callback?: QueryCallback) {
      // Pool.query uses callbacks; retain that driver contract unchanged.
      if (callback || typeof values === 'function') return execute.call(this, statement, values, callback);
      const pending = execute.call(this, statement, values) as Promise<pg.QueryResult>;
      return pending.then(async result => {
        if (!observed && statement === 'SELECT * FROM products WHERE id=$1' && values?.[0] === product.id) {
          observed = true; notify(); await resume;
        }
        return result;
      });
    });
    const retry = saveMerchantProduct('admin', body);
    let editing: Promise<MerchantProduct> | undefined;
    try {
      await readProduct;
      editing = saveMerchantProduct('admin', update, product.id);
      let waiting = false;
      for (let i = 0; i < 50; i++) {
        const rows = await query("SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query='SELECT * FROM products WHERE id=$1 FOR UPDATE'");
        if (rows.rowCount) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      release();
      const retried = await retry, edited = await editing;
      assert.equal(waiting, true);
      assert.deepEqual([retried.title, retried.revision, retried.variants[0].price], [product.title, 1, 299.5]);
      assert.deepEqual([edited.title, edited.revision, edited.variants[0].price], ['Edited fixture title', 2, 399]);
      assert.equal((await query('SELECT * FROM products')).rowCount, 1);
      assert.equal((await query('SELECT * FROM merchant_stock_events')).rowCount, 1);
    } finally { release(); await Promise.allSettled([retry, ...(editing ? [editing] : [])]); }
  });
  test('variant and stock-history write failures roll back the complete product aggregate', async () => {
    await query("CREATE FUNCTION reject_merchant_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$; CREATE TRIGGER reject_history BEFORE INSERT ON merchant_stock_events FOR EACH ROW EXECUTE FUNCTION reject_merchant_history()");
    await assert.rejects(saveMerchantProduct('admin', input()));
    assert.equal((await query('SELECT * FROM products')).rowCount, 0);
    assert.equal((await query('SELECT * FROM product_variants')).rowCount, 0);
    await query('DROP TRIGGER reject_history ON merchant_stock_events; DROP FUNCTION reject_merchant_history()');
    const product = await saveMerchantProduct('admin', input());
    await query("CREATE FUNCTION reject_merchant_variant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$; CREATE TRIGGER reject_variant BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION reject_merchant_variant()");
    await assert.rejects(saveMerchantProduct('admin', { ...edit(product), title: 'Must rollback' }, product.id));
    assert.equal((await getMerchantProduct(product.id)).title, product.title);
    assert.equal((await getMerchantProduct(product.id)).revision, product.revision);
    await query('DROP TRIGGER reject_variant ON product_variants; DROP FUNCTION reject_merchant_variant()');
  });
  test('foreign or omitted variant IDs fail without changing either product', async () => {
    const first = await saveMerchantProduct('admin', input()), second = await saveMerchantProduct('admin', input());
    const body = edit(first); body.variants[0].id = second.variants[0].id;
    await assert.rejects(saveMerchantProduct('admin', body, first.id), /does not belong/);
    await assert.rejects(saveMerchantProduct('admin', { ...edit(first), variants: [{ ...input().variants[0], stockAdjustment: 0 }] }, first.id), /Existing variants/);
    assert.equal((await getMerchantProduct(first.id)).revision, 1);
    assert.equal((await getMerchantProduct(second.id)).variants[0].stock, 5);
  });
  test('simultaneous stale merchant saves allow one revision and one stock adjustment', async () => {
    const product = await saveMerchantProduct('admin', input());
    const body = edit(product); body.variants[0].stockAdjustment = 2; body.stockReason = 'Delivery';
    const results = await Promise.allSettled([saveMerchantProduct('admin', body, product.id), saveMerchantProduct('admin', body, product.id)]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    const saved = await getMerchantProduct(product.id);
    assert.equal(saved.revision, 2); assert.equal(saved.variants[0].stock, 7); assert.equal(saved.history.length, 2);
  });
  test('reserved stock cannot be removed and a failed edit preserves title/revision/history', async () => {
    const product = await saveMerchantProduct('admin', input()); await quote(product.variants[0].id);
    const body = edit(product); body.title = 'Rejected'; body.variants[0].stockAdjustment = -5; body.stockReason = 'Count correction';
    await assert.rejects(saveMerchantProduct('admin', body, product.id), /reserved stock/);
    const saved = await getMerchantProduct(product.id);
    assert.equal(saved.revision, 1); assert.equal(saved.title, product.title); assert.equal(saved.variants[0].reservedStock, 1); assert.equal(saved.history.length, 1);
  });
  test('a form loaded before payment never restores sold stock, and later adjustments apply to current stock', async () => {
    const product = await saveMerchantProduct('admin', input()), order = await quote(product.variants[0].id);
    const started = await startPayment(order.id, owner.id, provider);
    await applyPayment({ id: 'pay_fixture', order_id: started.providerOrderId, amount: order.totalPaise, currency: 'INR', status: 'captured', captured: true, amount_refunded: 0 }, 'callback');
    const body = edit(product); body.variants[0].stockAdjustment = 2; body.stockReason = 'New delivery';
    const saved = await saveMerchantProduct('admin', body, product.id);
    assert.equal(saved.variants[0].stock, 6); assert.equal(saved.variants[0].reservedStock, 0); assert.equal(saved.history[0].stockBefore, 4);
  });
  test('archive preserves product/order identity, excludes browsing and blocks new quotes', async () => {
    const product = await saveMerchantProduct('admin', input()), order = await quote(product.variants[0].id);
    const archived = await saveMerchantProduct('admin', { ...edit(product), status: 'archived' }, product.id);
    assert.equal(archived.id, product.id); assert.equal(await catalogueProduct(product.id), null);
    await assert.rejects(quote(product.variants[0].id), /no longer available/);
    assert.equal((await getPurchase(order.id, owner.id)).items[0].title, product.title);
    assert.equal((await getMerchantProduct(product.id)).variants[0].reservedStock, 1);
  });
  test('quote waits for a product archive transaction and sees its committed status', async () => {
    const product = await saveMerchantProduct('admin', input());
    const blocker = new pg.Client({ connectionString: databaseUrl }); await blocker.connect(); await blocker.query('BEGIN');
    await blocker.query("UPDATE products SET status='archived' WHERE id=$1", [product.id]);
    const pending = quote(product.variants[0].id).then(() => 'unexpected', () => 'rejected');
    let waiting = false;
    for (let i = 0; i < 50; i++) { const rows = await query("SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM products WHERE id IN%'"); if (rows.rowCount) { waiting = true; break; } await new Promise(resolve => setTimeout(resolve, 20)); }
    await blocker.query('COMMIT'); await blocker.end();
    assert.equal(waiting, true); assert.equal(await pending, 'rejected'); assert.equal((await query('SELECT * FROM commerce_orders')).rowCount, 0);
  });
  test('quote captures a consistent product and price when editing concurrently', async () => {
    const product = await saveMerchantProduct('admin', input());
    const body = edit(product); body.title = 'New description'; body.variants[0].price = 399;
    const [order] = await Promise.all([quote(product.variants[0].id), saveMerchantProduct('admin', body, product.id)]);
    const pair = [order.items[0].title, order.items[0].unitPricePaise];
    assert.ok(JSON.stringify(pair) === JSON.stringify([product.title, 29950]) || JSON.stringify(pair) === JSON.stringify(['New description', 39900]));
  });
  test('disabled variants are excluded from offers/quotes while drafts remain editable', async () => {
    const body = input(); body.variants.push({ ...body.variants[0], size: '8', price: 599 });
    const product = await saveMerchantProduct('admin', body);
    const update = edit(product); update.variants.find(row => row.size === '7')!.active = false;
    await saveMerchantProduct('admin', update, product.id);
    const variants = await catalogueVariants(product.id); assert.equal(variants.length, 1); assert.equal(variants[0].size, '8');
    const page = await cataloguePage({ category: '', search: '', maxPrice: undefined, sort: 'newest', page: 1 }); assert.equal(Number(page.rows[0].base_price), 599);
    await assert.rejects(quote(product.variants.find(row => row.size === '7')!.id));
    const draft = await saveMerchantProduct('admin', { ...input(), status: 'draft', images: [], factsConfirmed: false });
    assert.equal((await getMerchantProduct(draft.id)).status, 'draft'); assert.equal(await catalogueProduct(draft.id), null);
  });
  test('bounded merchant search/filter and low-stock visibility reflect available stock', async () => {
    const product = await saveMerchantProduct('admin', input()); await quote(product.variants[0].id);
    const result = await listMerchantProducts({ search: 'Fixture', status: 'published', lowStock: true });
    assert.equal(result.products.length, 1); assert.equal(result.products[0].availableStock, 4); assert.equal(result.products[0].lowStock, true);
    assert.equal((await listMerchantProducts({ search: '%' })).products.length, 0);
  });
  test('routes enforce current admin authority, origin, bounded body and unambiguous errors', async () => {
    async function cookie(id: string) { const response = NextResponse.json({}); await createSession(id, response); return `${SESSION_COOKIE}=${response.cookies.get(SESSION_COOKIE)!.value}`; }
    const administrator = await cookie('admin'), customer = await cookie('customer');
    const make = (method: string, body?: unknown, auth = administrator, origin = 'http://localhost:3144') => new Request('http://localhost:3144/api/admin/product', { method, headers: { origin, cookie: auth, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.equal((await GET(make('GET', undefined, ''))).status, 401);
    assert.equal((await GET(make('GET', undefined, customer))).status, 403);
    assert.equal((await POST(make('POST', input(), administrator, 'https://evil.example'))).status, 403);
    assert.equal((await POST(make('POST', { text: 'x'.repeat(140000) }))).status, 413);
    for (const method of ['GET', 'POST']) {
      const stale = make(method, method === 'POST' ? input() : undefined);
      stale.headers.set('X-Wishlyn-Account-ID', 'other-admin');
      assert.equal((await (method === 'GET' ? GET(stale) : POST(stale))).status, 409);
    }
    assert.equal((await query('SELECT * FROM products')).rowCount, 0);
    const matching = make('POST', input()); matching.headers.set('X-Wishlyn-Account-ID', 'admin');
    const created = await POST(matching); assert.equal(created.status, 201);
    const createdData = await created.json(); assert.equal(createdData.viewerId, 'admin');
    const product = createdData.product as MerchantProduct;
    const saved = await PUT(make('PUT', { ...edit(product), title: 'Saved title' })); assert.equal(saved.status, 200);
    assert.equal((await PUT(make('PUT', edit(product)))).status, 409);
    await query("UPDATE profiles SET role='customer' WHERE id='admin'");
    assert.equal((await GET(make('GET'))).status, 401);
  });
});
