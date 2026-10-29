import pg from 'pg';
import bcrypt from 'bcryptjs';
import { migrate } from '../../scripts/migrate.mjs';
import { databaseConfig } from '../../src/lib/databaseConfig.mjs';

const url = process.env.INTEGRATION_TEST_DATABASE_URL;
if (!url) throw new Error('INTEGRATION_TEST_DATABASE_URL is required; no store database fallback.');
const parsed = new URL(url);
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.pathname !== '/wishlyn_integration_browser_test') throw new Error('Refusing non-disposable browser fixture database.');
await migrate(url, true);
const client = new pg.Client(databaseConfig(url));
await client.connect();
try {
  await client.query('BEGIN');
  await client.query('TRUNCATE profiles,categories,products,product_variants CASCADE');
  const password = await bcrypt.hash('BrowserFixture9!', 10);
  for (const [id, email, role] of [['browser-customer-a', 'browser-a@example.test', 'customer'], ['browser-customer-b', 'browser-b@example.test', 'customer'], ['browser-admin', 'browser-admin@example.test', 'admin']]) {
    await client.query('INSERT INTO profiles(id,email,password_hash,role) VALUES ($1,$2,$3,$4)', [id, email, password, role]);
  }
  await client.query("INSERT INTO categories(id,name,slug) VALUES ('earrings','Earrings','earrings')");
  await client.query("INSERT INTO products(id,title,description,category_id,images,status,stone,dimensions,care_instructions) VALUES ('browser-piece','Synthetic browser piece','Disposable integration fixture only','earrings',ARRAY['/editorial/gold-leaf.webp','/editorial/model-portrait.webp'],'published','Synthetic fixture','Fixture dimension','Fixture care information')");
  await client.query("INSERT INTO product_variants(id,product_id,metal_type,purity,size,price,stock) VALUES ('browser-variant-a','browser-piece','Fixture material','Option A','Small',199,10),('browser-variant-b','browser-piece','Fixture material','Option B','Large',299,10)");
  await client.query('COMMIT');
  console.log('Disposable browser fixture seeded: 3 synthetic accounts, 1 product, 2 variants. No provider operations.');
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { await client.end(); }
