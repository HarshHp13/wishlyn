import type { MetadataRoute } from 'next';
import { catalogueSize, catalogueSitemap } from '../lib/catalogue';

export const dynamic = 'force-dynamic';
export async function generateSitemaps() {
  const count = await catalogueSize();
  return Array.from({ length: Math.max(1, Math.ceil(count / 5000)) }, (_, id) => ({ id }));
}
export default async function sitemap({ id }: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const page = Number(await id);
  if (!Number.isSafeInteger(page) || page < 0) return [];
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://wishlyn.com';
  const products = await catalogueSitemap(page * 5000);
  const entries: MetadataRoute.Sitemap = products.map(product => ({ url: new URL(`/product/${encodeURIComponent(product.id)}`, origin).href }));
  return page === 0 ? [{ url: new URL('/', origin).href }, ...entries] : entries;
}
