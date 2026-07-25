'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Product } from '../data/mockDb';
import styles from './ProductCard.module.css';

interface ProductCardProps {
  product: Product;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  // F-18: Render star ratings helper, clamping ratings to [0, 5]
  const renderStars = (rating: number) => {
    const stars = [];
    const clampedRating = Math.max(0, Math.min(5, rating));
    const floorRating = Math.floor(clampedRating);
    const hasHalf = clampedRating % 1 >= 0.25 && clampedRating % 1 <= 0.75;

    for (let i = 1; i <= 5; i++) {
      if (i <= floorRating) {
        stars.push(<span key={i} className={styles.starFull}>★</span>);
      } else if (i === floorRating + 1 && hasHalf) {
        stars.push(<span key={i} className={styles.starHalf}>★</span>);
      } else {
        stars.push(<span key={i} className={styles.starEmpty}>★</span>);
      }
    }
    return stars;
  };

  return (
    <div className={styles.card}>
      <Link href={`/product/${product.id}`} className={styles.link}>
        {/* Card Image Container */}
        <div className={styles.imageContainer}>
          {/* L-3: Removed priority attribute to enable lazy loading */}
          <Image
            src={product.images[0]}
            alt={product.title}
            width={300}
            height={300}
            className={styles.image}
          />
          <div className={styles.overlay}>
            <span className={styles.overlayBtn}>View Collection</span>
          </div>
        </div>

        {/* Card Information */}
        <div className={styles.info}>
          <h3 className={styles.title}>{product.title}</h3>
          
          <div className={styles.ratingRow}>
            {product.reviewsCount > 0 ? (
              <>
                <div className={styles.stars} aria-label={`Rating ${product.rating} out of 5 stars`}>
                  {renderStars(product.rating)}
                </div>
                <span className={styles.reviewsCount}>({product.reviewsCount})</span>
              </>
            ) : (
              <span className={styles.reviewsCount}>No reviews yet</span>
            )}
          </div>

          <div className={styles.priceRow}>
            <span className={styles.pricePrefix}>From</span>
            <span className={styles.price}>₹{product.basePrice.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </Link>
    </div>
  );
};

export default ProductCard;
