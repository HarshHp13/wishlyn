import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Your wishlist | Wishlyn', robots: { index: false, follow: false } };

import React from 'react';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import WishlistGrid from './WishlistGrid';

export default function WishlistPage() {
  return (
    <>
      <Header />
      <main id="main-content" style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <WishlistGrid />
      </main>
      <Footer />
    </>
  );
}
