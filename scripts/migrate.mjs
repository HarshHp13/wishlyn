import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import { databaseConfig } from '../src/lib/databaseConfig.mjs';

export async function migrate(connectionString, apply = false) {
  const client = new pg.Client({ ...databaseConfig(connectionString), connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(194326, 1)");
    const exists = await client.query("SELECT to_regclass('public.schema_migrations') AS name");
    const applied = exists.rows[0].name ? (await client.query('SELECT name, checksum FROM schema_migrations')).rows : [];
    const folder = fileURLToPath(new URL('../db/migrations/', import.meta.url));
    const files = (await readdir(folder)).filter(f => /^\d{3}-[a-z0-9-]+\.sql$/.test(f)).sort();
    if (applied.some(row => !files.includes(row.name))) throw new Error('Unknown migration history.');
    const pending = [];
    for (const name of files) {
      const source = await readFile(path.join(folder, name), 'utf8');
      const checksum = createHash('sha256').update(source).digest('hex');
      const previous = applied.find(row => row.name === name);
      if (previous && previous.checksum !== checksum) throw new Error('Applied migration checksum changed.');
      if (!previous) pending.push({ name, source, checksum });
    }
    if (apply) {
      await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
      for (const migration of pending) {
        await client.query(migration.source);
        await client.query('INSERT INTO schema_migrations(name, checksum) VALUES ($1,$2)', [migration.name, migration.checksum]);
      }
      await client.query('COMMIT');
    } else await client.query('ROLLBACK');
    return pending.map(m => m.name);
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
  finally { await client.end(); }
}
async function main() {
  try {
    const apply = process.argv.includes('--apply');
    const names = await migrate(process.env.DATABASE_URL, apply);
    console.log(`${apply ? 'Applied' : 'Pending (read-only check)'} migrations: ${names.join(', ') || 'none'}`);
  } catch { console.error('Migration failed. No transaction changes committed. Check schema preconditions, configuration and migration history; database details are intentionally not printed.'); process.exitCode = 1; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
