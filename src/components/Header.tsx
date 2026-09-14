'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { getAuthUser } from '../lib/authClient';
import styles from './Header.module.css';

interface HeaderProps {
  onSearchChange?: (term: string) => void;
}

// F-7: Sub-component for Search Input Form wrapped in Suspense to prevent Next.js SSR bailouts
const SearchInputForm: React.FC<HeaderProps> = ({ onSearchChange }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams?.get('search') || '';
    setSearchTerm(query);
  }, [searchParams]);

  const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    if (onSearchChange) onSearchChange(value);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearchChange) onSearchChange(searchTerm);
    router.push(`/?search=${encodeURIComponent(searchTerm)}#shop`);
  };

  return (
    <form onSubmit={handleSearchSubmit} className={styles.searchForm}>
      <input
        type="search"
        placeholder="Search jewellery..."
        value={searchTerm}
        onChange={handleSearchInput}
        className={styles.searchInput}
        aria-label="Search items"
      />
    </form>
  );
};

export const Header: React.FC<HeaderProps> = ({ onSearchChange }) => {
  const { setIsCartOpen, cartCount } = useCart();
  const { wishlistCount } = useWishlist();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [user, setUser] = useState<{ email: string; role: string } | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // F-7: Set search bar state on client side using window location to avoid Next.js static generation bails
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('search')) {
        setIsSearchOpen(true);
      }
    }
  }, []);

  // Check auth status on mount and listen for storage/auth updates
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkAuthSession = () => {
      const userObj = getAuthUser();
      setUser(userObj);
    };

    checkAuthSession();

    window.addEventListener('storage', checkAuthSession);
    window.addEventListener('wishlyn-auth-change', checkAuthSession);
    return () => {
      window.removeEventListener('storage', checkAuthSession);
      window.removeEventListener('wishlyn-auth-change', checkAuthSession);
    };
  }, []);

  // Lock body scroll when mobile nav is open
  useEffect(() => {
    if (isMobileNavOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isMobileNavOpen]);

  return (
    <>
      <header className={`${styles.header} ${isScrolled ? styles.scrolled : ''}`}>
        <div className={`${styles.container} container`}>
          {/* Hamburger (mobile only) */}
          <button
            className={styles.hamburger}
            onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={isMobileNavOpen}
          >
            <span className={`${styles.hamburgerLine} ${isMobileNavOpen ? styles.open : ''}`} />
            <span className={`${styles.hamburgerLine} ${isMobileNavOpen ? styles.open : ''}`} />
            <span className={`${styles.hamburgerLine} ${isMobileNavOpen ? styles.open : ''}`} />
          </button>

          {/* Desktop Nav */}
          <nav className={styles.nav} aria-label="Main Navigation">
            <ul className={styles.navList}>
              <li><Link href="/" className={styles.navLink}>Shop</Link></li>
              <li><Link href="/#shop" className={styles.navLink}>Collections</Link></li>
            </ul>
          </nav>

          {/* Brand Logo */}
          <div className={styles.logoContainer}>
            <Link href="/" className={styles.logo} aria-label="Wishlyn Home">
              <img
                src="/wishlynLogo.svg"
                alt="Wishlyn"
                className={styles.logoImage}
              />
            </Link>
          </div>

          {/* Actions */}
          <div className={styles.actions}>
            {/* Search */}
            <div className={`${styles.searchWrapper} ${isSearchOpen ? styles.searchOpen : ''}`}>
              <Suspense fallback={
                <form className={styles.searchForm}>
                  <input
                    type="search"
                    placeholder="Search jewellery..."
                    disabled
                    className={styles.searchInput}
                  />
                </form>
              }>
                <SearchInputForm onSearchChange={onSearchChange} />
              </Suspense>
              <button
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                className={styles.actionBtn}
                aria-label="Toggle search bar"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>
            </div>

            {/* Profile Icon */}
            <Link
              href={user ? (user.role === 'admin' ? '/admin' : '/profile') : '/login'}
              className={`${styles.actionBtn} ${styles.profileBtn}`}
              aria-label={user ? `Account profile (${user.email})` : 'Sign in to Wishlyn'}
              title={user ? `Account (${user.email})` : 'Sign In'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              {user && <span className={styles.userLoggedInDot} />}
            </Link>

            {/* Wishlist Icon */}
            <Link
              href="/wishlist"
              className={`${styles.actionBtn} ${styles.wishlistHeaderBtn}`}
              aria-label={`Wishlist${wishlistCount > 0 ? ` (${wishlistCount} items)` : ''}`}
              title="Wishlist"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              {wishlistCount > 0 && (
                <span className={styles.wishlistCount} aria-live="polite">
                  {wishlistCount}
                </span>
              )}
            </Link>

            {/* Cart */}
            <button
              onClick={() => setIsCartOpen(true)}
              className={`${styles.actionBtn} ${styles.cartBtn}`}
              aria-label="Open cart drawer"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
              {cartCount > 0 && (
                <span className={styles.cartCount} aria-live="polite">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Overlay */}
      {isMobileNavOpen && (
        <div className={styles.mobileOverlay} onClick={() => setIsMobileNavOpen(false)}>
          <nav
            className={styles.mobileNav}
            onClick={(e) => e.stopPropagation()}
            aria-label="Mobile Navigation"
          >
            <ul className={styles.mobileNavList}>
              <li><Link href="/" className={styles.mobileNavLink} onClick={() => setIsMobileNavOpen(false)}>Shop</Link></li>
              <li><Link href="/#shop" className={styles.mobileNavLink} onClick={() => setIsMobileNavOpen(false)}>All Collections</Link></li>
              <li><Link href="/wishlist" className={styles.mobileNavLink} onClick={() => setIsMobileNavOpen(false)}>Wishlist{wishlistCount > 0 ? ` (${wishlistCount})` : ''}</Link></li>
              <li><button className={styles.mobileNavLink} onClick={() => { setIsMobileNavOpen(false); setIsCartOpen(true); }}>Bag{cartCount > 0 ? ` (${cartCount})` : ''}</button></li>
            </ul>
          </nav>
        </div>
      )}
    </>
  );
};
export default Header;
