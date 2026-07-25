import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';

const { Client } = pg;

// Read .env.local
const envPath = path.join(process.cwd(), '.env.local');
const envVars = {};
if (fs.existsSync(envPath)) {
  const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of envLines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const eqIdx = trimmed.indexOf('=');
      const key = trimmed.substring(0, eqIdx).trim();
      const val = trimmed.substring(eqIdx + 1).trim();
      envVars[key] = val;
    }
  }
}

const cloudName = envVars.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'dk6aax1vi';
const apiKey = envVars.CLOUDINARY_API_KEY || '673336623865423';
const apiSecret = envVars.CLOUDINARY_API_SECRET || 'aTKeVJwmnXe9zUYf5SgLPJU0aBw';
const dbUrl = envVars.DATABASE_URL;

if (!dbUrl) {
  console.error('❌ DATABASE_URL is missing!');
  process.exit(1);
}

async function uploadFileToCloudinary(filePath, publicId) {
  const fileBuffer = fs.readFileSync(filePath);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const folder = 'wishlyn_products';

  // String to sign: folder=wishlyn_products&public_id=...&timestamp=... + secret
  const paramsToSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(paramsToSign).digest('hex');

  const formData = new FormData();
  const blob = new Blob([fileBuffer]);
  formData.append('file', blob, path.basename(filePath));
  formData.append('api_key', apiKey);
  formData.append('timestamp', timestamp);
  formData.append('folder', folder);
  formData.append('public_id', publicId);
  formData.append('signature', signature);

  console.log(`Uploading ${path.basename(filePath)} to Cloudinary...`);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || 'Cloudinary upload failed');
  }

  console.log(`✅ Uploaded ${path.basename(filePath)} -> ${data.secure_url}`);
  return data.secure_url;
}

async function run() {
  try {
    const pendantPath = path.join(process.cwd(), 'public', 'aura_evil_eye_pendant.png');
    const ringPath = path.join(process.cwd(), 'public', 'classic_rose_gold_ring.png');

    const pendantCloudinaryUrl = await uploadFileToCloudinary(pendantPath, 'aura_evil_eye_pendant');
    const ringCloudinaryUrl = await uploadFileToCloudinary(ringPath, 'classic_rose_gold_ring');

    console.log('🚀 Connecting to Neon DB to update image URLs...');
    const client = new Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
    });

    await client.connect();

    await client.query(
      `UPDATE products SET images = ARRAY[$1::text] WHERE id = 'aura-evil-eye-pendant'`,
      [pendantCloudinaryUrl]
    );

    await client.query(
      `UPDATE products SET images = ARRAY[$1::text] WHERE id = 'classic-rose-gold-ring'`,
      [ringCloudinaryUrl]
    );

    console.log('🎉 Successfully updated Neon PostgreSQL products with Cloudinary image URLs!');
    await client.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Upload Error:', err);
    process.exit(1);
  }
}

run();
