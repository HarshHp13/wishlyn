import { getProductById, getVariantsByProductId, getRelatedProduct } from '../../../data/db';
import Header from '../../../components/Header';
import ProductDetail from '../../../components/ProductDetail';
import Footer from '../../../components/Footer';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

interface PageProps { params: Promise<{ id: string }> }
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const product = await getProductById(id);
  if (!product) return { title: 'Piece not found | Wishlyn', robots: { index: false } };
  return {
    title: `${product.title} | Wishlyn`, description: product.description,
    alternates: { canonical: `/product/${encodeURIComponent(id)}` },
    openGraph: { title: `${product.title} | Wishlyn`, description: product.description, images: product.images.length ? [{ url: product.images[0] }] : undefined },
  };
}
export default async function ProductPage({ params }: PageProps) {
  const { id } = await params;
  const product = await getProductById(id);
  if (!product) notFound();
  const [variants, related] = await Promise.all([getVariantsByProductId(product.id), getRelatedProduct(product.id, product.categoryId)]);
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://wishlyn.com';
  const structured = {
    '@context': 'https://schema.org', '@type': 'Product', name: product.title, description: product.description,
    image: product.images, sku: product.id, brand: { '@type': 'Brand', name: 'Wishlyn' },
    offers: variants.map(variant => ({ '@type': 'Offer', sku: variant.id, price: variant.price.toFixed(2), priceCurrency: 'INR', availability: variant.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: new URL(`/product/${encodeURIComponent(id)}`, origin).href })),
  };
  return <><Header /><main id="main-content" style={{ minHeight: '80vh' }}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }} />
    <ProductDetail key={product.id} product={product} initialVariants={variants} crossSellProduct={related} />
  </main><Footer /></>;
}
