'use client';

import React, { useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCart } from '../context/CartContext';
import styles from './CartDrawer.module.css';

export const CartDrawer: React.FC = () => {
  const {
    isCartOpen,
    setIsCartOpen,
    cartItems,
    updateQuantity,
    removeFromCart,
    cartTotal,
  } = useCart();
  const router = useRouter();

  const drawerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // F-11: Focus trap and ESC handler
  useEffect(() => {
    if (!isCartOpen) return;

    // Focus the close button when drawer opens
    setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 100);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsCartOpen(false);
        return;
      }

      if (e.key === 'Tab') {
        if (!drawerRef.current) return;
        const focusableElements = drawerRef.current.querySelectorAll(
          'a[href], button:not([disabled]), textarea, input, select'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCartOpen, setIsCartOpen]);

  // Lock body scroll when cart is open
  useEffect(() => {
    if (isCartOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isCartOpen]);

  const freeShippingThreshold = 3000;
  const progressToFreeShipping = Math.min((cartTotal / freeShippingThreshold) * 100, 100);
  const remainingForFreeShipping = freeShippingThreshold - cartTotal;

  const handleCheckout = () => {
    setIsCartOpen(false);
    router.push('/checkout');
  };

  if (!isCartOpen) return null;

  return (
    <div className={styles.wrapper} role="dialog" aria-modal="true" aria-label="Shopping Cart">
      {/* Background Overlay */}
      <div
        ref={overlayRef}
        className={styles.overlay}
        onClick={() => setIsCartOpen(false)}
      />

      {/* Cart Drawer Panel */}
      <div ref={drawerRef} className={styles.drawer}>
        {/* Drawer Header */}
        <div className={styles.header}>
          <h2>Shopping Bag</h2>
          <button
            ref={closeBtnRef}
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
              ✨ Congratulations! You qualified for <strong>Free Shipping</strong>.
            </p>
          )}
          <div className={styles.progressBarBg}>
            <div
              className={styles.progressBar}
              style={{ width: `${progressToFreeShipping}%` }}
            />
          </div>
        </div>

        {/* Cart Items List */}
        <div className={styles.itemsContainer}>
          {cartItems.length === 0 ? (
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
                const itemPrice = item.product.basePrice + item.variant.priceAdjustment;
                const giftWrapPrice = item.giftWrap ? 350 : 0;
                const unitPrice = itemPrice + giftWrapPrice;

                return (
                  <li key={item.id} className={styles.item}>
                    <div className={styles.itemImageWrapper}>
                      <Image
                        src={item.product.images[0]}
                        alt={item.product.title}
                        width={80}
                        height={80}
                        className={styles.itemImage}
                      />
                    </div>
                    <div className={styles.itemDetails}>
                      <div className={styles.itemHeader}>
                        <h3>{item.product.title}</h3>
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
                        Metal: {item.variant.metalType} ({item.variant.purity})
                      </p>
                      {item.variant.size && (
                        <p className={styles.itemMeta}>Size: {item.variant.size}</p>
                      )}
                      {item.giftWrap && (
                        <p className={styles.giftLabel}>
                          🎁 Gift Wrapped (+ ₹350)
                        </p>
                      )}
                      
                      <div className={styles.itemFooter}>
                        {/* Quantity Counter */}
                        <div className={styles.quantityCounter}>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className={styles.qtyBtn}
                            aria-label="Decrease quantity"
                          >
                            -
                          </button>
                          <span className={styles.qtyVal}>{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className={styles.qtyBtn}
                            aria-label="Increase quantity"
                            disabled={item.quantity >= item.variant.stock}
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
            <p className={styles.taxNote}>Shipping & taxes calculated at checkout.</p>
            <button onClick={handleCheckout} className={styles.checkoutBtn}>
              Proceed to Secure Checkout
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CartDrawer;
