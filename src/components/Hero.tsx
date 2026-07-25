import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import styles from './Hero.module.css';

export const Hero: React.FC = () => {
  return (
    <section className={styles.hero}>
      {/* Background Image */}
      <div className={styles.bgWrapper}>
        <Image
          src="/hero_jewellery_collection.png"
          alt="Premium handcrafted jewellery collection background"
          fill
          priority
          className={styles.bgImage}
        />
        <div className={styles.overlay} />
      </div>

      {/* Content Text Overlay */}
      <div className={`${styles.content} container`}>
        <span className={styles.brandBadge}>✦ MADE TO MATCH YOU ✦</span>
        <h1 className={styles.title}>
          Everyday Luxury, <br />
          Handcrafted For You.
        </h1>
        <p className={styles.subtitle}>
          Explore Wishlyn’s signature collection of sterling silver, fine gold, and brilliant diamond jewellery designed to match your unique story.
        </p>
        {/* F-13: Use next/link so it routes correctly from other pages to the homepage's #shop section */}
        <Link href="/#shop" className={styles.ctaBtn}>
          Explore Wishlyn Collections
        </Link>
      </div>
    </section>
  );
};

export default Hero;
