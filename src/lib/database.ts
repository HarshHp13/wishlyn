import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { databaseConfig } from './databaseConfig.mjs';

let pool: Pool | undefined;
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ ...databaseConfig(process.env.DATABASE_URL, process.env), max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000, statement_timeout: 10000 });
    pool.on('error', () => console.error('[Database] Idle connection unavailable.'));
  }
  return pool;
}
export function query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>> { return getPool().query<T>(text, values); }
export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
}
export async function closeDatabase(): Promise<void> {
  const current = pool;
  pool = undefined;
  await current?.end();
}
