'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useWishlist } from '../../context/WishlistContext';
import type { Product } from '../../data/db';
import { validProduct } from '../../lib/shopping-state';
import ProductCard from '../../components/ProductCard';
import styles from './WishlistGrid.module.css';

function SavedProducts({ ids }: { ids: string[] }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; products: Product[] }>({ status: 'loading', products: [] });
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/api/wishlist-products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productIds: ids }), signal: controller.signal });
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.products) || !data.products.every(validProduct)) throw new Error('Unavailable');
        if (active) setState({ status: 'ready', products: data.products });
      } catch { if (active) setState({ status: 'error', products: [] }); }
      finally { clearTimeout(timeout); }
    })();
    return () => { active = false; controller.abort(); clearTimeout(timeout); };
  }, [ids, attempt]);
  if (state.status === 'loading') return <p role="status">Loading your saved pieces…</p>;
  if (state.status === 'error') return <div className={styles.emptyState}><p role="alert">We could not load your saved pieces. Your saved list has been kept.</p><button className={styles.shopBtn} onClick={() => { setState({ status: 'loading', products: [] }); setAttempt(value => value + 1); }}>Try again</button></div>;
  return <>{state.products.length < ids.length && <p role="status">Some saved pieces are no longer available in the catalogue.</p>}<div className={styles.grid}>{state.products.map(product => <ProductCard key={product.id} product={product} />)}</div><Link href="/#shop">Explore more jewellery</Link></>;
}
export default function WishlistGrid() {
  const { wishlistItems, wishlistCount, wishlistStatus, wishlistNotice, retryWishlist } = useWishlist();
  return <section className={styles.section}><div className={`${styles.container} container`}><div className={styles.header}><h1 className={styles.title}>Your wishlist</h1><p className={styles.subtitle}>{wishlistCount ? `${wishlistCount} saved ${wishlistCount === 1 ? 'piece' : 'pieces'}` : 'Save the pieces you want to revisit.'}</p></div>
    {wishlistNotice && <p role="status">{wishlistNotice}</p>}
    {wishlistStatus === 'loading' ? <p role="status">Loading your shopping session…</p> : wishlistStatus === 'error' ? <button className={styles.shopBtn} onClick={() => { void retryWishlist().catch(() => undefined); }}>Retry your session</button> : wishlistCount ? <SavedProducts key={JSON.stringify(wishlistItems)} ids={wishlistItems} /> : <div className={styles.emptyState}><h2 className={styles.emptyTitle}>Your wishlist is empty</h2><p className={styles.emptyText}>Select a heart on a piece to save it for later.</p><Link className={styles.shopBtn} href="/#shop">Browse jewellery</Link></div>}
  </div></section>;
}
