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

console.log('🚀 Connecting to Neon PostgreSQL via pg Client...');
const client = new Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

async function runSeed() {
  try {
    await client.connect();
    console.log('✅ Connected! Reading neon_seed.sql...');
    const seedSqlPath = path.join(process.cwd(), 'neon_seed.sql');
    const seedSql = fs.readFileSync(seedSqlPath, 'utf8');

    console.log('⚡ Executing neon_seed.sql...');
    await client.query(seedSql);

    console.log('⚡ Updating base prices & variants to INR...');
    await client.query(`
      UPDATE products SET base_price = 5727.00 WHERE id = 'aura-evil-eye-pendant';
      UPDATE products SET base_price = 20667.00 WHERE id = 'classic-rose-gold-ring';
      UPDATE product_variants SET price_adjustment = 2490.00 WHERE product_id = 'aura-evil-eye-pendant' AND metal_type IN ('18K Yellow Gold', '18K Rose Gold');
      UPDATE product_variants SET price_adjustment = 830.00 WHERE product_id = 'classic-rose-gold-ring' AND metal_type = '18K Yellow Gold';
      UPDATE product_variants SET price_adjustment = 9960.00 WHERE product_id = 'classic-rose-gold-ring' AND metal_type = 'Platinum';
    `);

    console.log('🎉 Successfully created all tables and seeded data in Neon PostgreSQL!');
    await client.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Database seed error:', err);
    try { await client.end(); } catch (e) {}
    process.exit(1);
  }
}

runSeed();
