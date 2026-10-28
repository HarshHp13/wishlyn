"use client";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Heart,
  Menu,
  Search,
  ShoppingBag,
  UserRound,
  X,
} from "lucide-react";
import { useCart } from "../context/CartContext";
import { useWishlist } from "../context/WishlistContext";
import { getAuthState, getServerAuthState, subscribeAuth, refreshAuthSession } from "../lib/authClient";
import styles from "./Header.module.css";

interface HeaderProps {
  onSearchChange?: (term: string) => void;
}
const subscribeScroll = (notify: () => void) => {
  window.addEventListener("scroll", notify, { passive: true });
  return () => window.removeEventListener("scroll", notify);
};

function SearchForm({
  onSearchChange,
  onSubmit,
}: HeaderProps & { onSubmit: () => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  return (
    <form
      className={styles.searchForm}
      onSubmit={(event) => {
        event.preventDefault();
        const term = String(
          new FormData(event.currentTarget).get("search") || "",
        ).trim();
        onSearchChange?.(term);
        onSubmit();
        const next = new URLSearchParams(params.toString());
        if (term) next.set('search', term); else next.delete('search');
        next.delete('page');
        router.push(`/${next.size ? `?${next}` : ''}#shop`);
      }}
    >
      <Search size={19} />
      <input
        ref={input}
        type="search"
        name="search"
        key={params.get("search")}
        defaultValue={params.get("search") || ""}
        placeholder="Find a little something…"
        aria-label="Search jewellery"
        onChange={(event) => onSearchChange?.(event.target.value)}
      />
      <button type="submit" aria-label="Submit search">
        <ArrowRight size={20} />
      </button>
    </form>
  );
}

export default function Header({ onSearchChange }: HeaderProps) {
  const { setIsCartOpen, cartCount } = useCart();
  const { wishlistCount } = useWishlist();
  useEffect(() => { void refreshAuthSession().catch(() => undefined); }, []);
  const { user } = useSyncExternalStore(subscribeAuth, getAuthState, getServerAuthState);
  const isScrolled = useSyncExternalStore(
    subscribeScroll,
    () => window.scrollY > 20,
    () => false,
  );
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const mobileDialog = useRef<HTMLDialogElement>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);

  function closeSearch() {
    setIsSearchOpen(false);
    searchTrigger.current?.focus();
  }
  function closeNav() {
    mobileDialog.current?.close();
  }

  useEffect(() => {
    if (!isMobileNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileNavOpen]);

  return (
    <>
      <header
        className={`${styles.header} ${isScrolled ? styles.scrolled : ""}`}
      >
        <div className={styles.announcement}>
          A little shine, delivered.{" "}
          <span>Complimentary shipping on orders of ₹3,000 or more</span>
        </div>
        <div className={`${styles.container} container`}>
          <button
            className={`${styles.actionBtn} ${styles.hamburger}`}
            aria-label="Open navigation menu"
            aria-expanded={isMobileNavOpen}
            aria-controls="mobile-navigation"
            onClick={() => {
              mobileDialog.current?.showModal();
              setIsMobileNavOpen(true);
            }}
          >
            <Menu size={22} strokeWidth={1.4} />
          </button>
          <nav className={styles.nav} aria-label="Main navigation">
            <Link href="/#shop">Shop all</Link>
            <Link href="/#collections">Collections</Link>
            <Link href="/#story">Our world</Link>
          </nav>
          <Link href="/" className={styles.logo} aria-label="Wishlyn home">
            <Image
              src="/wishlyn-mark.png"
              alt="Wishlyn"
              width={447}
              height={354}
              className={styles.logoImage}
              loading="eager"
              unoptimized
            />
          </Link>
          <div className={styles.actions}>
            <button
              ref={searchTrigger}
              className={styles.actionBtn}
              aria-label={isSearchOpen ? "Close search" : "Open search"}
              aria-expanded={isSearchOpen}
              aria-controls="site-search"
              onClick={() => setIsSearchOpen((open) => !open)}
            >
              {isSearchOpen ? (
                <X size={19} />
              ) : (
                <Search size={19} strokeWidth={1.4} />
              )}
            </button>
            <Link
              href={
                user
                  ? user.role === "admin"
                    ? "/admin"
                    : "/profile"
                  : "/login"
              }
              className={`${styles.actionBtn} ${styles.profileBtn}`}
              aria-label={
                user ? `Account profile (${user.email})` : "Sign in to Wishlyn"
              }
            >
              <UserRound size={19} strokeWidth={1.4} />
              {user && <span className={styles.loggedIn} />}
            </Link>
            <Link
              href="/wishlist"
              className={styles.actionBtn}
              aria-label={`Wishlist${wishlistCount ? ` (${wishlistCount} items)` : ""}`}
            >
              <Heart size={19} strokeWidth={1.4} />
              {wishlistCount > 0 && (
                <span className={styles.count}>{wishlistCount}</span>
              )}
            </Link>
            <button
              className={styles.actionBtn}
              aria-label={`Open shopping bag${cartCount ? ` (${cartCount} items)` : ""}`}
              onClick={() => setIsCartOpen(true)}
            >
              <ShoppingBag size={19} strokeWidth={1.4} />
              {cartCount > 0 && (
                <span className={styles.count}>{cartCount}</span>
              )}
            </button>
          </div>
        </div>
        {isSearchOpen && (
          <div
            id="site-search"
            className={styles.searchPanel}
            onKeyDown={(event) => {
              if (event.key === "Escape") closeSearch();
            }}
          >
            <div className="container">
              <Suspense fallback={<span>Opening search…</span>}>
                <SearchForm
                  onSearchChange={onSearchChange}
                  onSubmit={closeSearch}
                />
              </Suspense>
            </div>
          </div>
        )}
      </header>
      <dialog
        ref={mobileDialog}
        id="mobile-navigation"
        className={styles.mobileDialog}
        aria-labelledby="mobile-menu-title"
        onClose={() => setIsMobileNavOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeNav();
        }}
      >
        <div className={styles.mobilePanel}>
          <div className={styles.mobileHeading}>
            <span id="mobile-menu-title">A world of Wishlyn</span>
            <button
              className={styles.actionBtn}
              aria-label="Close navigation menu"
              onClick={closeNav}
            >
              <X size={22} />
            </button>
          </div>
          <nav aria-label="Mobile navigation">
            <Link href="/#shop" onClick={closeNav}>
              Shop all <ArrowRight size={20} />
            </Link>
            <Link href="/#collections" onClick={closeNav}>
              Collections <ArrowRight size={20} />
            </Link>
            <Link href="/#story" onClick={closeNav}>
              Our world <ArrowRight size={20} />
            </Link>
            <Link href="/wishlist" onClick={closeNav}>
              Your wishlist <Heart size={20} />
            </Link>
            <Link href={user ? "/profile" : "/login"} onClick={closeNav}>
              {user ? "Your account" : "Sign in"} <UserRound size={20} />
            </Link>
          </nav>
          <p>Thoughtfully made. Effortlessly yours.</p>
        </div>
      </dialog>
    </>
  );
}
