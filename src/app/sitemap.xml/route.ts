import { catalogueSize } from '../../lib/catalogue';
import { apiError } from '../../lib/api';
import { escapeXml, siteUrl, sitemapResponse } from '../../lib/seo';

export async function GET() {
  try {
    const chunks = Math.max(1, Math.ceil(await catalogueSize() / 5000));
    const entries = Array.from({ length: chunks }, (_, id) => `<sitemap><loc>${escapeXml(siteUrl(`/sitemaps/${id}.xml`))}</loc></sitemap>`).join('');
    return sitemapResponse(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`);
  } catch (error) { return apiError(error); }
}
