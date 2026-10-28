// Kept as a safe compatibility entry point; bootstrap is schema-only.
import { migrate } from './migrate.mjs';
if (!process.argv.includes('--apply')) {
  console.error('Bootstrap is schema-only. Use npm run db:migrate -- --apply after reviewing the migration plan.');
  process.exitCode = 1;
} else {
  try { const names = await migrate(process.env.DATABASE_URL, true); console.log(`Applied schema migrations: ${names.join(', ') || 'none'}`); }
  catch { console.error('Bootstrap failed without committing changes. Check configuration and migration preconditions.'); process.exitCode = 1; }
}
