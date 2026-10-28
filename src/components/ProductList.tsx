"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, SlidersHorizontal, X } from "lucide-react";
import type { Product, Category } from "../data/db";
import ProductCard from "./ProductCard";
import styles from "./ProductList.module.css";

interface ProductListProps {
  initialProducts: Product[];
  initialCategories: Category[];
  searchTerm?: string;
  category?: string;
}

export default function ProductList({
  initialProducts: products,
  initialCategories: categories,
  searchTerm = "",
  category,
}: ProductListProps) {
  const router = useRouter();
  const priceCeiling = Math.max(
    1000,
    Math.ceil(Math.max(0, ...products.map((p) => p.basePrice)) / 500) * 500,
  );
  const [activeCategory, setActiveCategory] = useState(
    categories.some((c) => c.id === category) ? category! : "all",
  );
  const [selectedSort, setSelectedSort] = useState("featured");
  const [maxPrice, setMaxPrice] = useState(priceCeiling);
  const [visibleCount, setVisibleCount] = useState(8);
  const displayCategories = [
    { id: "all", name: "All jewellery", slug: "all" },
    ...categories.filter((c) => c.id !== "all"),
  ];
  const filteredProducts = useMemo(
    () =>
      products
        .filter(
          (product) =>
            (activeCategory === "all" ||
              product.categoryId === activeCategory) &&
            (product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
              product.description
                .toLowerCase()
                .includes(searchTerm.toLowerCase())) &&
            product.basePrice <= maxPrice,
        )
        .sort((a, b) => {
          if (selectedSort === "price-low") return a.basePrice - b.basePrice;
          if (selectedSort === "price-high") return b.basePrice - a.basePrice;
          if (selectedSort === "rating") return b.rating - a.rating;
          return 0;
        }),
    [products, activeCategory, searchTerm, maxPrice, selectedSort],
  );

  function resetFilters() {
    setActiveCategory("all");
    setSelectedSort("featured");
    setMaxPrice(priceCeiling);
    setVisibleCount(8);
  }

  return (
    <section className={styles.section} id="shop" aria-labelledby="shop-title">
      <div className="container">
        <div className={styles.heading}>
          <span className="eyebrow">YOUR NEXT CAN’T-LEAVE-HOME-WITHOUT IT</span>
          <h2 id="shop-title">
            Meet your <em>everyday favourites.</em>
          </h2>
          <p>Easy to wear. Hard to take off.</p>
        </div>
        {searchTerm && (
          <div className={styles.searchNotice}>
            Results for “{searchTerm}”{" "}
            <Link href="/#shop" aria-label="Clear search">
              <X size={15} /> Clear search
            </Link>
          </div>
        )}
        <div className={styles.categoriesBar}>
          <div
            className={styles.categoryList}
            role="group"
            aria-label="Filter by collection"
          >
            {displayCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  setActiveCategory(cat.id);
                  setVisibleCount(8);
                  const params = new URLSearchParams();
                  if (cat.id !== "all") params.set("category", cat.id);
                  if (searchTerm) params.set("search", searchTerm);
                  router.replace(`/?${params.toString()}#shop`, {
                    scroll: false,
                  });
                }}
                aria-pressed={activeCategory === cat.id}
                className={`${styles.categoryTab} ${activeCategory === cat.id ? styles.activeTab : ""}`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.toolbar}>
          <span className={styles.resultCount} role="status">
            {filteredProducts.length}{" "}
            {filteredProducts.length === 1 ? "piece" : "pieces"} to make your
            own
          </span>
          <div className={styles.tools}>
            <details className={styles.priceFilter}>
              <summary>
                <SlidersHorizontal size={14} /> Price{" "}
                {maxPrice < priceCeiling && (
                  <span>· Up to ₹{maxPrice.toLocaleString("en-IN")}</span>
                )}
              </summary>
              <div className={styles.filterPanel}>
                <label htmlFor="priceRange">
                  Up to ₹{maxPrice.toLocaleString("en-IN")}
                </label>
                <input
                  type="range"
                  id="priceRange"
                  min="0"
                  max={priceCeiling}
                  step="100"
                  value={maxPrice}
                  onChange={(e) => {
                    setMaxPrice(Number(e.target.value));
                    setVisibleCount(8);
                  }}
                />
                <button onClick={() => setMaxPrice(priceCeiling)}>
                  Reset price
                </button>
              </div>
            </details>
            <label className={styles.sortGroup}>
              Sort by
              <select
                value={selectedSort}
                aria-label="Sort jewellery"
                onChange={(e) => {
                  setSelectedSort(e.target.value);
                  setVisibleCount(8);
                }}
              >
                <option value="featured">Featured</option>
                <option value="price-low">Price: low to high</option>
                <option value="price-high">Price: high to low</option>
                <option value="rating">Highest rated</option>
              </select>
            </label>
          </div>
        </div>
        {filteredProducts.length ? (
          <>
            <div className={styles.grid}>
              {filteredProducts.slice(0, visibleCount).map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
            {visibleCount < filteredProducts.length && (
              <div className={styles.more}>
                <p>
                  Showing {Math.min(visibleCount, filteredProducts.length)} of{" "}
                  {filteredProducts.length} pieces
                </p>
                <button onClick={() => setVisibleCount((count) => count + 8)}>
                  A little more to love <ArrowDown size={16} />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className={styles.noResults}>
            <h3>No pieces found, just yet.</h3>
            <p>
              Try another collection or give your price range a little more
              room.
            </p>
            <button onClick={resetFilters}>Reset filters</button>
            {searchTerm && <Link href="/#shop">Browse all jewellery</Link>}
          </div>
        )}
      </div>
    </section>
  );
}
