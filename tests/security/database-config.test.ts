import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { databaseConfig } from '../../src/lib/databaseConfig.mjs';
const base = 'postgresql://fixture:fixture@db.invalid/test';
test('all pg URL transport/host overrides and duplicate parameters fail before pg parses them', () => {
  for (const suffix of ['?ssl=0', '?ssl=true', '?ssl=no-verify', '?sslmode=require&ssl=0', '?sslmode=verify-full&ssl=0', '?ssl=1&ssl=0', '?sslmode=require&sslmode=disable', '?host=remote.invalid', '?hostaddr=127.0.0.1', '?port=9999', '?sslnegotiation=direct', '?sslrootcert=/tmp/cert', '?sslcert=/tmp/cert', '?sslkey=/tmp/key', '?uselibpqcompat=true', '?user=other', '?password=other', '?connectionString=ignored', '?options=-c%20ssl%3Doff']) {
    assert.throws(() => databaseConfig(`${base}${suffix}`, { NODE_ENV: 'production' }), /Unsupported|repeated/);
  }
  assert.throws(() => databaseConfig('postgresql://fixture:fixture@localhost/test?host=remote.invalid', { NODE_ENV: 'test', DB_ALLOW_LOCAL_PLAINTEXT: 'true' }), /Unsupported/);
});
test('effective pg options retain validated host/port and trusted CA without a second URL parse', () => {
  for (const suffix of ['', '?sslmode=require', '?sslmode=verify-full', '?sslmode=verify-ca&application_name=review']) {
    const config = databaseConfig(`${base}${suffix}`, { NODE_ENV: 'production', DATABASE_CA_CERT: 'synthetic-ca' });
    assert.equal('connectionString' in config, false);
    const client = new pg.Client(config);
    const effective = (client as unknown as { connectionParameters: { host: string; port: number; ssl: unknown; sslnegotiation: string } }).connectionParameters;
    assert.equal(effective.host, 'db.invalid'); assert.equal(effective.port, 5432);
    assert.deepEqual(effective.ssl, { rejectUnauthorized: true, ca: 'synthetic-ca' });
    assert.equal(effective.sslnegotiation, 'postgres');
  }
  const local = databaseConfig('postgresql://fixture:fixture@127.0.0.1:55441/test', { NODE_ENV: 'test', DB_ALLOW_LOCAL_PLAINTEXT: 'true' });
  assert.equal(local.ssl, false);
  const explicitTLS = databaseConfig('postgresql://fixture:fixture@127.0.0.1:55441/test?sslmode=require', { NODE_ENV: 'test', DB_ALLOW_LOCAL_PLAINTEXT: 'true' });
  assert.deepEqual(explicitTLS.ssl, { rejectUnauthorized: true });
});
