'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import styles from './Footer.module.css';

export const Footer: React.FC = () => {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      try {
        await fetch('/api/newsletter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
      } catch (err) {
        console.error('Error subscribing to newsletter:', err);
      }
      setSubmitted(true);
      setEmail('');
    }
  };

  return (
    <footer className={styles.footer}>
      <div className={`${styles.container} container`}>
        {/* Brand Block */}
        <div className={styles.brandBlock}>
          <div className={styles.brandHeader}>
            <div className={styles.monogramBadge}>
              <span className={styles.monogramMark}>W</span>
              <span className={styles.monogramMarkL}>L</span>
            </div>
            <div className={styles.brandTitleGroup}>
              <span className={styles.logoTitle}>W I S H L Y N</span>
              <span className={styles.taglineSub}>MADE TO MATCH YOU</span>
            </div>
          </div>
          <p className={styles.tagline}>
            Crafting premium sterling silver, gold, and fine diamond jewellery made to match your unique style. Everyday luxury, responsibly crafted.
          </p>
          <div className={styles.socials}>
            <Link href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
              </svg>
            </Link>
            <Link href="https://pinterest.com" target="_blank" rel="noopener noreferrer" aria-label="Pinterest">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 22a1 1 0 0 1-1-1v-4a7.99 7.99 0 0 1-3.6-6.6C3.4 5.3 7.8 1 13.2 1S23 5.3 23 10.4c0 4.1-2.9 7.6-6.8 8.4-.7.1-1.3-.2-1.5-.9-.1-.2-.1-.5 0-.7.3-1 .8-2.6.9-3.8.1-.8-.4-1.5-1.2-1.5-.7 0-1.3.5-1.5 1.2-.4 1.5-.9 3.5-.9 4.6 0 .5-.3.9-.8.9-.6 0-1.1-.5-1.1-1.1v-5.2c0-.5-.4-.9-.9-.9h-.5c-.5 0-.9.4-.9.9v1.2A3 3 0 0 1 8 22z"></path>
              </svg>
            </Link>
          </div>
        </div>

        {/* Links Navigation Columns */}
        <div className={styles.linksGrid}>
          <div className={styles.column}>
            <h3>Shop</h3>
            <ul>
              <li><Link href="/#shop">All Jewellery</Link></li>
              <li><Link href="/#shop">Rings</Link></li>
              <li><Link href="/#shop">Necklaces</Link></li>
            </ul>
          </div>
          
          <div className={styles.column}>
            <h3>Customer Service</h3>
            <ul>
              <li><Link href="/">Shipping & Deliveries</Link></li>
              <li><Link href="/">Returns & Exchanges</Link></li>
              <li><Link href="/">Jewellery Size Guide</Link></li>
              <li><Link href="/">FAQs</Link></li>
            </ul>
          </div>

          <div className={styles.column}>
            <h3>About Wishlyn</h3>
            <ul>
              <li><Link href="/">Our Story</Link></li>
              <li><Link href="/">Sustainability Commitment</Link></li>
              <li><Link href="/">Store Locator</Link></li>
            </ul>
          </div>
        </div>

        {/* Newsletter Signup Form */}
        <div className={styles.newsletterBlock}>
          <h3>Stay In The Loop</h3>
          <p>Subscribe to receive updates on collections, exclusive events, and 10% off your first order.</p>
          
          {submitted ? (
            <p className={styles.successMsg}>✨ Thank you for subscribing! Check your inbox shortly.</p>
          ) : (
            <form onSubmit={handleSubscribe} className={styles.form}>
              <input
                type="email"
                required
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={styles.input}
              />
              <button type="submit" className={styles.submitBtn}>
                Subscribe
              </button>
            </form>
          )}
        </div>
      </div>

      <div className={styles.copyrightRow}>
        <div className="container">
          <p suppressHydrationWarning>&copy; {new Date().getFullYear()} Wishlyn Fine Jewellery. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
