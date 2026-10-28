'use client';

import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Heart, Maximize2, X } from 'lucide-react';
import type { Product, ProductVariant } from '../data/db';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { productImage } from '../lib/productImages';
import styles from './ProductDetail.module.css';

interface Props { product: Product; initialVariants: ProductVariant[]; crossSellProduct?: Product }
const tabs = ['details', 'shipping', 'care'] as const;
type Tab = typeof tabs[number];
const tabNames = { details: 'Specifications', shipping: 'Shipping & help', care: 'Jewellery care' };
function optionLabel(variant: ProductVariant) {
  const purity = variant.purity && !/^100%?$/.test(variant.purity.trim()) ? variant.purity : '';
  return [variant.metalType, purity, variant.size ? `Size ${variant.size}` : ''].filter(Boolean).join(' · ');
}

export default function ProductDetail({ product, initialVariants: variants, crossSellProduct }: Props) {
  const { addToCart, cartStatus } = useCart();
  const { isInWishlist, toggleWishlist, wishlistStatus } = useWishlist();
  const [selectedId, setSelectedId] = useState(variants[0]?.id || '');
  const activeVariant = variants.find(variant => variant.id === selectedId);
  const [isGift, setIsGift] = useState(false);
  const [giftMessage, setGiftMessage] = useState('');
  const [pincode, setPincode] = useState('');
  const [postal, setPostal] = useState({ status: 'idle', text: '' });
  const postalRequest = useRef<AbortController | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('details');
  const [imageIndex, setImageIndex] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const zoom = useRef<HTMLDialogElement>(null);
  const zoomTrigger = useRef<HTMLButtonElement>(null);
  const images = product.images.length ? product.images : ['/product-image-unavailable.svg'];
  const nextImage = (direction: number) => setImageIndex(index => (index + direction + images.length) % images.length);
  useEffect(() => () => { postalRequest.current?.abort(); }, []);
  useEffect(() => {
    const dialog = zoom.current;
    if (zoomOpen && !dialog?.open) dialog?.showModal();
    if (!zoomOpen && dialog?.open) dialog.close();
    if (!zoomOpen) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, [zoomOpen]);
  const closeZoom = () => { setZoomOpen(false); zoomTrigger.current?.focus(); };

  async function checkPincode(event: FormEvent) {
    event.preventDefault();
    postalRequest.current?.abort();
    if (!/^[1-9]\d{5}$/.test(pincode)) { setPostal({ status: 'error', text: 'Enter a valid 6-digit Indian postal code.' }); return; }
    const request = new AbortController();
    postalRequest.current = request;
    const timer = setTimeout(() => request.abort(), 8000);
    setPostal({ status: 'loading', text: 'Checking postal area…' });
    try {
      const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`, { signal: request.signal });
      if (!response.ok) throw new Error('Unavailable');
      const data = await response.json();
      if (postalRequest.current !== request) return;
      if (!Array.isArray(data) || data[0]?.Status !== 'Success' || !Array.isArray(data[0]?.PostOffice) || !data[0].PostOffice.length) {
        setPostal({ status: 'error', text: 'No matching postal area was found. Check the code and try again.' }); return;
      }
      const office = data[0].PostOffice[0];
      if (typeof office.District !== 'string' || typeof office.State !== 'string') throw new Error('Invalid postal response');
      setPostal({ status: 'success', text: `Postal area: ${office.District}, ${office.State}. This lookup identifies an area; it does not confirm courier coverage or a delivery date.` });
    } catch {
      if (postalRequest.current === request) setPostal({ status: 'error', text: 'Postal lookup is unavailable. Please retry; delivery coverage has not been confirmed.' });
    } finally { clearTimeout(timer); }
  }
  function tabKey(event: KeyboardEvent<HTMLButtonElement>, tab: Tab) {
    const index = tabs.indexOf(tab);
    const next = event.key === 'ArrowRight' ? tabs[(index + 1) % tabs.length] : event.key === 'ArrowLeft' ? tabs[(index + tabs.length - 1) % tabs.length] : event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : null;
    if (!next) return;
    event.preventDefault(); setActiveTab(next); document.getElementById(`product-tab-${next}`)?.focus();
  }
  return <div className={styles.section}><div className={`${styles.grid} container`}>
    <div className={styles.gallery}><div className={styles.carouselContainer}>
      <div className={styles.mainImageWrapper}>
        <Image src={productImage(images[imageIndex], 1200)} alt={product.images.length ? `${product.title}, view ${imageIndex + 1}` : 'Product image unavailable'} width={600} height={600} className={styles.mainImage} preload sizes="(max-width: 900px) 100vw, 55vw" />
        {product.images.length > 0 && <button ref={zoomTrigger} className={styles.zoomTrigger} onClick={() => setZoomOpen(true)} aria-label="Enlarge product image"><Maximize2 size={18} /> Enlarge</button>}
        {images.length > 1 && <><button onClick={() => nextImage(-1)} className={styles.carouselArrow} style={{ left: 16 }} aria-label="Previous image"><ChevronLeft size={20} /></button><button onClick={() => nextImage(1)} className={styles.carouselArrow} style={{ right: 16 }} aria-label="Next image"><ChevronRight size={20} /></button></>}
      </div>
      {images.length > 1 && <div className={styles.thumbnailRow} role="group" aria-label="Product images">{images.map((image, index) => <button key={`${image}-${index}`} onClick={() => setImageIndex(index)} aria-pressed={imageIndex === index} aria-label={`View image ${index + 1}`} className={`${styles.thumbnailWrapper} ${imageIndex === index ? styles.activeThumbnail : ''}`}><Image src={productImage(image, 180)} alt="" width={80} height={80} className={styles.thumbnailImage} /></button>)}</div>}
      <p className={styles.galleryNote}>Photographs show the design. Refer to the listed dimensions for scale.</p>
    </div></div>
    <div className={styles.detailsPanel}>
      <nav className={styles.breadcrumbs} aria-label="Breadcrumb"><Link href="/#shop">Shop jewellery</Link> / <span aria-current="page">{product.title}</span></nav>
      <h1 className={styles.title}>{product.title}</h1>
      <div className={styles.priceRow}><span className={styles.price}>{activeVariant ? `₹${activeVariant.price.toLocaleString('en-IN')}` : 'Currently unavailable'}</span>{activeVariant && activeVariant.stock > 0 && activeVariant.stock <= 5 && <span className={styles.stockWarning}>{activeVariant.stock} available</span>}</div>
      <p className={styles.costNote}>Shipping ₹250 below ₹3,000; free from ₹3,000. Estimated 3% tax and any gift packaging are added to the order total. Review the full amount before payment.</p>
      <p className={styles.description}>{product.description}</p>
      {variants.length > 1 ? <div className={styles.optionGroup}><label htmlFor="product-variant" className={styles.optionLabel}>Choose your option</label><select id="product-variant" className={styles.variantSelect} value={selectedId} onChange={event => setSelectedId(event.target.value)}>{variants.map((variant, index) => <option key={variant.id} value={variant.id}>{optionLabel(variant)}{variants.some((v, i) => i !== index && optionLabel(v) === optionLabel(variant)) ? ` · Option ${index + 1}` : ''} · ₹{variant.price.toLocaleString('en-IN')}{variant.stock === 0 ? ' · Sold out' : ''}</option>)}</select></div> : activeVariant && <p className={styles.optionLabel}>Material / option: <strong>{optionLabel(activeVariant)}</strong></p>}
      <div className={styles.giftingCard}><label className={styles.giftCheckboxLabel}><input type="checkbox" checked={isGift} onChange={event => setIsGift(event.target.checked)} className={styles.giftCheckbox} /> Add gift packaging (+ ₹350 per item)</label>{isGift && <div className={styles.giftInputWrapper}><label htmlFor="gift-message">Gift message (optional)</label><textarea id="gift-message" value={giftMessage} onChange={event => setGiftMessage(event.target.value)} maxLength={150} className={styles.giftTextarea} aria-describedby="gift-message-count" /><span id="gift-message-count" className={styles.giftTextLimit}>{giftMessage.length}/150 characters</span></div>}</div>
      <div className={styles.actionRow}>
        <button onClick={() => { if (activeVariant) addToCart(activeVariant.id, 1, isGift, giftMessage, product, activeVariant); }} disabled={!activeVariant || activeVariant.stock <= 0 || cartStatus !== 'ready'} className={styles.addToCartBtn}>{cartStatus === 'loading' ? 'Loading your bag…' : activeVariant && activeVariant.stock > 0 ? 'Add to shopping bag' : 'Out of stock'}</button>
        <button onClick={() => toggleWishlist(product.id)} disabled={wishlistStatus !== 'ready'} className={`${styles.wishlistBtn} ${isInWishlist(product.id) ? styles.wishlistBtnActive : ''}`} aria-pressed={isInWishlist(product.id)} aria-label={isInWishlist(product.id) ? 'Remove from wishlist' : 'Add to wishlist'}><Heart size={22} fill={isInWishlist(product.id) ? 'currentColor' : 'none'} /></button>
      </div>
      {cartStatus === 'error' && <p role="alert">Your shopping session could not be verified. <Link href="/login">Sign in again</Link> to continue.</p>}
      <div className={styles.pincodeBox}><form onSubmit={checkPincode}><label htmlFor="postal-code" className={styles.pincodeLabel}>Check an Indian postal area</label><div className={styles.pincodeForm}><input id="postal-code" type="text" maxLength={6} autoComplete="postal-code" inputMode="numeric" placeholder="6-digit postal code" value={pincode} aria-describedby="postal-status" aria-invalid={postal.status === 'error'} onChange={event => { postalRequest.current?.abort(); postalRequest.current = null; setPincode(event.target.value.replace(/\D/g, '')); setPostal({ status: 'idle', text: '' }); }} className={styles.pincodeInput} /><button type="submit" disabled={postal.status === 'loading'} className={styles.pincodeBtn}>{postal.status === 'loading' ? 'Checking…' : 'Check'}</button></div><p id="postal-status" role="status" className={styles.pincodeStatus}>{postal.text}</p></form></div>
      <div className={styles.tabsWrapper}><div className={styles.tabsHeader} role="tablist" aria-label="Product information">{tabs.map(tab => <button key={tab} id={`product-tab-${tab}`} role="tab" aria-controls={`product-panel-${tab}`} aria-selected={activeTab === tab} tabIndex={activeTab === tab ? 0 : -1} onKeyDown={event => tabKey(event, tab)} onClick={() => setActiveTab(tab)} className={`${styles.tabTitle} ${activeTab === tab ? styles.activeTab : ''}`}>{tabNames[tab]}</button>)}</div>
        {tabs.map(tab => <div key={tab} id={`product-panel-${tab}`} role="tabpanel" aria-labelledby={`product-tab-${tab}`} tabIndex={0} hidden={activeTab !== tab} className={styles.tabContent}>
          {tab === 'details' && <dl className={styles.specificationList}><div><dt>Material / option</dt><dd>{activeVariant?.metalType || 'Information not provided'}</dd></div>{activeVariant?.purity && !/^100%?$/.test(activeVariant.purity.trim()) && <div><dt>Listed material specification</dt><dd>{activeVariant.purity}</dd></div>}<div><dt>Stone details</dt><dd>{product.details.stone || 'Information not provided'}</dd></div><div><dt>Dimensions</dt><dd>{product.details.dimensions || 'Measurements have not yet been provided'}</dd></div>{activeVariant?.size && <div><dt>Selected size</dt><dd>{activeVariant.size}</dd></div>}</dl>}
          {tab === 'shipping' && <p className={styles.tabPara}>Checkout currently supports Indian addresses. Shipping is ₹250 below ₹3,000 and free from ₹3,000. Delivery timing and return eligibility need confirmation for your order. <Link href="/support">Get help with delivery or returns</Link>.</p>}
          {tab === 'care' && <p className={styles.tabPara}>{product.details.careInstructions?.trim() || 'Care instructions have not yet been provided for this piece. Ask us before choosing a cleaning method.'} {!product.details.careInstructions?.trim() && <Link href="/support">Ask about this piece</Link>}</p>}
        </div>)}
      </div>
      {crossSellProduct && <div className={styles.crossSell}><h2>You may also like</h2><div className={styles.crossSellCard}><Image src={productImage(crossSellProduct.images[0], 180)} alt="" width={60} height={60} className={styles.crossSellImg} /><div className={styles.crossSellInfo}><h3>{crossSellProduct.title}</h3><span>₹{crossSellProduct.basePrice.toLocaleString('en-IN')}</span></div><Link href={`/product/${crossSellProduct.id}`} className={styles.crossSellBtn} aria-label={`View ${crossSellProduct.title}`}>View</Link></div></div>}
    </div>
    <dialog ref={zoom} className={styles.lightbox} aria-label={`${product.title} enlarged images`} onCancel={closeZoom} onClose={closeZoom} onKeyDown={event => { if (event.key === 'ArrowLeft') nextImage(-1); if (event.key === 'ArrowRight') nextImage(1); }}><div className={styles.lightboxBar}><p aria-live="polite">Image {imageIndex + 1} of {images.length}</p><button onClick={closeZoom} aria-label="Close enlarged image"><X size={24} /></button></div><Image src={productImage(images[imageIndex], 2000)} alt={`${product.title}, enlarged view ${imageIndex + 1}`} width={1600} height={1600} className={styles.lightboxImage} sizes="100vw" />{images.length > 1 && <div className={styles.lightboxBar}><button onClick={() => nextImage(-1)}><ChevronLeft size={20} /> Previous</button><button onClick={() => nextImage(1)}>Next <ChevronRight size={20} /></button></div>}</dialog>
  </div></div>;
}
