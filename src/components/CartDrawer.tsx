'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { cartHasUnavailable } from '../lib/shopping-state';
import { useRouter } from 'next/navigation';
import { useCart } from '../context/CartContext';
import { productImage } from '../lib/productImages';
import styles from './CartDrawer.module.css';

export const CartDrawer: React.FC = () => {
  const {
    isCartOpen,
    setIsCartOpen,
    cartItems,
    updateQuantity,
    removeFromCart,
    cartTotal,
    cartStatus, cartNotice, refreshCart, retryCart,
  } = useCart();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const unavailable = cartHasUnavailable(cartItems);
  async function refresh() {
    setRefreshing(true);
    setRefreshed(await refreshCart());
    setRefreshing(false);
  }
  useEffect(() => {
    if (!isCartOpen || cartStatus !== 'ready') return;
    let active = true;
    queueMicrotask(() => { if (active) setRefreshed(false); });
    void refreshCart().then(ok => { if (active) setRefreshed(ok); });
    return () => { active = false; };
  }, [isCartOpen, cartStatus, refreshCart]);

  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isCartOpen && !dialog.open) dialog.showModal();
    if (!isCartOpen && dialog.open) dialog.close();
    if (!isCartOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isCartOpen]);

  const freeShippingThreshold = 3000;
  const progressToFreeShipping = Math.min((cartTotal / freeShippingThreshold) * 100, 100);
  const remainingForFreeShipping = freeShippingThreshold - cartTotal;

  const handleCheckout = () => {
    if (!refreshed || unavailable || cartStatus !== 'ready') return;
    setIsCartOpen(false);
    router.push('/checkout');
  };

  return (
    <dialog ref={dialogRef} className={styles.wrapper} aria-label="Shopping Cart" onCancel={() => setIsCartOpen(false)} onClose={() => setIsCartOpen(false)}>
      {/* Background Overlay */}
      <div
        className={styles.overlay}
        onClick={() => setIsCartOpen(false)}
      />

      {/* Cart Drawer Panel */}
      <div className={styles.drawer}>
        {/* Drawer Header */}
        <div className={styles.header}>
          <h2>Shopping Bag</h2>
          <button
            onClick={() => setIsCartOpen(false)}
            className={styles.closeBtn}
            aria-label="Close cart"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Free Shipping Tracker */}
        <div className={styles.shippingTracker}>
          {remainingForFreeShipping > 0 ? (
            <p className={styles.trackerText}>
              You are <strong>₹{remainingForFreeShipping.toLocaleString('en-IN')}</strong> away from <strong>Free Shipping</strong>.
            </p>
          ) : (
            <p className={styles.trackerText}>
              Your bag qualifies for <strong>Free Shipping</strong>.
            </p>
          )}
          <div className={styles.progressBarBg}>
            <div
              className={styles.progressBar}
              style={{ transform: `scaleX(${progressToFreeShipping / 100})` }}
            />
          </div>
        </div>

        {/* Cart Items List */}
        <div className={styles.itemsContainer}>
          {cartNotice && <p className={styles.notice} role="status">{cartNotice}</p>}
          {cartStatus === 'loading' ? <p role="status" className={styles.notice}>Loading your shopping session…</p> : cartStatus === 'error' ? <div className={styles.notice}><p role="alert">We could not load your shopping session.</p><button onClick={() => { void retryCart().catch(() => undefined); }}>Retry</button></div> : cartItems.length === 0 ? (
            <div className={styles.emptyCart}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className={styles.emptyIcon}>
                <circle cx="9" cy="21" r="1"></circle>
                <circle cx="20" cy="21" r="1"></circle>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
              </svg>
              <p>Your shopping bag is empty.</p>
              <button onClick={() => setIsCartOpen(false)} className={styles.shopBtn}>
                Continue Shopping
              </button>
            </div>
          ) : (
            <ul className={styles.itemsList}>
              {cartItems.map((item) => {
                const itemPrice = item.variant.price;
                const giftWrapPrice = item.giftWrap ? 350 : 0;
                const unitPrice = itemPrice + giftWrapPrice;

                return (
                  <li key={item.id} className={styles.item}>
                    <div className={styles.itemImageWrapper}>
                      <Image
                        src={productImage(item.product.images[0], 160)}
                        alt={item.product.title}
                        width={80}
                        height={80}
                        className={styles.itemImage}
                      />
                    </div>
                    <div className={styles.itemDetails}>
                      <div className={styles.itemHeader}>
                        <h3><Link href={`/product/${item.product.id}`} onClick={() => setIsCartOpen(false)}>{item.product.title}</Link></h3>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className={styles.removeBtn}
                          aria-label={`Remove ${item.product.title} from cart`}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          </svg>
                        </button>
                      </div>
                      <p className={styles.itemMeta}>
                        Material: {item.variant.metalType}{item.variant.purity && !/^100%?$/.test(item.variant.purity.trim()) ? ` · ${item.variant.purity}` : ''}
                      </p>
                      {item.variant.size && (
                        <p className={styles.itemMeta}>Size: {item.variant.size}</p>
                      )}
                      {item.giftWrap && (
                        <p className={styles.giftLabel}>
                          Gift packaging (+ ₹350 per item)
                        </p>
                      )}
                      
                      {item.giftWrap && item.giftMessage && <p className={styles.giftMessage}>Gift message: “{item.giftMessage}”</p>}
                      {item.unavailable && <p role="status">This piece is no longer available. Remove it to continue.</p>}
                      {!item.unavailable && item.quantity > item.variant.stock && <p role="status">Only {item.variant.stock} available. Adjust this line to continue.</p>}
                      <div className={styles.itemFooter}>
                        {/* Quantity Counter */}
                        <div className={styles.quantityCounter}>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className={styles.qtyBtn}
                            aria-label={`Decrease quantity of ${item.product.title}`}
                            disabled={item.quantity <= 1 || item.unavailable}
                          >
                            -
                          </button>
                          <span className={styles.qtyVal}>{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className={styles.qtyBtn}
                            aria-label={`Increase quantity of ${item.product.title}`}
                            disabled={item.unavailable || cartItems.filter(line => line.variantId === item.variantId).reduce((sum, line) => sum + line.quantity, 0) >= item.variant.stock}
                          >
                            +
                          </button>
                        </div>
                        {/* Item Total Price */}
                        <span className={styles.itemPrice}>
                          ₹{(unitPrice * item.quantity).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Drawer Footer (Summary & Checkout) */}
        {cartItems.length > 0 && (
          <div className={styles.footer}>
            <div className={styles.summaryLine}>
              <span>Subtotal</span>
              <span className={styles.totalPrice}>₹{cartTotal.toLocaleString('en-IN')}</span>
            </div>
            <p className={styles.taxNote}>Shipping: {cartTotal >= 3000 ? 'Free' : '₹250'} in India. Estimated tax: ₹{Math.round(cartTotal * 0.03).toLocaleString('en-IN')}. Final price and stock are checked before payment.</p>
            <p className={styles.taxNote}>Estimated total: ₹{(cartTotal + (cartTotal >= 3000 ? 0 : 250) + Math.round(cartTotal * 0.03)).toLocaleString('en-IN')}</p>
            {unavailable && <p role="alert" className={styles.notice}>Some quantities are unavailable. Adjust or remove those items before checkout.</p>}
            {!refreshed && <button className={styles.refreshBtn} disabled={refreshing} onClick={() => { void refresh(); }}>{refreshing ? 'Refreshing…' : 'Refresh prices and availability'}</button>}
            <button onClick={handleCheckout} disabled={!refreshed || unavailable || cartStatus !== 'ready'} className={styles.checkoutBtn}>
              Review checkout
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
};

export default CartDrawer;
