'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Product, ProductVariant } from '../data/mockDb';

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

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load cart data from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem('wishlyn-cart');
    if (savedCart) {
      try {
        const parsed = JSON.parse(savedCart);
        if (Array.isArray(parsed)) {
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
          setCartItems(validItems);
        }
      } catch (e) {
        console.error('Error loading cart data from localStorage:', e);
      }
    }
    setIsLoaded(true);
  }, []);

  // Synchronize cart details back to localStorage
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('wishlyn-cart', JSON.stringify(cartItems));
    }
  }, [cartItems, isLoaded]);

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
        // F-2: Cap quantity at variant stock level
        const currentQty = newItems[existingItemIndex].quantity;
        const newQty = Math.min(currentQty + quantity, variant!.stock);
        newItems[existingItemIndex].quantity = newQty;
        return newItems;
      } else {
        // F-2: Cap quantity at variant stock level
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

    setIsCartOpen(true); // Auto-open cart drawer when adding item
  }, []);

  const removeFromCart = useCallback((cartItemId: string) => {
    setCartItems(prevItems => prevItems.filter(item => item.id !== cartItemId));
  }, []);

  const updateQuantity = useCallback((cartItemId: string, quantity: number) => {
    setCartItems(prevItems =>
      prevItems.map(item => {
        if (item.id === cartItemId) {
          // F-2: Cap quantity at variant stock level
          const newQty = Math.max(1, Math.min(quantity, item.variant.stock));
          return { ...item, quantity: newQty };
        }
        return item;
      })
    );
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
  }, []);

  const cartCount = useMemo(() => {
    return cartItems.reduce((total, item) => total + item.quantity, 0);
  }, [cartItems]);

  const cartTotal = useMemo(() => {
    return cartItems.reduce((total, item) => {
      const itemBase = item.product.basePrice + item.variant.priceAdjustment;
      const itemSurcharge = item.giftWrap ? 5 : 0;
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
