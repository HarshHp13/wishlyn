'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { useCart } from '../../context/CartContext';
import Script from 'next/script';
import { refreshAuthSession, getAuthUser } from '../../lib/authClient';
import styles from './checkout.module.css';

type Step = 'shipping' | 'payment' | 'confirmation';

interface ShippingForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

const loadRazorpayScript = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if ((window as any).Razorpay) return resolve(true);
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export default function CheckoutPage() {
  const { cartItems, cartTotal, clearCart } = useCart();
  const [savedAddresses, setSavedAddresses] = useState<ShippingForm[]>([]);
  const [selectedSavedIdx, setSelectedSavedIdx] = useState<number | null>(null);
  const [currentStep, setCurrentStep] = useState<Step>('shipping');
  const [orderId, setOrderId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [shipping, setShipping] = useState<ShippingForm>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'India',
  });

  const router = useRouter();

  // Enforce authentication on checkout mount & load saved addresses
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;
    void refreshAuthSession().then(user => {
      if (cancelled) return;
      if (!user) { router.push('/login?redirect=/checkout'); return; }
      setShipping(prev => ({ ...prev, email: user.email }));
      try {
        const savedStr = localStorage.getItem(`wishlyn-saved-addresses:${user.id}`);
        const list = savedStr ? JSON.parse(savedStr) : [];
        if (Array.isArray(list) && list.length > 0) setSavedAddresses(list);
      } catch { /* Ignore incompatible saved addresses. */ }
      setAuthLoading(false);
    }).catch(() => {
      if (!cancelled) { setPaymentError('Your account could not be verified. Please reload and try again.'); setAuthLoading(false); }
    });
    return () => { cancelled = true; };

  }, [router]);

  const shippingCost = cartTotal >= 3000 ? 0 : 250;
  const tax = Math.round(cartTotal * 0.03);
  const total = cartTotal + shippingCost + tax;

  const handleShippingChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setShipping({ ...shipping, [e.target.name]: e.target.value });
    setSelectedSavedIdx(null);
  };

  const handleShippingSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Save shipping address into localStorage
    if (typeof window !== 'undefined') {
      const savedStr = localStorage.getItem(`wishlyn-saved-addresses:${getAuthUser()?.id ?? 'guest'}`);
      let list: ShippingForm[] = [];
      if (savedStr) {
        try { list = JSON.parse(savedStr); } catch (err) {}
      }

      list = list.filter(a => !(a.address.toLowerCase() === shipping.address.toLowerCase() && a.zipCode === shipping.zipCode));
      list.unshift(shipping);
      localStorage.setItem(`wishlyn-saved-addresses:${getAuthUser()?.id ?? 'guest'}`, JSON.stringify(list.slice(0, 5)));
    }

    setCurrentStep('payment');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setPaymentError(null);
    const generatedOrderId = `WISHLYN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    try {
      const scriptReady = await loadRazorpayScript();
      if (!scriptReady && typeof (window as any).Razorpay === 'undefined') {
        throw new Error('Razorpay Checkout SDK failed to load. Please verify your connection.');
      }

      const cartPayload = cartItems.map(item => ({
        variantId: item.variant.id,
        quantity: item.quantity,
        giftWrap: item.giftWrap,
        giftMessage: item.giftMessage,
      }));

      const res = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.round(total * 100),
          currency: 'INR',
          items: cartPayload,
        }),
      });

      const orderData = await res.json();

      if (!res.ok || orderData.error) {
        throw new Error(orderData.error || 'Failed to create payment order');
      }

      const activeOrderId = orderData.order_id || orderData.orderId;

      // Open the actual Razorpay Checkout Modal
      const options = {
        key: orderData.key || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'Wishlyn Fine Jewellery',
        description: `Checkout Order for ${shipping.firstName} ${shipping.lastName}`,
        order_id: activeOrderId,
        handler: async function (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
          try {
            const verifyRes = await fetch('/api/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                orderId: generatedOrderId,
                shipping,
                items: cartPayload,
              }),
            });

            const verifyData = await verifyRes.json();

            if (!verifyRes.ok || !verifyData.verified) {
              setPaymentError(verifyData.error || 'Payment verification failed. Signature mismatch.');
              setIsSubmitting(false);
              return;
            }

            setOrderId(generatedOrderId);
            clearCart();
            setCurrentStep('confirmation');
          } catch (dbErr) {
            console.error('[Checkout] Verification Error:', dbErr);
            setPaymentError('An error occurred verifying your payment. Please contact support.');
          } finally {
            setIsSubmitting(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        },
        prefill: {
          name: `${shipping.firstName} ${shipping.lastName}`,
          email: shipping.email,
          contact: shipping.phone,
        },
        notes: {
          address: `${shipping.address}, ${shipping.city}, ${shipping.state} - ${shipping.zipCode}`,
        },
        theme: {
          color: '#3B312A',
        },
        modal: {
          ondismiss: function () {
            setIsSubmitting(false);
            setPaymentError('Payment window was closed before completing payment.');
          }
        }
      };

      const rzp = new (window as any).Razorpay(options);

      rzp.on('payment.failed', function (response: any) {
        const errObj = response?.error || response;
        const reason = errObj?.description || errObj?.reason;
        if (reason) {
          console.warn('[Razorpay] Payment failed:', reason);
          setPaymentError(`Payment failed: ${reason}`);
        } else {
          console.warn('[Razorpay] Payment flow cancelled or failed');
          setPaymentError('Payment was not completed. Please try again.');
        }
        setIsSubmitting(false);
      });

      rzp.open();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      console.error('[Checkout] Payment flow failed:', message);
      setIsSubmitting(false);
      setPaymentError(`Payment could not be initialized: ${message}.`);
    }
  };

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--alabaster)' }}>
        <p style={{ color: 'var(--muted-text)', fontSize: '15px', fontFamily: 'var(--font-sans)' }}>Verifying secure checkout session...</p>
      </div>
    );
  }

  if (currentStep === 'confirmation') {
    return (
      <>
        <Header />
        <main id="main-content" className={styles.page}>
          <div className={`container ${styles.confirmation}`}>
            <div className={styles.confirmIcon}>✓</div>
            <h1>Order Confirmed!</h1>
            <p>Thank you for your purchase, {shipping.firstName}. Please save your order number for your records.</p>
            <p>Your jewellery will be carefully packaged and dispatched within 1–2 business days.</p>
            <div className={styles.orderId}>Order #{orderId}</div>
            <br />
            <Link href="/" className={styles.homeLink}>Continue Shopping</Link>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (cartItems.length === 0) {
    return (
      <>
        <Header />
        <main id="main-content" className={styles.page}>
          <div className={`container ${styles.emptyState}`}>
            <p>Your cart is empty. Add some items before checking out.</p>
            <Link href="/" className={styles.homeLink}>Browse Collections</Link>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      <main id="main-content" className={styles.page}>
        <div className="container">
          {/* Step Indicator */}
          <div className={styles.steps}>
            <div className={`${styles.step} ${currentStep === 'shipping' ? styles.stepActive : styles.stepDone}`}>
              <span className={styles.stepNumber}>{currentStep === 'shipping' ? '1' : '✓'}</span>
              <span>Shipping</span>
            </div>
            <div className={styles.stepDivider} />
            <div className={`${styles.step} ${currentStep === 'payment' ? styles.stepActive : ''}`}>
              <span className={styles.stepNumber}>2</span>
              <span>Payment</span>
            </div>
            <div className={styles.stepDivider} />
            <div className={styles.step}>
              <span className={styles.stepNumber}>3</span>
              <span>Confirmation</span>
            </div>
          </div>

          <div className={styles.grid}>
            {/* Left: Form Panel */}
            <div className={styles.formPanel}>
              {currentStep === 'shipping' && (
                <form onSubmit={handleShippingSubmit}>
                  <h2 className={styles.sectionTitle}>Shipping Address</h2>

                  {/* Saved Addresses Selector */}
                  {savedAddresses.length > 0 && (
                    <div className={styles.savedAddressesSection}>
                      <div className={styles.savedAddressHeader}>
                        <span className={styles.savedAddressTitle}>📍 Saved Delivery Addresses</span>
                      </div>
                      <div className={styles.savedAddressGrid}>
                        {savedAddresses.map((addr, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className={`${styles.savedAddressCard} ${selectedSavedIdx === idx ? styles.savedAddressCardActive : ''}`}
                            onClick={() => {
                              setSelectedSavedIdx(idx);
                              setShipping(prev => ({
                                ...addr,
                                email: prev.email || addr.email,
                              }));
                            }}
                          >
                            <div className={styles.savedAddressName}>{addr.firstName} {addr.lastName}</div>
                            <div className={styles.savedAddressDetails}>
                              {addr.address}, {addr.city}, {addr.state} {addr.zipCode}
                            </div>
                            <div className={styles.savedAddressDetails} style={{ marginTop: '4px', fontWeight: 600 }}>
                              📞 {addr.phone}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className={styles.fieldRow}>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="firstName">First Name *</label>
                      <input className={styles.input} type="text" id="firstName" name="firstName" required value={shipping.firstName} onChange={handleShippingChange} placeholder="Jane" />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="lastName">Last Name *</label>
                      <input className={styles.input} type="text" id="lastName" name="lastName" required value={shipping.lastName} onChange={handleShippingChange} placeholder="Doe" />
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="email">Email *</label>
                      <input className={styles.input} type="email" id="email" name="email" required disabled value={shipping.email} onChange={handleShippingChange} placeholder="jane@example.com" style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }} />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="phone">Phone *</label>
                      <input className={styles.input} type="tel" id="phone" name="phone" required value={shipping.phone} onChange={handleShippingChange} placeholder="+91 98765 43210" />
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={`${styles.field} ${styles.fieldFull}`}>
                      <label className={styles.label} htmlFor="address">Street Address *</label>
                      <input className={styles.input} type="text" id="address" name="address" required value={shipping.address} onChange={handleShippingChange} placeholder="123 Rose Lane, Apartment 4B" />
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="city">City *</label>
                      <input className={styles.input} type="text" id="city" name="city" required value={shipping.city} onChange={handleShippingChange} placeholder="Mumbai" />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="state">State *</label>
                      <input className={styles.input} type="text" id="state" name="state" required value={shipping.state} onChange={handleShippingChange} placeholder="Maharashtra" />
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="zipCode">Postal Code *</label>
                      <input className={styles.input} type="text" id="zipCode" name="zipCode" required value={shipping.zipCode} onChange={handleShippingChange} placeholder="400001" />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="country">Country</label>
                      <select className={styles.input} id="country" name="country" value={shipping.country} onChange={handleShippingChange}>
                        <option value="India">India</option>
                        <option value="United States">United States</option>
                        <option value="United Kingdom">United Kingdom</option>
                        <option value="Canada">Canada</option>
                        <option value="Australia">Australia</option>
                      </select>
                    </div>
                  </div>
                  <div className={styles.btnRow}>
                    <Link href="/" className={styles.secondaryBtn}>← Back to Shop</Link>
                    <button type="submit" className={styles.primaryBtn}>Continue to Payment</button>
                  </div>
                </form>
              )}

              {currentStep === 'payment' && (
                <form onSubmit={handlePaymentSubmit}>
                  <h2 className={styles.sectionTitle}>Payment Details</h2>
                  <div className={styles.paymentSection}>
                    <div className={styles.paymentBadges}>
                      <span className={styles.badge}>🔒 256-bit SSL Encryption</span>
                      <span className={styles.badge}>💳 UPI / Cards / NetBanking</span>
                      <span className={styles.badge}>🛡️ Buyer Protection</span>
                    </div>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '16px 0 8px 0' }}>
                      Your payment will be processed securely via Razorpay in INR (₹{Math.round(total).toLocaleString('en-IN')}). You will be redirected to the secure payment window to complete your order.
                    </p>

                    {process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.startsWith('rzp_test_') && (
                      <div style={{ margin: '12px 0 16px 0', padding: '12px 14px', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 'var(--radius-sm)', fontSize: '13px', color: '#6b21a8', lineHeight: '1.5' }}>
                        💡 <strong>Razorpay Test Mode Tip:</strong> Select <strong>Netbanking</strong> (choose any bank &amp; click &quot;Success&quot;) or <strong>UPI</strong> (enter <code>success@razorpay</code>). For cards, use domestic test card <code>4514 0100 0000 0001</code>.
                      </div>
                    )}

                    {paymentError && (
                      <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-sm)', color: '#991b1b', fontSize: '14px', margin: '8px 0 16px 0' }}>
                        {paymentError}
                      </div>
                    )}
                  </div>
                  <div className={styles.btnRow}>
                    <button type="button" onClick={() => { setCurrentStep('shipping'); setPaymentError(null); }} className={styles.secondaryBtn} disabled={isSubmitting}>← Back</button>
                    <button type="submit" className={styles.primaryBtn} disabled={isSubmitting}>
                      {isSubmitting ? 'Processing...' : `Pay via Razorpay — ₹${Math.round(total).toLocaleString('en-IN')}`}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Right: Order Summary */}
            <div className={styles.summaryPanel}>
              <div className={styles.summaryHeader}>
                <h3>Order Summary ({cartItems.reduce((a, i) => a + i.quantity, 0)} items)</h3>
              </div>
              <ul className={styles.summaryItems}>
                {cartItems.map((item) => {
                  const unitPrice = item.variant.price + (item.giftWrap ? 350 : 0);
                  return (
                    <li key={item.id} className={styles.summaryItem}>
                      <div className={styles.summaryItemImg}>
                        <Image src={item.product.images[0]} alt={item.product.title} width={56} height={56} />
                      </div>
                      <div className={styles.summaryItemInfo}>
                        <span className={styles.summaryItemTitle}>{item.product.title}</span>
                        <span className={styles.summaryItemMeta}>{item.variant.metalType} × {item.quantity}</span>
                      </div>
                      <span className={styles.summaryItemPrice}>₹{(unitPrice * item.quantity).toLocaleString('en-IN')}</span>
                    </li>
                  );
                })}
              </ul>
              <div className={styles.summaryFooter}>
                <div className={styles.summaryRow}>
                  <span>Subtotal</span>
                  <span>₹{cartTotal.toLocaleString('en-IN')}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Shipping</span>
                  <span>{shippingCost === 0 ? 'Free' : `₹${shippingCost.toLocaleString('en-IN')}`}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Tax (3% GST)</span>
                  <span>₹{tax.toLocaleString('en-IN')}</span>
                </div>
                <div className={styles.summaryTotal}>
                  <span>Total</span>
                  <span>₹{Math.round(total).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
