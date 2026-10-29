import pg from 'pg';
import { execFileSync } from 'node:child_process';
import { databaseConfig } from '../../src/lib/databaseConfig.mjs';

const url = process.env.INTEGRATION_TEST_DATABASE_URL;
if (!url) throw new Error('INTEGRATION_TEST_DATABASE_URL is required.');
const parsed = new URL(url);
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.pathname !== '/wishlyn_integration_browser_test') throw new Error('Refusing a non-disposable outage fixture.');
const client = new pg.Client(databaseConfig(url));
const browser = code => JSON.parse(execFileSync('playwright-cli', ['-s=wishlyn-completion', '--raw', 'run-code', code], { cwd: '/tmp', encoding: 'utf8', timeout: 60000 }));
await client.connect();
let renamed = false, before;
try {
  await client.query('ALTER TABLE products RENAME TO products_fixture_outage');
  renamed = true;
  before = browser(`async page => {
    await page.goto('http://localhost:3126/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Something went wrong', exact: true }).waitFor();
    return { url: page.url(), timeOrigin: await page.evaluate(() => performance.timeOrigin) };
  }`);
} finally {
  try { if (renamed) await client.query('ALTER TABLE products_fixture_outage RENAME TO products'); }
  finally { await client.end(); }
}
const after = browser(`async page => {
  await page.getByRole('button', { name: 'Try Again', exact: true }).click();
  await page.locator('#hero-title').waitFor();
  return { url: page.url(), timeOrigin: await page.evaluate(() => performance.timeOrigin), errorHeadings: await page.getByRole('heading', { name: 'Something went wrong', exact: true }).count() };
}`);
if (after.url !== before.url || after.timeOrigin !== before.timeOrigin || after.errorHeadings !== 0) throw new Error('Retry did not restore the same page without a full navigation.');
console.log(JSON.stringify({ status: 'PASS', outageBoundaryVisible: true, retryRestoresCatalogue: true, sameDocument: true, tableRestored: true, provenance: 'Temporary table rename only in guarded loopback wishlyn_integration_browser_test; guaranteed restoration; production Next retry action, no provider/customer operation' }));
