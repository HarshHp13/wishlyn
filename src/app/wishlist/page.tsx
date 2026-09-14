'use client';

import React from 'react';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import CartDrawer from '../../components/CartDrawer';
import WishlistGrid from './WishlistGrid';

export default function WishlistPage() {
  return (
    <>
      <Header />
      <main style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <WishlistGrid />
      </main>
      <CartDrawer />
      <Footer />
    </>
  );
}
