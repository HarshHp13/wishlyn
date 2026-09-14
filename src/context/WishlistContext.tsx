'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { getAuthUser } from '../lib/authClient';

interface WishlistContextType {
  wishlistItems: string[];
  addToWishlist: (productId: string) => void;
  removeFromWishlist: (productId: string) => void;
  toggleWishlist: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;
  wishlistCount: number;
}

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

function getStorageKey(userEmailOrId?: string | null): string {
  if (userEmailOrId) {
    return `wishlyn-wishlist-profile-${userEmailOrId.toLowerCase()}`;
  }
  return 'wishlyn-wishlist-guest';
}

function parseWishlistItems(rawStr: string | null): string[] {
  if (!rawStr) return [];
  try {
    const parsed = JSON.parse(rawStr);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch (e) {
    console.error('[WishlistContext] Failed to parse wishlist items:', e);
    return [];
  }
}

export const WishlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [wishlistItems, setWishlistItems] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  // Load and hydrate wishlist data based on active user profile
  const syncProfileWishlist = useCallback(() => {
    const user = getAuthUser();
    const profileId = user?.email || user?.id || null;
    const profileKey = getStorageKey(profileId);

    setActiveProfileId(profileId);

    let items = parseWishlistItems(localStorage.getItem(profileKey));

    // Fallback: if profile wishlist is empty but legacy key exists
    if (items.length === 0 && profileId) {
      const guestWishlist = parseWishlistItems(localStorage.getItem('wishlyn-wishlist-guest'));
      items = guestWishlist;
    }

    setWishlistItems(items);
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    syncProfileWishlist();

    const handleAuthChange = () => {
      syncProfileWishlist();
    };

    window.addEventListener('wishlyn-auth-change', handleAuthChange);
    return () => {
      window.removeEventListener('wishlyn-auth-change', handleAuthChange);
    };
  }, [syncProfileWishlist]);

  // Persist wishlist changes to localStorage
  useEffect(() => {
    if (isLoaded) {
      const key = getStorageKey(activeProfileId);
      const serialized = JSON.stringify(wishlistItems);
      localStorage.setItem(key, serialized);
    }
  }, [wishlistItems, isLoaded, activeProfileId]);

  const addToWishlist = useCallback((productId: string) => {
    setWishlistItems(prev => {
      if (prev.includes(productId)) return prev;
      return [...prev, productId];
    });
  }, []);

  const removeFromWishlist = useCallback((productId: string) => {
    setWishlistItems(prev => prev.filter(id => id !== productId));
  }, []);

  const toggleWishlist = useCallback((productId: string) => {
    setWishlistItems(prev => {
      if (prev.includes(productId)) {
        return prev.filter(id => id !== productId);
      }
      return [...prev, productId];
    });
  }, []);

  const isInWishlist = useCallback((productId: string) => {
    return wishlistItems.includes(productId);
  }, [wishlistItems]);

  const wishlistCount = useMemo(() => wishlistItems.length, [wishlistItems]);

  return (
    <WishlistContext.Provider
      value={{
        wishlistItems,
        addToWishlist,
        removeFromWishlist,
        toggleWishlist,
        isInWishlist,
        wishlistCount,
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = () => {
  const context = useContext(WishlistContext);
  if (context === undefined) {
    throw new Error('useWishlist must be used within a WishlistProvider');
  }
  return context;
};
