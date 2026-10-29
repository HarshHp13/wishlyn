/** Must match the Cloudinary entries in next.config.ts; NEXT_PUBLIC is fixed at build time. */
export function productImageClouds(): string[] {
  const configured = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  return [...new Set(['dk6aax1vi', ...(configured && /^[a-z0-9_-]+$/i.test(configured) ? [configured] : [])])];
}
/** Keep image sources within the origins configured for Next image optimization. */
export function isProductImageUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  if (/^\/(?!\/)/.test(value)) return /\.(avif|gif|jpe?g|png|svg|webp)(?:\?.*)?$/i.test(value);
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    return url.hostname === 'images.unsplash.com' ||
      (url.hostname === 'res.cloudinary.com' && productImageClouds().some(cloud => url.pathname.startsWith(`/${cloud}/`))) ||
      (url.hostname === 'zvlywywbsicbvukuqozb.supabase.co' && url.pathname.startsWith('/storage/'));
  } catch { return false; }
}

/** Resize trusted Cloudinary originals before the Next optimizer. */
export function productImage(src?: string, width = 1000): string {
  if (!isProductImageUrl(src)) return '/product-image-unavailable.svg';
  const prefix = productImageClouds().map(cloud => `https://res.cloudinary.com/${cloud}/image/upload/`).find(prefix => src.startsWith(prefix));
  if (!prefix) return src;
  return `${prefix}f_auto,q_auto,c_limit,w_${Math.max(1, Math.min(2400, Math.round(width)))}/${src.slice(prefix.length)}`;
}
