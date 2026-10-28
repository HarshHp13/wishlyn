import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { requireAdmin } from '@/lib/session';
import { ApiError, apiError, assertSameOrigin, readBody } from '@/lib/api';
import { rateLimit } from '@/lib/rateLimit';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const formats: Record<string, 'jpeg' | 'png' | 'webp'> = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAdmin(request);
    await rateLimit(request, { scope: 'upload', limit: 30, windowSeconds: 900, identity: user.id });
    const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const key = process.env.CLOUDINARY_API_KEY;
    const secret = process.env.CLOUDINARY_API_SECRET;
    if (!cloud || !/^[a-z0-9_-]+$/i.test(cloud) || cloud.includes('placeholder') || !key || !secret || key === secret || key.includes('placeholder') || secret.includes('placeholder')) {
      throw new ApiError(503, 'media_configuration', 'Product image uploads are not configured. Your product has not been saved.');
    }
    if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) throw new ApiError(415, 'content_type', 'Send an image upload.');
    const bytes = await readBody(request, MAX_FILE_SIZE + 65536);
    const form = await new Response(bytes as BodyInit, { headers: { 'content-type': request.headers.get('content-type')! } }).formData().catch(() => { throw new ApiError(400, 'invalid_upload', 'The image upload could not be read.'); });
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_FILE_SIZE || !formats[file.type]) throw new ApiError(400, 'invalid_image', 'Choose a JPEG, PNG or WebP image of at most 5 MB.');
    let image: Buffer;
    try {
      const input = sharp(await file.arrayBuffer(), { limitInputPixels: 20000000, animated: false, failOn: 'error' });
      const metadata = await input.metadata();
      if (metadata.format !== formats[file.type]) throw new Error('Image type mismatch.');
      image = await input.rotate().toFormat(formats[file.type]).toBuffer();
      if (image.length > MAX_FILE_SIZE) throw new Error('Decoded output is too large.');
    } catch { throw new ApiError(400, 'invalid_image', 'The image could not be processed. Choose a valid image with at most 20 million pixels.'); }
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHash('sha1').update(`timestamp=${timestamp}${secret}`).digest('hex');
    const body = new FormData();
    body.set('file', new Blob([new Uint8Array(image)], { type: file.type }), `product.${formats[file.type]}`);
    body.set('api_key', key); body.set('timestamp', String(timestamp)); body.set('signature', signature);
    const upstream = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body, signal: AbortSignal.timeout(15000) });
    const data = await upstream.json();
    if (!upstream.ok || typeof data.secure_url !== 'string' || !data.secure_url.startsWith(`https://res.cloudinary.com/${cloud}/image/upload/`)) throw new ApiError(502, 'media_unavailable', 'The image service could not complete the upload. Please retry.');
    return NextResponse.json({ url: data.secure_url }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}
