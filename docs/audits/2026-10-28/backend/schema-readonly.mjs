// Read-only configured-database metadata and aggregate catalogue counts; no profile/order contents.
// node --env-file=.env --env-file=.env.local docs/audits/2026-10-28/backend/schema-readonly.mjs
import {neon} from '@neondatabase/serverless';
import fs from 'node:fs/promises';
const sql=neon(process.env.DATABASE_URL);
const [columns,constraints,indexes,triggers,catalog]=await Promise.all([
 sql`SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('products','product_variants','categories','orders','profiles','newsletter_subscribers') ORDER BY table_name,ordinal_position`,
 sql`SELECT c.relname AS table_name, con.conname AS constraint_name, con.contype AS type, pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('product_variants','orders','profiles') ORDER BY c.relname,con.conname`,
 sql`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('orders','profiles','product_variants','products') ORDER BY tablename,indexname`,
 sql`SELECT c.relname AS table_name,t.tgname AS trigger_name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('orders','product_variants','profiles') AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,
 sql`SELECT (SELECT COUNT(*) FROM products) AS product_count, (SELECT COUNT(*) FROM product_variants) AS variant_count, (SELECT COUNT(*) FROM products p WHERE NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id=p.id)) AS products_without_variants, (SELECT COUNT(*) FROM product_variants WHERE price<=0) AS non_positive_prices, (SELECT COUNT(*) FROM product_variants WHERE stock<0) AS negative_stock`
]);
const report={observedAt:new Date().toISOString(),scope:'Database configured in local .env/.env.local; not independently established as production. Read-only metadata and aggregate catalogue counts. No user/order records.',columns,constraints,indexes,triggers,catalog};
await fs.writeFile('docs/audits/2026-10-28/backend/schema-snapshot.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({tables:[...new Set(columns.map(r=>r.table_name))],orderConstraints:constraints.filter(r=>r.table_name==='orders'),variantCheckConstraints:constraints.filter(r=>r.table_name==='product_variants'&&r.type==='c'),triggers,catalog},null,2));
