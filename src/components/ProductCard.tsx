"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Heart, Star } from "lucide-react";
import type { Product } from "../data/db";
import { useWishlist } from "../context/WishlistContext";
import { productImage } from '../lib/productImages';
import styles from "./ProductCard.module.css";

export default function ProductCard({ product }: { product: Product }) {
  const { isInWishlist, toggleWishlist, wishlistStatus } = useWishlist();
  const wishlisted = isInWishlist(product.id);
  return (
    <article className={styles.card}>
      <div className={styles.imageContainer}>
        <Link
          href={`/product/${product.id}`}
          className={styles.imageLink}
          aria-label={`View ${product.title}`}
        >
          <Image
            src={productImage(product.images[0], 1000)}
            alt={product.title}
            fill
            sizes="(max-width: 700px) 46vw, (max-width: 1000px) 31vw, 24vw"
            className={styles.image}
          />
          {product.images[1] && (
            <Image
              src={productImage(product.images[1], 800)}
              alt=""
              fill
              sizes="(max-width: 700px) 46vw, (max-width: 1000px) 31vw, 24vw"
              className={styles.alternateImage}
            />
          )}
          <span className={styles.viewPiece}>
            Discover this piece <ArrowUpRight size={15} />
          </span>
        </Link>
        <button
          onClick={() => toggleWishlist(product.id)}
          className={`${styles.wishlistHeart} ${wishlisted ? styles.wishlistHeartActive : ""}`}
          aria-label={`${wishlisted ? "Remove" : "Add"} ${product.title} ${wishlisted ? "from" : "to"} wishlist`}
          aria-pressed={wishlisted}
          disabled={wishlistStatus !== 'ready'}
        >
          <Heart
            size={17}
            strokeWidth={1.4}
            fill={wishlisted ? "currentColor" : "none"}
          />
        </button>
      </div>
      <div className={styles.info}>
        <span className={styles.category}>
          {product.categoryId.replace(/-/g, " ")}
        </span>
        <Link href={`/product/${product.id}`}>
          <h3 className={styles.title}>{product.title}</h3>
        </Link>
        <div className={styles.bottomRow}>
          <span className={styles.price}>
            ₹{product.basePrice.toLocaleString("en-IN")}
          </span>
          {product.reviewsCount > 0 && (
            <span
              className={styles.rating}
              aria-label={`${product.rating} out of 5, ${product.reviewsCount} reviews`}
            >
              <Star size={10} fill="currentColor" /> {product.rating.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
