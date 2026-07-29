import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;

let dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of envLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('DATABASE_URL=') && !trimmed.startsWith('#')) {
        dbUrl = trimmed.replace('DATABASE_URL=', '').trim();
        break;
      }
    }
  }
}

if (!dbUrl) {
  console.error('❌ Error: DATABASE_URL is missing from environment and .env.local');
  process.exit(1);
}

console.log('🚀 Connecting to Neon PostgreSQL via pg Client for migration...');
const client = new Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

async function runMigration() {
  try {
    await client.connect();
    console.log('✅ Connected!');

    // Start a transaction
    await client.query('BEGIN');
    console.log('⚡ Beginning transaction...');

    // 1. Add price column to product_variants if it does not exist
    console.log('⚡ Adding price column to product_variants...');
    await client.query(`
      ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS price NUMERIC(10,2);
    `);

    // 2. Populate the price column by summing base_price and price_adjustment
    console.log('⚡ Migrating prices from base_price + price_adjustment...');
    await client.query(`
      UPDATE product_variants pv
      SET price = p.base_price + pv.price_adjustment
      FROM products p
      WHERE pv.product_id = p.id;
    `);

    // 3. Mark the price column as NOT NULL
    console.log('⚡ Setting price column to NOT NULL...');
    await client.query(`
      ALTER TABLE product_variants ALTER COLUMN price SET NOT NULL;
    `);

    // 4. Drop the base_price column from products
    console.log('⚡ Dropping base_price column from products...');
    await client.query(`
      ALTER TABLE products DROP COLUMN IF EXISTS base_price;
    `);

    // 5. Drop the price_adjustment column from product_variants
    console.log('⚡ Dropping price_adjustment column from product_variants...');
    await client.query(`
      ALTER TABLE product_variants DROP COLUMN IF EXISTS price_adjustment;
    `);

    // Commit transaction
    await client.query('COMMIT');
    console.log('🎉 Migration successful!');
    
    await client.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed, rolling back:', err);
    try {
      await client.query('ROLLBACK');
    } catch (e) {
      console.error('❌ Rollback failed:', e);
    }
    try {
      await client.end();
    } catch (e) {}
    process.exit(1);
  }
}

runMigration();
