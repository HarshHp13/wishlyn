'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Product, ProductVariant, getProductById, VARIANTS } from '../data/mockDb';

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

  // F-3, M-3: Load minimal data from localStorage on mount and validate/hydrate it
  useEffect(() => {
    const savedCart = localStorage.getItem('wishlyn-cart');
    if (savedCart) {
      try {
        const parsed = JSON.parse(savedCart);
        if (Array.isArray(parsed)) {
          (async () => {
            const hydratedItems: CartItem[] = [];
            for (const item of parsed) {
              if (
                item &&
                typeof item === 'object' &&
                typeof item.variantId === 'string' &&
                typeof item.quantity === 'number'
              ) {
                // Find variant from static or loaded catalog
                const variant = VARIANTS.find(v => v.id === item.variantId);

                if (variant) {
                  const product = await getProductById(variant.productId);
                  if (product) {
                    // F-2: Cap quantity at variant stock level
                    const quantity = Math.min(item.quantity, variant.stock);
                    if (quantity > 0) {
                      hydratedItems.push({
                        id: item.id || `${item.variantId}-${item.giftWrap ? 'gift' : 'standard'}`,
                        variantId: item.variantId,
                        product,
                        variant,
                        quantity,
                        giftWrap: !!item.giftWrap,
                        giftMessage: item.giftMessage || undefined,
                      });
                    }
                  }
                }
              }
            }
            setCartItems(hydratedItems);
          })();
        }
      } catch (e) {
        console.error('Error loading and hydrating cart data:', e);
      }
    }
    setIsLoaded(true);
  }, []);

  // F-3: Synchronize only basic details back to localStorage
  useEffect(() => {
    if (isLoaded) {
      const minimalCart = cartItems.map(item => ({
        id: item.id,
        variantId: item.variantId,
        quantity: item.quantity,
        giftWrap: item.giftWrap,
        giftMessage: item.giftMessage,
      }));
      localStorage.setItem('wishlyn-cart', JSON.stringify(minimalCart));
    }
  }, [cartItems, isLoaded]);

  const addToCart = useCallback(async (
    variantId: string, 
    quantity: number, 
    giftWrap: boolean, 
    giftMessage?: string,
    passedProduct?: Product,
    passedVariant?: ProductVariant
  ) => {
    const variant = passedVariant || VARIANTS.find(v => v.id === variantId);

    if (!variant) {
      console.warn(`[Cart] Variant ${variantId} could not be resolved in catalog.`);
      return;
    }

    const product = passedProduct || await getProductById(variant.productId);
    if (!product) {
      console.warn(`[Cart] Product metadata for variant ${variantId} (productId: ${variant.productId}) could not be resolved.`);
      return;
    }

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
