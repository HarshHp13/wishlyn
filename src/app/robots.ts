import type { MetadataRoute } from 'next';
import { siteUrl } from '../lib/seo';
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api', '/checkout', '/login', '/profile', '/orders', '/wishlist'] }, sitemap: siteUrl('/sitemap.xml') };
}
