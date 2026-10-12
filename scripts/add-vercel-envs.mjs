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
      console.log(`Updating ${key} (${env})...`);
      // First remove if already exists so we can update cleanly
      try {
        execSync(`npx vercel env rm ${key} ${env} --yes`, {
          stdio: 'ignore'
        });
      } catch {
        // Variable may not exist yet, safe to proceed
      }

      // Add with the updated value piped in
      execSync(`npx vercel env add ${key} ${env}`, {
        input: val,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      console.log(`✅ Set ${key} (${env})`);
    } catch (err) {
      console.warn(`⚠️ Could not set ${key} for ${env}: ${err.stderr?.toString() || err.message}`);
    }
  }
}

console.log('✅ Finished adding environment variables to Vercel!');
