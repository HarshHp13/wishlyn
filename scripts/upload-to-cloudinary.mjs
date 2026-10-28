import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';
import sharp from 'sharp';
import { databaseConfig } from '../src/lib/databaseConfig.mjs';

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes('--file')) throw new Error('Provide an approved JSON image manifest with --file; add --apply to execute.');
  const manifest = JSON.parse(await readFile(args[args.indexOf('--file') + 1], 'utf8'));
  if (!Array.isArray(manifest) || !manifest.length || manifest.length > 100 || manifest.some(row => !row || !/^[a-z0-9_-]{1,128}$/i.test(row.productId) || typeof row.file !== 'string')) throw new Error('Invalid image manifest.');
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !/^[a-z0-9_-]+$/i.test(cloud) || !key || !secret || key === secret || [cloud, key, secret].some(value => value.includes('placeholder'))) throw new Error('Explicit Cloudinary configuration is required.');
  const connection = databaseConfig(process.env.DATABASE_URL);
  for (const row of manifest) if ((await stat(row.file)).size > 5 * 1024 * 1024) throw new Error('Image exceeds 5 MB.');
  console.log(`Validated ${manifest.length} image entries. Credentials are not printed.`);
  if (!args.includes('--apply')) { console.log('Dry run: no database or provider requests.'); return; }
  const client = new pg.Client({ ...connection, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    const ids = [...new Set(manifest.map(row => row.productId))];
    const products = await client.query('SELECT id FROM products WHERE id = ANY($1)', [ids]);
    if (products.rowCount !== ids.length) throw new Error('Manifest references missing products.');
    const uploads = [];
    for (const row of manifest) {
      const image = await sharp(await readFile(row.file), { limitInputPixels: 20000000 }).rotate().webp().toBuffer();
      if (image.length > 5 * 1024 * 1024) throw new Error('Processed image exceeds 5 MB.');
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = createHash('sha1').update(`timestamp=${timestamp}${secret}`).digest('hex');
      const body = new FormData();
      body.set('file', new Blob([image], { type: 'image/webp' }), path.basename(row.file));
      body.set('api_key', key); body.set('timestamp', String(timestamp)); body.set('signature', signature);
      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body, signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok || typeof data.secure_url !== 'string' || !data.secure_url.startsWith(`https://res.cloudinary.com/${cloud}/image/upload/`)) throw new Error('Image provider rejected upload.');
      uploads.push({ id: row.productId, url: data.secure_url });
    }
    await client.query('BEGIN');
    for (const image of uploads) {
      const result = await client.query('UPDATE products SET images = CASE WHEN $1 = ANY(images) THEN images ELSE array_prepend($1, images) END WHERE id = $2', [image.url, image.id]);
      if (result.rowCount !== 1) throw new Error('A product changed during upload.');
    }
    await client.query('COMMIT');
    console.log('Uploaded images and updated the approved products.');
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
  finally { await client.end(); }
}
main().catch(() => { console.error('Image import failed. Check manifest/configuration. Database changes were rolled back; provider assets uploaded before a failure may require manual review.'); process.exitCode = 1; });
