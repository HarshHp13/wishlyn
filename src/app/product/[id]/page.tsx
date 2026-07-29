import React from 'react';
import { getProductById, getVariantsByProductId, getProducts } from '../../../data/db';
import Header from '../../../components/Header';
import ProductDetail from '../../../components/ProductDetail';
import CartDrawer from '../../../components/CartDrawer';
import Footer from '../../../components/Footer';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const product = await getProductById(resolvedParams.id);
  
  if (!product) {
    return {
      title: 'Product Not Found | Wishlyn Fine Jewellery',
      description: 'The requested jewellery piece could not be found.',
    };
  }

  return {
    title: `${product.title} | Wishlyn Fine Jewellery`,
    description: product.description,
    openGraph: {
      title: `${product.title} | Wishlyn Fine Jewellery`,
      description: product.description,
      images: [{ url: product.images[0] }]
    }
  };
}

export default async function ProductPage({ params }: PageProps) {
  const resolvedParams = await params;
  const product = await getProductById(resolvedParams.id);

  if (!product) {
    notFound();
  }

  // F-8: Fetch variants on the server side to eliminate the client-side fetch waterfall
  // F-9: Fetch products from database to calculate real relevant cross-sell items
  const [variants, allProducts] = await Promise.all([
    getVariantsByProductId(product.id),
    getProducts()
  ]);

  // Find a product in the same category, or any other product
  const crossSellProduct = allProducts.find(p => p.id !== product.id && p.categoryId === product.categoryId) || 
                           allProducts.find(p => p.id !== product.id);

  return (
    <>
      <Header />
      <main style={{ minHeight: '80vh' }}>
        <ProductDetail product={product} initialVariants={variants} crossSellProduct={crossSellProduct} />
      </main>
      <CartDrawer />
      <Footer />
    </>
  );
}
