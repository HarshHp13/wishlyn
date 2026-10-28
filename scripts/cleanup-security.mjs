import pg from 'pg';
import { databaseConfig } from '../src/lib/databaseConfig.mjs';
if (!process.argv.includes('--apply')) {
  console.log('Dry run. Add --apply to remove expired sessions and request-budget rows.');
} else {
  const client = new pg.Client(databaseConfig(process.env.DATABASE_URL));
  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query('DELETE FROM auth_sessions WHERE expires_at < now()');
    await client.query('DELETE FROM request_budgets WHERE expires_at < now()');
    await client.query('COMMIT');
    console.log('Expired security records removed.');
  } catch { await client.query('ROLLBACK').catch(() => undefined); console.error('Security cleanup failed.'); process.exitCode = 1; }
  finally { await client.end(); }
}
