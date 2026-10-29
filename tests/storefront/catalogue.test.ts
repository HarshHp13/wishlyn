import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { query, closeDatabase } from '../../src/lib/database';
import { catalogueCategories, catalogueHighlights, cataloguePage, catalogueProduct, catalogueRelated, catalogueVariants } from '../../src/lib/catalogue';
import { POST as newsletter } from '../../src/app/api/newsletter/route';
import { POST as wishlist } from '../../src/app/api/wishlist-products/route';
import { migrate } from '../../scripts/migrate.mjs';

const configured = process.env.STOREFRONT_TEST_DATABASE_URL;
if (configured) {
  const url = new URL(configured);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.includes('storefront_test')) throw new Error('Refusing to mutate a non-disposable storefront test database.');
  process.env.DATABASE_URL = configured;
  process.env.DB_ALLOW_LOCAL_PLAINTEXT = 'true';
  process.env.APP_ORIGIN = 'http://localhost:3043';
}
const options = { skip: !configured };
before(async () => {
  if (!configured) return;
  await migrate(configured, true);
  await query("ALTER TABLE products ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published'");
  await query('ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS reserved_stock integer NOT NULL DEFAULT 0');
  await query("INSERT INTO categories(id,name,slug) VALUES ('earrings','Earrings','earrings'),('necklaces','Necklaces','necklaces'),('rings','Rings','rings') ON CONFLICT DO NOTHING");
  for (let index = 1; index <= 20; index++) {
    const id = `fixture-${String(index).padStart(2, '0')}`;
    await query("INSERT INTO products(id,title,description,category_id,images,status) VALUES ($1,$2,'Synthetic browser fixture',$3,$4,$5) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status", [id, `Fixture piece ${index}`, index > 10 ? 'necklaces' : 'earrings', ['/editorial/gold-leaf.webp', '/editorial/model-portrait.webp'], index === 20 ? 'draft' : 'published']);
    await query("INSERT INTO product_variants(id,product_id,metal_type,purity,price,stock,reserved_stock) VALUES ($1,$2,'Fixture material','18K plated',$3,5,2) ON CONFLICT(id) DO NOTHING", [`variant-${index}`, id, 100 + index]);
  }
  await query("INSERT INTO product_variants(id,product_id,metal_type,purity,price,stock,reserved_stock) VALUES ('variant-alt','fixture-01','Fixture material','24K plated',299,3,0) ON CONFLICT DO NOTHING");
});
after(async () => { await closeDatabase(); });

test('SQL catalogue pages are bounded and filter all rows before pagination', options, async () => {
  const result = await cataloguePage({ search: '', category: '', sort: 'price-low', page: 2 });
  assert.equal(result.rows.length, 8); assert.equal(result.total, 19); assert.equal(result.page, 2);
  assert.equal(Number(result.rows[0].base_price), 109);
  const filtered = await cataloguePage({ search: 'piece', category: 'necklaces', sort: 'price-high', maxPrice: 115, page: 1 });
  assert.equal(filtered.total, 5); assert.equal(filtered.rows[0].id, 'fixture-15');
  const literal = await cataloguePage({ search: '%', category: '', sort: 'newest', page: 1 });
  assert.equal(literal.total, 0);
});
test('unpublished products and empty categories are not advertised', options, async () => {
  assert.equal(await catalogueProduct('fixture-20'), null);
  assert.deepEqual((await catalogueCategories()).map(c => c.id), ['earrings', 'necklaces']);
  assert.equal((await catalogueHighlights()).length, 2);
  assert.equal((await catalogueRelated('fixture-01', 'earrings'))?.category_id, 'earrings');
});
test('public availability subtracts reservations and every purity SKU is returned', options, async () => {
  const variants = await catalogueVariants('fixture-01');
  assert.equal(variants.length, 2); assert.equal(variants.find(v => v.id === 'variant-1')?.stock, 3);
  assert.deepEqual(variants.map(v => v.purity).sort(), ['18K plated', '24K plated']);
});
const request = (body: unknown) => new Request('http://localhost:3043/api/newsletter', { method: 'POST', headers: { origin: 'http://localhost:3043', 'content-type': 'application/json' }, body: JSON.stringify(body) });
test('newsletter succeeds only after persistence and canonical duplicates stay idempotent', options, async () => {
  const email = `w3-${Date.now()}@fixture.invalid`;
  assert.equal((await newsletter(request({ email: ` ${email.toUpperCase()} ` }))).status, 200);
  assert.equal((await newsletter(request({ email }))).status, 200);
  assert.equal((await query('SELECT COUNT(*)::int AS count FROM newsletter_subscribers WHERE email=$1', [email])).rows[0].count, 1);
  await query("CREATE OR REPLACE FUNCTION storefront_reject_subscriber() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.email LIKE 'fail-%' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$");
  await query('CREATE TRIGGER storefront_subscriber_failure BEFORE INSERT ON newsletter_subscribers FOR EACH ROW EXECUTE FUNCTION storefront_reject_subscriber()');
  try {
    assert.equal((await newsletter(request({ email: `fail-${Date.now()}@fixture.invalid` }))).status, 503);
  } finally { await query('DROP TRIGGER storefront_subscriber_failure ON newsletter_subscribers'); await query('DROP FUNCTION storefront_reject_subscriber()'); }
});
test('wishlist API rejects malformed IDs and reports database outage instead of empty', options, async () => {
  assert.equal((await wishlist(request({ productIds: [null] }))).status, 400);
  const good = await wishlist(request({ productIds: ['fixture-01'] }));
  assert.equal(good.status, 200); assert.equal((await good.json()).products.length, 1);
  await query('ALTER TABLE products RENAME TO products_temporarily_unavailable');
  try {
    const unavailable = await wishlist(request({ productIds: ['fixture-01'] }));
    assert.equal(unavailable.status, 503);
    assert.equal((await unavailable.json()).code, 'unavailable');
  } finally { await query('ALTER TABLE products_temporarily_unavailable RENAME TO products'); }
});
