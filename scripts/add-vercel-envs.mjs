import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const allowed = new Set(['APP_ORIGIN', 'DATABASE_URL', 'DATABASE_CA_CERT', 'TRUSTED_CLIENT_IP_HEADER', 'NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'NEXT_PUBLIC_RAZORPAY_KEY_ID']);
const isolated = ['DATABASE_URL', 'CLOUDINARY_API_SECRET', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'];
export function planEnvironment(target, values, otherEnvironments = []) {
  if (!['development', 'preview', 'production'].includes(target) || values.WISHLYN_ENVIRONMENT !== target) throw new Error('Choose one matching explicit environment profile.');
  const entries = Object.entries(values).filter(([name]) => name !== 'WISHLYN_ENVIRONMENT');
  if (!entries.length || entries.some(([name, value]) => !allowed.has(name) || !value)) throw new Error('Environment profile contains empty or unsupported variables.');
  if (!values.DATABASE_URL || !values.APP_ORIGIN) throw new Error('Environment profile requires DATABASE_URL and APP_ORIGIN.');
  const origin = new URL(values.APP_ORIGIN);
  if (origin.origin !== values.APP_ORIGIN || (target !== 'development' && origin.protocol !== 'https:')) throw new Error('Use an exact HTTPS APP_ORIGIN for preview/production.');
  for (const other of otherEnvironments) for (const name of isolated) {
    if (values[name] && other[name] === values[name]) throw new Error('Credentials or database are shared with another local environment profile.');
  }
  if (values.RAZORPAY_KEY_ID && !values.RAZORPAY_KEY_ID.startsWith(target === 'production' ? 'rzp_live_' : 'rzp_test_')) throw new Error('Payment mode does not match the environment.');
  return entries.map(([key, value]) => ({ key, value, type: 'encrypted', target: [target] }));
}
async function main() {
  const args = process.argv.slice(2);
  const target = args[args.indexOf('--environment') + 1];
  const file = args[args.indexOf('--file') + 1];
  if (!args.includes('--environment') || !args.includes('--file') || path.basename(file) !== `.env.${target}`) throw new Error('Use --environment <target> --file .env.<target> [--apply].');
  const values = parseEnv(await readFile(file, 'utf8'));
  const others = [];
  for (const env of ['development', 'preview', 'production'].filter(env => env !== target)) {
    try { others.push(parseEnv(await readFile(path.join(path.dirname(file), `.env.${env}`), 'utf8'))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const plan = planEnvironment(target, values, others);
  console.log(`Environment: ${target}; keys: ${plan.map(v => v.key).join(', ')}. Values are redacted.`);
  if (!args.includes('--apply')) { console.log('Dry run only. No provider changes made.'); return; }
  const token = process.env.VERCEL_TOKEN;
  const project = process.env.VERCEL_PROJECT_ID;
  if (!token || !project || !/^[A-Za-z0-9_-]+$/.test(project)) throw new Error('Apply requires VERCEL_TOKEN and VERCEL_PROJECT_ID in the process environment.');
  const response = await fetch(`https://api.vercel.com/v10/projects/${project}/env?upsert=true`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(plan), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Provider rejected the update. Check project permissions and environment configuration.');
  console.log(`Updated ${target}. Verify the provider environment and deploy separately.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error('Environment sync failed. Check explicit target, profile isolation and provider configuration. Values/provider responses are not printed.'); process.exitCode = 1; });
