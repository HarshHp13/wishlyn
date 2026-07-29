import React from 'react';
import Header from '../components/Header';
import Hero from '../components/Hero';
import ProductList from '../components/ProductList';
import CartDrawer from '../components/CartDrawer';
import Footer from '../components/Footer';
import { getProducts, getCategories } from '../data/db';

interface PageProps {
  searchParams: Promise<{ search?: string }>;
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
      <main style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <Hero />
        <ProductList initialProducts={products} initialCategories={categories} searchTerm={searchTerm} />
      </main>
      <CartDrawer />
      <Footer />
    </>
  );
}
