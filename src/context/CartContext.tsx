'use client';

import { createContext, useContext, useState, useCallback, useRef, useSyncExternalStore, type ReactNode } from 'react';
import type { Product, ProductVariant } from '../data/db';
import { addCartLine, changeQuantity, reconcileCart, validProduct, validVariant, type CartItem } from '../lib/shopping-state';
import { getAuthState } from '../lib/authClient';
import { cartStore } from '../lib/shopping-store';

export type { CartItem } from '../lib/shopping-state';
interface CartContextType {
  cartItems: CartItem[];
  addToCart: (variantId: string, quantity: number, giftWrap: boolean, giftMessage?: string, product?: Product, variant?: ProductVariant) => void;
  removeFromCart: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  isCartOpen: boolean;
  setIsCartOpen: (isOpen: boolean) => void;
  cartCount: number;
  cartTotal: number;
  cartStatus: 'loading' | 'ready' | 'error';
  cartNotice: string;
  refreshCart: () => Promise<boolean>;
  retryCart: () => Promise<void>;
}
const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(cartStore.subscribe, cartStore.getSnapshot, cartStore.getServerSnapshot);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const addToCart = useCallback((variantId: string, quantity: number, giftWrap: boolean, giftMessage?: string, product?: Product, variant?: ProductVariant) => {
    if (!product || !variant) return;
    void cartStore.mutate(items => addCartLine(items, { variantId, product, variant, quantity, giftWrap, giftMessage })).then(() => setIsCartOpen(true));
  }, []);
  const refreshCart = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const start = cartStore.getSnapshot();
    const auth = getAuthState();
    if (start.status !== 'ready') return false;
    if (!start.items.length) return true;
    try {
      const response = await fetch('/api/cart-products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variantIds: [...new Set(start.items.map(item => item.variantId))] }), signal: controller.signal });
      if (!response.ok) throw new Error('Unavailable');
      const data: { items?: { product: Product; variant: ProductVariant }[] } = await response.json();
      if (!Array.isArray(data.items) || !data.items.every(row => validProduct(row.product) && validVariant(row.variant))) throw new Error('Invalid catalogue');
      if (controller.signal.aborted || getAuthState() !== auth || cartStore.getSnapshot().accountId !== start.accountId) return false;
      const rows = data.items;
      await cartStore.mutate(items => {
        const requested = new Set(start.items.map(item => item.variantId));
        const result = reconcileCart(items.filter(item => requested.has(item.variantId)), rows);
        result.items = items.map(item => result.items.find(current => current.id === item.id) || item);
        if (result.changed) queueMicrotask(() => cartStore.notify('Price or availability has changed. Please review your bag before checkout.'));
        return result.items;
      });
      return true;
    } catch {
      if (!controller.signal.aborted && cartStore.getSnapshot().accountId === start.accountId) cartStore.notify('We could not refresh prices and availability. Retry before checkout.');
      return false;
    }
  }, []);
  return <CartContext.Provider value={{
    cartItems: snapshot.items, cartStatus: snapshot.status, cartNotice: snapshot.notice,
    cartCount: snapshot.items.reduce((sum, item) => sum + item.quantity, 0),
    cartTotal: snapshot.items.reduce((sum, item) => sum + (item.variant.price + (item.giftWrap ? 350 : 0)) * item.quantity, 0),
    addToCart, removeFromCart: id => { void cartStore.mutate(items => items.filter(item => item.id !== id)); },
    updateQuantity: (id, quantity) => { void cartStore.mutate(items => changeQuantity(items, id, quantity)); },
    clearCart: () => { void cartStore.mutate(() => []); }, isCartOpen, setIsCartOpen, refreshCart, retryCart: cartStore.retry,
  }}>{children}</CartContext.Provider>;
}
export function useCart() { const context = useContext(CartContext); if (!context) throw new Error('useCart requires CartProvider'); return context; }
