'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCart } from '../context/CartContext';
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

  // Check auth status on mount and listen for storage updates
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkAuthSession = () => {
      const storedUser = localStorage.getItem('wishlyn-user');
      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          if (parsed && parsed.email) {
            setUser(parsed);
            return;
          }
        } catch (e) {}
      }
      setUser(null);
    };

    checkAuthSession();

    window.addEventListener('storage', checkAuthSession);
    return () => window.removeEventListener('storage', checkAuthSession);
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
              <div className={styles.logoBrandWrapper}>
                <div className={styles.monogramBadge}>
                  <span className={styles.monogramMark}>W</span>
                  <span className={styles.monogramMarkL}>L</span>
                </div>
                <span className={styles.logoDivider} />
                <div className={styles.brandTextGroup}>
                  <span className={styles.brandTitle}>W I S H L Y N</span>
                  <span className={styles.brandTagline}>MADE TO MATCH YOU</span>
                </div>
              </div>
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
              <li><Link href="/" className={styles.mobileNavLink} onClick={() => setIsMobileNavOpen(false)}>Shop All</Link></li>
              <li><Link href="/#shop" className={styles.mobileNavLink} onClick={() => setIsMobileNavOpen(false)}>Collections</Link></li>
              <li>
                <Link
                  href={user ? (user.role === 'admin' ? '/admin' : '/profile') : '/login'}
                  className={styles.mobileNavLink}
                  onClick={() => setIsMobileNavOpen(false)}
                >
                  {user ? `Account (${user.role})` : 'Sign In / Register'}
                </Link>
              </li>
              <li><Link href="/checkout" className={styles.mobileNavLink} onClick={() => setIsMobileNavOpen(false)}>Checkout</Link></li>
            </ul>
          </nav>
        </div>
      )}
    </>
  );
};
export default Header;
