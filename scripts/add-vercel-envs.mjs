import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env.local');

if (!fs.existsSync(envPath)) {
  console.error('❌ .env.local not found');
  process.exit(1);
}

const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
const envVars = {};

for (const line of envLines) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
    const eqIdx = trimmed.indexOf('=');
    const key = trimmed.substring(0, eqIdx).trim();
    const val = trimmed.substring(eqIdx + 1).trim();
    if (key && val) {
      envVars[key] = val;
    }
  }
}

console.log('🚀 Pushing environment variables to Vercel project...');

const environments = ['production', 'preview', 'development'];

for (const [key, val] of Object.entries(envVars)) {
  for (const env of environments) {
    try {
      console.log(`Setting ${key} (${env})...`);
      execSync(`npx vercel env add ${key} ${env} --force`, {
        input: val,
        encoding: 'utf8',
        stdio: ['pipe', 'ignore', 'ignore']
      });
    } catch (err) {
      // ignore if already added or fallback
    }
  }
}

console.log('✅ Finished adding environment variables to Vercel!');
