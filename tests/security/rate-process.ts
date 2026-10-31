import { rateLimit } from '../../src/lib/rateLimit';
import { closeDatabase } from '../../src/lib/database';
async function main() {
  let allowed = 0; let denied = 0;
  for (let i = 0; i < 10; i++) {
    try { await rateLimit(new Request('http://localhost:3000'), { scope: process.argv[2], limit: 5, windowSeconds: 60, identity: 'same-client' }); allowed++; }
    catch (error) { if (error instanceof Error && 'status' in error && error.status === 429) denied++; else throw error; }
  }
  await closeDatabase(); console.log(JSON.stringify({ allowed, denied }));
}
void main();
