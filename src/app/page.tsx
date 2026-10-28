import React from 'react';
import Header from '../components/Header';
import Hero from '../components/Hero';
import ProductList from '../components/ProductList';
import Footer from '../components/Footer';
import { BrandPromises, Collections, BrandStory } from '../components/Editorial';
import { getProducts, getCategories } from '../data/db';

interface PageProps {
  searchParams: Promise<{ search?: string; category?: string }>;
}

export default async function Home({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  const searchTerm = resolvedParams.search || '';

  // F-8: Fetch products and categories on the server side to completely avoid browser DB requests
  const [products, categories] = await Promise.all([
    getProducts(),
    getCategories()
  ]);

  return (
    <>
      <Header />
      <main id="main-content">
        <Hero featuredProduct={products.find(p => p.id.includes('golden-twist-drop')) || products[0]} />
        <BrandPromises />
        <Collections categories={categories} products={products} />
        <ProductList key={`${resolvedParams.category || 'all'}:${searchTerm}`} initialProducts={products} initialCategories={categories} searchTerm={searchTerm} category={resolvedParams.category} />
        <BrandStory product={products.find(p => p.id.includes('golden-textured-leaf'))} />
      </main>
      <Footer />
    </>
  );
}
