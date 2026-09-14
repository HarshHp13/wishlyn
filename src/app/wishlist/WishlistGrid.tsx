'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useWishlist } from '../../context/WishlistContext';
import { Product } from '../../data/db';
import ProductCard from '../../components/ProductCard';
import styles from './WishlistGrid.module.css';

export default function WishlistGrid() {
  const { wishlistItems, wishlistCount } = useWishlist();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (wishlistItems.length === 0) {
      setProducts([]);
      setLoading(false);
      return;
    }

    const fetchProducts = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/wishlist-products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productIds: wishlistItems }),
        });
        if (res.ok) {
          const data = await res.json();
          setProducts(data.products || []);
        }
      } catch (err) {
        console.error('[WishlistGrid] Failed to fetch wishlist products:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [wishlistItems]);

  return (
    <section className={styles.section}>
      <div className={`${styles.container} container`}>
        <div className={styles.header}>
          <h1 className={styles.title}>Your Wishlist</h1>
          <p className={styles.subtitle}>
            {wishlistCount > 0
              ? `${wishlistCount} item${wishlistCount !== 1 ? 's' : ''} you love`
              : 'Items you save will appear here'}
          </p>
        </div>

        {loading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Loading your wishlist...</p>
          </div>
        ) : products.length > 0 ? (
          <div className={styles.grid}>
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </div>
            <h2 className={styles.emptyTitle}>Your wishlist is empty</h2>
            <p className={styles.emptyText}>
              Browse our collections and tap the heart icon to save your favourite pieces.
            </p>
            <Link href="/" className={styles.shopBtn}>
              Explore Collections
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
