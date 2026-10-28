import type { MetadataRoute } from 'next';
import { catalogueSize } from '../lib/catalogue';

export const dynamic = 'force-dynamic';
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://wishlyn.com';
  const chunks = Math.max(1, Math.ceil(await catalogueSize() / 5000));
  return { rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api', '/checkout', '/login', '/profile', '/orders', '/wishlist'] }, sitemap: Array.from({ length: chunks }, (_, id) => new URL(`/sitemap/${id}.xml`, origin).href) };
}
