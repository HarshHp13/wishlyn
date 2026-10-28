import type { Metadata } from 'next';
import Header from '../components/Header';
import Hero from '../components/Hero';
import ProductList from '../components/ProductList';
import Footer from '../components/Footer';
import { BrandPromises, Collections, BrandStory } from '../components/Editorial';
import { getCataloguePage, getCatalogueHighlights, getCategories } from '../data/db';
import { parseCatalogueFilters, type QueryValues } from '../lib/catalogue-filters';

interface PageProps { searchParams: Promise<QueryValues> }
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const query = await searchParams;
  const filtered = !!(query.search || query.category || query.maxPrice || query.sort || query.page);
  return { title: 'Wishlyn | Jewellery for every version of you', alternates: { canonical: '/' }, robots: filtered ? { index: false, follow: true } : { index: true, follow: true } };
}
export default async function Home({ searchParams }: PageProps) {
  const filters = parseCatalogueFilters(await searchParams);
  const [result, highlights, categories] = await Promise.all([getCataloguePage(filters), getCatalogueHighlights(), getCategories()]);
  return <><Header /><main id="main-content">
    <Hero featuredProduct={highlights[0]} /><BrandPromises />
    <Collections categories={categories} products={highlights} />
    <ProductList products={result.products} categories={categories} filters={{ ...filters, page: result.page }} total={result.total} pageSize={result.pageSize} />
    <BrandStory />
  </main><Footer /></>;
}
