import { catalogueSize, catalogueSitemap } from '../../../lib/catalogue';
import { apiError } from '../../../lib/api';
import { escapeXml, siteUrl, sitemapResponse } from '../../../lib/seo';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!/^(0|[1-9]\d{0,6})\.xml$/.test(id)) return new Response('Not found', { status: 404 });
    const page = Number(id.slice(0, -4));
    const count = await catalogueSize();
    if (page >= Math.max(1, Math.ceil(count / 5000))) return new Response('Not found', { status: 404 });
    const rows = await catalogueSitemap(page * 5000);
    const paths = rows.map(product => `/product/${encodeURIComponent(product.id)}`);
    if (page === 0) paths.unshift('/');
    return sitemapResponse(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<url><loc>${escapeXml(siteUrl(path))}</loc></url>`).join('')}</urlset>`);
  } catch (error) { return apiError(error); }
}
