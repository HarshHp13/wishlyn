// Offline configuration inspection only: no connect(), queries, or network calls.
// Run from the repository root:
// node --env-file=.env --env-file=.env.local docs/audits/2026-10-28/security/tls-option-check.mjs
import { Client } from 'pg';
import { writeFile } from 'node:fs/promises';

function inspect(connectionString) {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  const ssl = client.connectionParameters.ssl;
  return {
    tlsEnabled: Boolean(ssl),
    certificateVerificationExplicitlyDisabled:
      Boolean(ssl) && typeof ssl === 'object' && ssl.rejectUnauthorized === false,
  };
}

const result = {
  networkCalls: 0,
  databaseQueries: 0,
  mode: 'Construct pg.Client and inspect parsed options only; no connection is opened.',
  syntheticUrlWithoutSslOptions: inspect('postgresql://audit:fixture@127.0.0.1:65432/audit'),
  configuredLocalUrl: process.env.DATABASE_URL ? inspect(process.env.DATABASE_URL) : null,
  scope: 'Configured local environment only. URLs, usernames, passwords and hosts are not recorded.',
};
await writeFile(new URL('./tls-option-results.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
