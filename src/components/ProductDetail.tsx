'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Product, ProductVariant } from '../data/mockDb';
import { useCart } from '../context/CartContext';
import styles from './ProductDetail.module.css';

interface ProductDetailProps {
  product: Product;
  initialVariants: ProductVariant[];
  crossSellProduct?: Product;
}

export const ProductDetail: React.FC<ProductDetailProps> = ({ product, initialVariants, crossSellProduct }) => {
  const { addToCart } = useCart();
  const [variants] = useState<ProductVariant[]>(initialVariants);

  // State Management
  const [selectedMetal, setSelectedMetal] = useState<string>(variants[0]?.metalType || '');
  const [selectedSize, setSelectedSize] = useState<string | undefined>(
    variants.find(v => v.size)?.size || undefined
  );
  const [isGift, setIsGift] = useState(false);
  const [giftMessage, setGiftMessage] = useState('');
  const [pincode, setPincode] = useState('');
  const [pincodeStatus, setPincodeStatus] = useState<{
    searched: boolean;
    valid: boolean;
    text: string;
  }>({ searched: false, valid: false, text: '' });
  const [activeTab, setActiveTab] = useState<'details' | 'shipping' | 'care'>('details');
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const images = useMemo(() => {
    return product.images && product.images.length > 0
      ? product.images
      : ['https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=600&q=80'];
  }, [product.images]);

  // Reset active image when product changes
  useEffect(() => {
    setActiveImageIndex(0);
  }, [product.id]);

  const handlePrevImage = () => {
    setActiveImageIndex((prevIndex) =>
      prevIndex === 0 ? images.length - 1 : prevIndex - 1
    );
  };

  const handleNextImage = () => {
    setActiveImageIndex((prevIndex) =>
      prevIndex === images.length - 1 ? 0 : prevIndex + 1
    );
  };

  // Filter variants based on selected metal
  const availableSizes = useMemo(() => {
    return Array.from(
      new Set(
        variants
          .filter(v => v.metalType === selectedMetal && v.size)
          .map(v => v.size)
      )
    ).filter((size): size is string => !!size);
  }, [variants, selectedMetal]);

  // Select active variant
  const activeVariant = useMemo(() => {
    return variants.find((v) => {
      const matchMetal = v.metalType === selectedMetal;
      const matchSize = !v.size || v.size === selectedSize;
      return matchMetal && matchSize;
    }) || variants[0];
  }, [variants, selectedMetal, selectedSize]);

  // Compute final price
  const finalPrice = product.basePrice + (activeVariant?.priceAdjustment || 0);

  // Handle Add to Cart action
  const handleAddToCart = () => {
    if (!activeVariant) return;
    addToCart(activeVariant.id, 1, isGift, giftMessage, product, activeVariant);
  };

  // Handle pincode checker (F-17: Clearly note estimation logic)
  const handlePincodeCheck = (e: React.FormEvent) => {
    e.preventDefault();
    if (/^\d{6}$/.test(pincode)) {
      const startsWithMetro = /^(11|40|56|60)/.test(pincode);
      if (startsWithMetro) {
        setPincodeStatus({
          searched: true,
          valid: true,
          text: '⚡ Express Delivery: Estimated delivery in 2-3 business days. Cash on Delivery (COD) available.'
        });
      } else {
        setPincodeStatus({
          searched: true,
          valid: true,
          text: '📦 Standard Delivery: Estimated delivery in 5-7 business days.'
        });
      }
    } else {
      setPincodeStatus({
        searched: true,
        valid: false,
        text: '❌ Please enter a valid 6-digit postal code.'
      });
    }
  };

  return (
    <div className={styles.section}>
      <div className={`${styles.grid} container`}>
        {/* Gallery Panel */}
        <div className={styles.gallery}>
          <div className={styles.carouselContainer}>
            <div className={styles.mainImageWrapper}>
              <Image
                src={images[activeImageIndex]}
                alt={product.title}
                width={500}
                height={500}
                className={styles.mainImage}
                priority
              />
              
              {images.length > 1 && (
                <>
                  <button
                    onClick={handlePrevImage}
                    className={styles.carouselArrow}
                    style={{ left: '16px' }}
                    aria-label="Previous image"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                  <button
                    onClick={handleNextImage}
                    className={styles.carouselArrow}
                    style={{ right: '16px' }}
                    aria-label="Next image"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </>
              )}
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className={styles.thumbnailRow}>
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImageIndex(idx)}
                    className={`${styles.thumbnailWrapper} ${activeImageIndex === idx ? styles.activeThumbnail : ''}`}
                    aria-label={`Go to image ${idx + 1}`}
                  >
                    <Image
                      src={img}
                      alt={`${product.title} thumbnail ${idx + 1}`}
                      width={80}
                      height={80}
                      className={styles.thumbnailImage}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Purchase Info Panel */}
        <div className={styles.detailsPanel}>
          <div className={styles.breadcrumbs}>
            <Link href="/">Home</Link> &gt; <span>{product.title}</span>
          </div>

          <h1 className={styles.title}>{product.title}</h1>
          
          <div className={styles.priceRow}>
            <span className={styles.price}>₹{finalPrice.toLocaleString('en-IN')}</span>
            {activeVariant?.stock <= 5 && activeVariant?.stock > 0 && (
              <span className={styles.stockWarning}>
                🔥 Only {activeVariant.stock} left in stock!
              </span>
            )}
          </div>

          <p className={styles.description}>{product.description}</p>

          {/* Metal Customization Options */}
          <div className={styles.optionGroup}>
            <span className={styles.optionLabel}>Metal Type: <strong>{selectedMetal}</strong></span>
            <div className={styles.metalSwatches}>
              {Array.from(new Set(variants.map(v => v.metalType))).map((metal) => (
                <button
                  key={metal}
                  onClick={() => {
                    setSelectedMetal(metal);
                    // Reset selected size if it's not available in the new metal type
                    const hasSize = variants.some(v => v.metalType === metal && v.size === selectedSize);
                    if (!hasSize) {
                      const firstSize = variants.find(v => v.metalType === metal && v.size)?.size;
                      setSelectedSize(firstSize);
                    }
                  }}
                  className={`${styles.metalTab} ${selectedMetal === metal ? styles.activeMetal : ''}`}
                >
                  {metal}
                </button>
              ))}
            </div>
          </div>

          {/* Ring Sizes Grid */}
          {availableSizes.length > 0 && (
            <div className={styles.optionGroup}>
              <span className={styles.optionLabel}>Ring Size: <strong>{selectedSize}</strong></span>
              <div className={styles.sizeGrid}>
                {availableSizes.map((size) => (
                  <button
                    key={size}
                    onClick={() => setSelectedSize(size)}
                    className={`${styles.sizeBtn} ${selectedSize === size ? styles.activeSize : ''}`}
                  >
                    Size {size}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Gifting Packaging Card */}
          <div className={styles.giftingCard}>
            <label className={styles.giftCheckboxLabel}>
              <input
                type="checkbox"
                checked={isGift}
                onChange={(e) => setIsGift(e.target.checked)}
                className={styles.giftCheckbox}
              />
              <span>🎁 Send as a Gift (+ ₹350)</span>
            </label>
            {isGift && (
              <div className={styles.giftInputWrapper}>
                <textarea
                  placeholder="Write your custom gift message here..."
                  value={giftMessage}
                  onChange={(e) => setGiftMessage(e.target.value)}
                  maxLength={150}
                  className={styles.giftTextarea}
                />
                <span className={styles.giftTextLimit}>{giftMessage.length}/150 characters</span>
              </div>
            )}
          </div>

          {/* Action Trigger */}
          <button
            onClick={handleAddToCart}
            disabled={!activeVariant || activeVariant.stock === 0}
            className={styles.addToCartBtn}
          >
            {activeVariant && activeVariant.stock > 0 ? 'Add To Shopping Bag' : 'Out of Stock'}
          </button>

          {/* Pincode Shipping Estimator */}
          <div className={styles.pincodeBox}>
            <span className={styles.pincodeLabel}>Check Delivery Dates</span>
            <form onSubmit={handlePincodeCheck} className={styles.pincodeForm}>
              <input
                type="text"
                maxLength={6}
                placeholder="Enter 6-digit postal code"
                value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                className={styles.pincodeInput}
              />
              <button type="submit" className={styles.pincodeBtn}>Check</button>
            </form>
            {pincodeStatus.searched && (
              <p className={`${styles.pincodeStatus} ${pincodeStatus.valid ? styles.pincodeValid : styles.pincodeInvalid}`}>
                {pincodeStatus.text}
              </p>
            )}
          </div>

          {/* Specification Tabs */}
          <div className={styles.tabsWrapper}>
            <div className={styles.tabsHeader}>
              <button
                onClick={() => setActiveTab('details')}
                className={`${styles.tabTitle} ${activeTab === 'details' ? styles.activeTab : ''}`}
              >
                Specifications
              </button>
              <button
                onClick={() => setActiveTab('shipping')}
                className={`${styles.tabTitle} ${activeTab === 'shipping' ? styles.activeTab : ''}`}
              >
                Shipping & Returns
              </button>
              <button
                onClick={() => setActiveTab('care')}
                className={`${styles.tabTitle} ${activeTab === 'care' ? styles.activeTab : ''}`}
              >
                Jewellery Care
              </button>
            </div>
            
            <div className={styles.tabContent}>
              {activeTab === 'details' && (
                <ul className={styles.specList}>
                  <li><strong>Gemstones:</strong> {product.details.stone || 'Pure metal, no stones'}</li>
                  <li><strong>Dimensions:</strong> {product.details.dimensions || 'Standard spacing'}</li>
                  <li><strong>Metal Finish:</strong> High-polish anti-tarnish coating</li>
                  <li><strong>Purity:</strong> {activeVariant?.purity}</li>
                </ul>
              )}
              {activeTab === 'shipping' && (
                <p className={styles.tabPara}>
                  Enjoy free standard shipping on orders over ₹3,000. All shipments are insured and discreetly packaged for safety. Returns are accepted within 30 days of delivery, no questions asked.
                </p>
              )}
              {activeTab === 'care' && (
                <p className={styles.tabPara}>
                  {product.details.careInstructions}
                </p>
              )}
            </div>
          </div>

          {/* Cross Selling Block ("Complete the Look") */}
          {crossSellProduct && (
            <div className={styles.crossSell}>
              <h3>Complete The Look</h3>
              <div className={styles.crossSellCard}>
                <div className={styles.crossSellImgWrapper}>
                  <Image
                    src={crossSellProduct.images[0]}
                    alt={crossSellProduct.title}
                    width={60}
                    height={60}
                    className={styles.crossSellImg}
                  />
                </div>
                <div className={styles.crossSellInfo}>
                  <h4>{crossSellProduct.title}</h4>
                  <span>₹{crossSellProduct.basePrice.toLocaleString('en-IN')}</span>
                </div>
                <Link href={`/product/${crossSellProduct.id}`} className={styles.crossSellBtn}>
                  View
                </Link>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default ProductDetail;
