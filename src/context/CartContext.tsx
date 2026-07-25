'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Product, ProductVariant } from '../data/mockDb';
import { getAuthUser } from '../lib/authClient';

export interface CartItem {
  id: string; // unique item id: variantId-giftOption
  variantId: string;
  product: Product;
  variant: ProductVariant;
  quantity: number;
  giftWrap: boolean;
  giftMessage?: string;
}

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (
    variantId: string,
    quantity: number,
    giftWrap: boolean,
    giftMessage?: string,
    passedProduct?: Product,
    passedVariant?: ProductVariant
  ) => void;
  removeFromCart: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  isCartOpen: boolean;
  setIsCartOpen: (isOpen: boolean) => void;
  cartCount: number;
  cartTotal: number;
  clearCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

function getStorageKey(userEmailOrId?: string | null): string {
  if (userEmailOrId) {
    return `wishlyn-cart-profile-${userEmailOrId.toLowerCase()}`;
  }
  return 'wishlyn-cart-guest';
}

function parseCartItems(rawStr: string | null): CartItem[] {
  if (!rawStr) return [];
  try {
    const parsed = JSON.parse(rawStr);
    if (!Array.isArray(parsed)) return [];
    const validItems: CartItem[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item === 'object' &&
        item.product &&
        item.variant &&
        typeof item.quantity === 'number'
      ) {
        validItems.push({
          id: item.id || `${item.variantId}-${item.giftWrap ? 'gift' : 'standard'}`,
          variantId: item.variantId,
          product: item.product,
          variant: item.variant,
          quantity: Math.max(1, item.quantity),
          giftWrap: !!item.giftWrap,
          giftMessage: item.giftMessage || undefined,
        });
      }
    }
    return validItems;
  } catch (e) {
    console.error('[CartContext] Failed to parse cart items:', e);
    return [];
  }
}

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  // Load and hydrate cart data based on active user profile
  const syncProfileCart = useCallback(() => {
    const user = getAuthUser();
    const profileId = user?.email || user?.id || null;
    const profileKey = getStorageKey(profileId);

    setActiveProfileId(profileId);

    let items = parseCartItems(localStorage.getItem(profileKey));

    // Fallback check: if profile cart is empty but legacy 'wishlyn-cart' exists
    if (items.length === 0 && profileId) {
      const legacyCart = parseCartItems(localStorage.getItem('wishlyn-cart'));
      const guestCart = parseCartItems(localStorage.getItem('wishlyn-cart-guest'));
      items = legacyCart.length > 0 ? legacyCart : guestCart;
    } else if (items.length === 0 && !profileId) {
      items = parseCartItems(localStorage.getItem('wishlyn-cart'));
    }

    setCartItems(items);
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    syncProfileCart();

    const handleAuthChange = () => {
      syncProfileCart();
    };

    window.addEventListener('wishlyn-auth-change', handleAuthChange);
    return () => {
      window.removeEventListener('wishlyn-auth-change', handleAuthChange);
    };
  }, [syncProfileCart]);

  // Synchronize cart changes to active profile storage key and general fallback key
  useEffect(() => {
    if (isLoaded) {
      const key = getStorageKey(activeProfileId);
      const serialized = JSON.stringify(cartItems);
      localStorage.setItem(key, serialized);
      localStorage.setItem('wishlyn-cart', serialized);
    }
  }, [cartItems, isLoaded, activeProfileId]);

  const addToCart = useCallback((
    variantId: string, 
    quantity: number, 
    giftWrap: boolean, 
    giftMessage?: string,
    passedProduct?: Product,
    passedVariant?: ProductVariant
  ) => {
    if (!passedProduct || !passedVariant) {
      console.warn(`[Cart] Missing product or variant metadata for ${variantId}.`);
      return;
    }

    const product = passedProduct;
    const variant = passedVariant;
    const cartItemId = `${variantId}-${giftWrap ? 'gift' : 'standard'}`;

    setCartItems(prevItems => {
      const existingItemIndex = prevItems.findIndex(item => item.id === cartItemId);
      if (existingItemIndex > -1) {
        const newItems = [...prevItems];
        const currentQty = newItems[existingItemIndex].quantity;
        const newQty = Math.min(currentQty + quantity, variant!.stock);
        newItems[existingItemIndex].quantity = newQty;
        return newItems;
      } else {
        const newQty = Math.min(quantity, variant!.stock);
        if (newQty <= 0) return prevItems;
        return [
          ...prevItems,
          {
            id: cartItemId,
            variantId,
            product,
            variant: variant!,
            quantity: newQty,
            giftWrap,
            giftMessage: giftWrap ? giftMessage : undefined,
          },
        ];
      }
    });

    setIsCartOpen(true);
  }, []);

  const removeFromCart = useCallback((cartItemId: string) => {
    setCartItems(prevItems => prevItems.filter(item => item.id !== cartItemId));
  }, []);

  const updateQuantity = useCallback((cartItemId: string, quantity: number) => {
    setCartItems(prevItems =>
      prevItems.map(item => {
        if (item.id === cartItemId) {
          const newQty = Math.max(1, Math.min(quantity, item.variant.stock));
          return { ...item, quantity: newQty };
        }
        return item;
      })
    );
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
    const key = getStorageKey(activeProfileId);
    localStorage.removeItem(key);
    localStorage.removeItem('wishlyn-cart');
  }, [activeProfileId]);

  const cartCount = useMemo(() => {
    return cartItems.reduce((total, item) => total + item.quantity, 0);
  }, [cartItems]);

  const cartTotal = useMemo(() => {
    return cartItems.reduce((total, item) => {
      const itemBase = item.product.basePrice + item.variant.priceAdjustment;
      const itemSurcharge = item.giftWrap ? 350 : 0;
      return total + (itemBase + itemSurcharge) * item.quantity;
    }, 0);
  }, [cartItems]);

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        removeFromCart,
        updateQuantity,
        isCartOpen,
        setIsCartOpen,
        cartCount,
        cartTotal,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
