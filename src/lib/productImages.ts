/** Keep image sources within the origins configured for Next image optimization. */
export function isProductImageUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  if (/^\/(?!\/)/.test(value)) return /\.(avif|gif|jpe?g|png|svg|webp)(?:\?.*)?$/i.test(value);
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    return url.hostname === 'images.unsplash.com' ||
      (url.hostname === 'res.cloudinary.com' && url.pathname.startsWith('/dk6aax1vi/')) ||
      (url.hostname === 'zvlywywbsicbvukuqozb.supabase.co' && url.pathname.startsWith('/storage/'));
  } catch { return false; }
}

/** Resize trusted Cloudinary originals before the Next optimizer. */
export function productImage(src?: string, width = 1000): string {
  if (!isProductImageUrl(src)) return '/product-image-unavailable.svg';
  const prefix = 'https://res.cloudinary.com/dk6aax1vi/image/upload/';
  if (!src.startsWith(prefix)) return src;
  return `${prefix}f_auto,q_auto,c_limit,w_${Math.max(1, Math.min(2400, Math.round(width)))}/${src.slice(prefix.length)}`;
}
