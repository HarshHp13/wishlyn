'use client';

import React, { useState, useMemo } from 'react';
import { Product, Category } from '../data/db';
import ProductCard from './ProductCard';
import styles from './ProductList.module.css';

interface ProductListProps {
  initialProducts: Product[];
  initialCategories: Category[];
  searchTerm?: string;
}

export const ProductList: React.FC<ProductListProps> = ({
  initialProducts,
  initialCategories,
  searchTerm = ''
}) => {
  const [products] = useState<Product[]>(initialProducts);
  const [categories] = useState<Category[]>(initialCategories);
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedSort, setSelectedSort] = useState('featured');
  const [maxPrice, setMaxPrice] = useState<number>(50000);

  const displayCategories = useMemo(() => {
    const cleanCategories = categories.filter(c => c.id !== 'all');
    return [{ id: 'all', name: 'All Collections', slug: 'all' } as Category, ...cleanCategories];
  }, [categories]);

  // Filter products based on category, search term, and price
  const filteredProducts = useMemo(() => {
    return products
      .filter((product) => {
        const matchesCategory = activeCategory === 'all' || product.categoryId === activeCategory;
        const matchesSearch = product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.description.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesPrice = product.basePrice <= maxPrice;
        
        return matchesCategory && matchesSearch && matchesPrice;
      })
      .sort((a, b) => {
        if (selectedSort === 'price-low') {
          return a.basePrice - b.basePrice;
        }
        if (selectedSort === 'price-high') {
          return b.basePrice - a.basePrice;
        }
        if (selectedSort === 'rating') {
          return b.rating - a.rating;
        }
        return 0; // 'featured' (default order)
      });
  }, [products, activeCategory, searchTerm, maxPrice, selectedSort]);

  return (
    <section className={styles.section} id="shop">
      <div className="container">
        {/* Category Tabs Bar */}
        <div className={styles.categoriesBar}>
          <ul className={styles.categoryList}>
            {displayCategories.map((cat) => (
              <li key={cat.id}>
                <button
                  onClick={() => setActiveCategory(cat.id)}
                  className={`${styles.categoryTab} ${activeCategory === cat.id ? styles.activeTab : ''}`}
                >
                  {cat.name}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Toolbar & Filters (Sorting, Price Range slider) */}
        <div className={styles.toolbar}>
          {/* Price Range Filter */}
          <div className={styles.filterGroup}>
            <label htmlFor="priceRange" className={styles.filterLabel}>
              Max Price: <strong>₹{maxPrice.toLocaleString('en-IN')}</strong>
            </label>
            <input
              type="range"
              id="priceRange"
              min="1000"
              max="50000"
              step="500"
              value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
              className={styles.rangeInput}
            />
          </div>

          {/* Sort Selector */}
          <div className={styles.sortGroup}>
            <label htmlFor="sortSelect" className={styles.sortLabel}>Sort By</label>
            <select
              id="sortSelect"
              value={selectedSort}
              onChange={(e) => setSelectedSort(e.target.value)}
              className={styles.selectInput}
            >
              <option value="featured">Featured</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="rating">Highest Rated</option>
            </select>
          </div>
        </div>

        {/* Product Grid */}
        {filteredProducts.length > 0 ? (
          <div className={styles.grid}>
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className={styles.noResults}>
            <p>No products found matching your filters.</p>
            <button
              onClick={() => {
                setActiveCategory('all');
                setSelectedSort('featured');
                setMaxPrice(50000);
              }}
              className={styles.resetBtn}
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

export default ProductList;
