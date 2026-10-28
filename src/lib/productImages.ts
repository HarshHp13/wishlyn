/** Resize large catalogue originals at their CDN before Next.js optimizes them. */
export function productImage(src?: string, width = 1000): string {
  if (!src) return '/hero_jewellery_collection.png';
  const prefix = 'https://res.cloudinary.com/dk6aax1vi/image/upload/';
  if (!src.startsWith(prefix)) return src;
  return `${prefix}f_auto,q_auto,c_limit,w_${width}/${src.slice(prefix.length)}`;
}
