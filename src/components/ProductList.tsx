'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, SlidersHorizontal, X } from 'lucide-react';
import type { Product, Category } from '../data/db';
import { catalogueUrl, type CatalogueFilters } from '../lib/catalogue-filters';
import ProductCard from './ProductCard';
import styles from './ProductList.module.css';

interface Props { products: Product[]; categories: Category[]; filters: CatalogueFilters; total: number; pageSize: number }
export default function ProductList({ products, categories, filters, total, pageSize }: Props) {
  const router = useRouter();
  const [pending, transition] = useTransition();
  const navigate = (patch: Partial<CatalogueFilters>) => transition(() => router.push(catalogueUrl(filters, { ...patch, page: 1 }), { scroll: false }));
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <section className={styles.section} id="shop" aria-labelledby="shop-title" aria-busy={pending}>
    <div className="container">
      <div className={styles.heading}>
        <span className="eyebrow">FIND YOUR EVERYDAY FAVOURITES</span>
        <h2 id="shop-title">Meet your <em>everyday favourites.</em></h2>
        <p>Explore the pieces and details that suit you.</p>
      </div>
      {filters.search && <div className={styles.searchNotice}>Results for “{filters.search}” <Link href={catalogueUrl(filters, { search: '', page: 1 })} aria-label="Clear search"><X size={15} /> Clear search</Link></div>}
      <nav className={styles.categoriesBar} aria-label="Jewellery categories"><div className={styles.categoryList}>
        {[{ id: '', name: 'All jewellery' }, ...categories].map(category => <Link key={category.id} href={catalogueUrl(filters, { category: category.id, page: 1 })} scroll={false} aria-current={filters.category === category.id ? 'page' : undefined} className={`${styles.categoryTab} ${filters.category === category.id ? styles.activeTab : ''}`}>{category.name}</Link>)}
      </div></nav>
      <div className={styles.toolbar}>
        <span className={styles.resultCount} role="status">{pending ? 'Updating results…' : `${total} ${total === 1 ? 'piece' : 'pieces'}`}</span>
        <div className={styles.tools}>
          <details className={styles.priceFilter}>
            <summary><SlidersHorizontal size={14} /> Price {filters.maxPrice !== undefined && <span>· Up to ₹{filters.maxPrice.toLocaleString('en-IN')}</span>}</summary>
            <form className={styles.filterPanel} key={filters.maxPrice ?? 'all'} onSubmit={event => { event.preventDefault(); const raw = String(new FormData(event.currentTarget).get('maxPrice') || ''); navigate({ maxPrice: raw === '' ? undefined : Number(raw) }); }}>
              <label htmlFor="max-price">Maximum price (₹)</label>
              <input name="maxPrice" id="max-price" type="number" min="0" max="10000000" step="1" inputMode="numeric" defaultValue={filters.maxPrice} placeholder="Any price" />
              <button type="submit">Apply price</button>
              <Link href={catalogueUrl(filters, { maxPrice: undefined, page: 1 })} scroll={false}>Clear price limit</Link>
            </form>
          </details>
          <label className={styles.sortGroup} htmlFor="catalogue-sort">Sort by
            <select id="catalogue-sort" value={filters.sort} onChange={event => navigate({ sort: event.target.value as CatalogueFilters['sort'] })}>
              <option value="newest">Newest</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option>
            </select>
          </label>
        </div>
      </div>
      {products.length ? <>
        <div className={styles.grid}>{products.map(product => <ProductCard key={product.id} product={product} />)}</div>
        <nav className={styles.more} aria-label="Catalogue pages">
          <p>Showing {(filters.page - 1) * pageSize + 1}–{Math.min(filters.page * pageSize, total)} of {total} pieces</p>
          <div className={styles.pagination}>
            {filters.page > 1 && <Link href={catalogueUrl(filters, { page: filters.page - 1 })} rel="prev"><ArrowLeft size={16} /> Previous</Link>}
            <span>Page {filters.page} of {pages}</span>
            {filters.page < pages && <Link href={catalogueUrl(filters, { page: filters.page + 1 })} rel="next">Next pieces <ArrowRight size={16} /></Link>}
          </div>
        </nav>
      </> : <div className={styles.noResults}><h3>No pieces match these filters.</h3><p>Try a broader search, another category or a higher maximum price.</p><Link href="/#shop">Reset search and filters</Link></div>}
    </div>
  </section>;
}
