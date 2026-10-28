'use client';

import React, { useState, useEffect, useSyncExternalStore, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { Product, Category } from '../../data/db';
import { getAuthState, getServerAuthState, subscribeAuth, refreshAuthSession, clearAuthSession } from '../../lib/authClient';
import styles from './admin.module.css';

export default function AdminPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{
    type: 'success' | 'error' | 'warning' | null;
    message: string;
  }>({ type: null, message: '' });

  const auth = useSyncExternalStore(subscribeAuth, getAuthState, getServerAuthState);
  const userRole = auth.status === 'loading' ? 'loading' : auth.user?.role ?? 'unauthenticated';
  const userEmail = auth.user?.email ?? null;

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [stone, setStone] = useState('');
  const [dimensions, setDimensions] = useState('');
  const [careInstructions, setCareInstructions] = useState('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  // Dynamic metal variants
  interface AdminVariantForm {
    metalType: string;
    purity: string;
    price: string;
    stock: string;
  }

  const [formVariants, setFormVariants] = useState<AdminVariantForm[]>([
    { metalType: '', purity: '', price: '', stock: '' }
  ]);

  const addFormVariant = () => {
    setFormVariants((prev) => [
      ...prev,
      { metalType: '', purity: '', price: '', stock: '' }
    ]);
  };

  const removeFormVariant = (index: number) => {
    setFormVariants((prev) => prev.filter((_, i) => i !== index));
  };

  const updateFormVariant = (index: number, key: keyof AdminVariantForm, value: string) => {
    setFormVariants((prev) =>
      prev.map((v, i) => (i === index ? { ...v, [key]: value } : v))
    );
  };

  useEffect(() => { void refreshAuthSession().catch(() => undefined); }, []);

  const handleSignOut = async () => {
    try { await clearAuthSession(); router.push('/login'); }
    catch { setStatus({ type: 'error', message: 'Sign out could not be confirmed. Please retry.' }); }
  };

  const loadData = useCallback(() => {
    return fetch('/api/admin/product', { credentials: 'same-origin', cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('The catalogue could not be loaded. Please retry.');
        return response.json();
      })
      .then(data => {
        setProducts(data.products || []);
        const list = Array.isArray(data.categories) ? data.categories : [];
        setCategories(list);
        if (list.length > 0) setCategoryId(current => current || list[0].id);
      })
      .catch(error => setStatus({ type: 'error', message: error instanceof Error ? error.message : 'The catalogue could not be loaded. Please retry.' }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (userRole === 'admin') void loadData(); }, [userRole, loadData]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      setImageFiles((prev) => [...prev, ...files]);
      const newPreviews = files.map((file) => URL.createObjectURL(file));
      setImagePreviews((prev) => [...prev, ...newPreviews]);
    }
  };

  const removeSelectedImage = (index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Revoke object URLs on unmount/re-render
  useEffect(() => {
    return () => {
      imagePreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imagePreviews]);

  const generateSlug = (str: string) => {
    return str
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole !== 'admin') {
      setStatus({ type: 'error', message: 'You must be logged in to create products.' });
      return;
    }

    if (formVariants.length === 0) {
      setStatus({ type: 'error', message: 'At least one variant is mandatory.' });
      return;
    }

    // Validate variants
    for (const v of formVariants) {
      if (!v.metalType.trim() || !v.purity.trim()) {
        setStatus({ type: 'error', message: 'All variants must have a metal name and purity.' });
        return;
      }
      const priceVal = parseFloat(v.price);
      if (isNaN(priceVal) || priceVal < 0) {
        setStatus({ type: 'error', message: 'All variants must have a valid positive price.' });
        return;
      }
      const stockVal = parseInt(v.stock);
      if (isNaN(stockVal) || stockVal < 0) {
        setStatus({ type: 'error', message: 'All variants must have a valid non-negative stock.' });
        return;
      }
    }

    setIsSubmitting(true);
    setStatus({ type: null, message: '' });

    try {
      let imageUrls: string[] = [];

      // 1. Upload images to Cloudinary (calls our API route)
      if (imageFiles.length > 0) {
        const uploadPromises = imageFiles.map(async (file) => {
          const uploadData = new FormData();
          uploadData.append('file', file);

          const uploadRes = await fetch('/api/cloudinary/upload', {
            method: 'POST',
            body: uploadData,
          });

          const uploadResult = await uploadRes.json();
          if (!uploadRes.ok || uploadResult.error) {
            throw new Error(uploadResult.error || 'Image upload failed to retrieve URL');
          }
          
          if (uploadResult.warning) {
            console.warn('[Admin Cloudinary Warning]:', uploadResult.warning);
          }
          return uploadResult.url;
        });

        imageUrls = await Promise.all(uploadPromises);
      } else {
        // Fallback placeholder image if none selected
        imageUrls = [
          'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=600&q=80'
        ];
      }

      // Generate unique product ID slug with collision protection
      const randomSuffix = typeof crypto?.randomUUID === 'function'
        ? crypto.randomUUID().substring(0, 8)
        : Math.random().toString(36).substring(2, 10);
      const productId = `${generateSlug(title) || 'product'}-${randomSuffix}`;

      const newProduct = {
        id: productId,
        title,
        description,
        category_id: categoryId,
        images: imageUrls,
        rating: 5.0,
        reviews_count: 0,
        stone: stone || null,
        dimensions: dimensions || null,
        care_instructions: careInstructions || null,
      };

      const variantsToCreate = formVariants.map((v, index) => {
        const variantSlug = generateSlug(v.metalType) || `var-${index}`;
        return {
          id: `v-${productId}-${variantSlug}-${index}`,
          product_id: productId,
          metal_type: v.metalType.trim(),
          purity: v.purity.trim(),
          price: parseFloat(v.price) || 0,
          stock: parseInt(v.stock) || 0,
        };
      });

      // 2. Call backend Admin API to create product and dynamic variants
      const res = await fetch('/api/admin/product', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ product: newProduct, variants: variantsToCreate }),
      });

      const result = await res.json();

      if (!res.ok || result.error) {
        throw new Error(result.error || 'Failed to save product to database');
      }

      if (result.warning) {
        setStatus({
          type: 'warning',
          message: result.warning,
        });
      } else {
        setStatus({
          type: 'success',
          message: 'Product and variants successfully saved to database via admin client!',
        });
      }

      // Reset form fields
      setTitle('');
      setDescription('');
      setStone('');
      setDimensions('');
      setCareInstructions('');
      imagePreviews.forEach((url) => URL.revokeObjectURL(url));
      setImageFiles([]);
      setImagePreviews([]);
      setFormVariants([
        { metalType: '', purity: '', price: '', stock: '' }
      ]);
      
      // Reload products list
      loadData();
    } catch (err: unknown) {
      console.error('[Admin Submit Error]:', err);
      setStatus({
        type: 'error',
        message: (err instanceof Error ? err.message : '') || 'An unexpected error occurred during creation.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (userRole !== 'admin') {
      setStatus({ type: 'error', message: 'You must be logged in to delete products.' });
      return;
    }

    if (!confirm('Are you sure you want to delete this product? All corresponding variants will also be deleted.')) {
      return;
    }

    try {
      // Call backend Admin API to delete product and variants
      const res = await fetch(`/api/admin/product?id=${id}`, {
        method: 'DELETE',
      });

      const result = await res.json();

      if (!res.ok || result.error) {
        throw new Error(result.error || 'Failed to delete product');
      }

      setStatus({
        type: 'success',
        message: 'Product deleted successfully via admin client!',
      });
      
      // Refresh list
      loadData();
    } catch (err: unknown) {
      console.error('[Admin Delete Error]:', err);
      setStatus({
        type: 'error',
        message: (err instanceof Error ? err.message : '') || 'Failed to delete product.',
      });
    }
  };

  if (auth.status === 'error') return <><Header /><main id="main-content" className={styles.adminPage}><p role="alert">Your account could not be verified. Please retry.</p><button onClick={() => { void refreshAuthSession(true).catch(() => undefined); }}>Retry</button></main><Footer /></>;

  if (userRole === 'loading') {
    return (
      <>
        <Header />
        <main id="main-content" className={styles.adminPage} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
          <div style={{ textAlign: 'center', color: 'var(--text-primary)' }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: '24px', letterSpacing: '0.15em', marginBottom: '20px', textTransform: 'uppercase' }}>W I S H L Y N</div>
            <div style={{ display: 'inline-block', width: '30px', height: '30px', border: '2px solid var(--border-color)', borderTopColor: 'var(--champagne-gold)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <div style={{ marginTop: '15px', fontSize: '14px', color: 'var(--text-secondary)' }}>Verifying credentials...</div>
          </div>
          <style jsx global>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </main>
        <Footer />
      </>
    );
  }

  if (userRole === 'unauthenticated') {
    return (
      <>
        <Header />
        <main id="main-content" className={styles.adminPage} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
          <div className={styles.card} style={{ maxWidth: '400px', width: '100%', textAlign: 'center', padding: '40px 30px' }}>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: '22px', letterSpacing: '0.15em', display: 'block', marginBottom: '8px', color: 'var(--text-primary)' }}>ACCESS RESTRICTED</span>
            <div style={{ height: '1px', background: 'var(--border-color-light)', margin: '15px 0 20px 0' }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6', marginBottom: '30px' }}>
              Please sign in with an administrator account to access the Wishlyn inventory dashboard.
            </p>
            <Link href="/login" className={styles.submitBtn} style={{ display: 'block', textDecoration: 'none', textAlign: 'center' }}>
              Go to Sign In
            </Link>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (userRole === 'customer') {
    return (
      <>
        <Header />
        <main id="main-content" className={styles.adminPage} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
          <div className={styles.card} style={{ maxWidth: '450px', width: '100%', textAlign: 'center', padding: '40px 30px' }}>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: '22px', letterSpacing: '0.15em', display: 'block', marginBottom: '8px', color: '#e57373' }}>UNAUTHORIZED ACCESS</span>
            <div style={{ height: '1px', background: 'var(--border-color-light)', margin: '15px 0 20px 0' }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6', marginBottom: '15px' }}>
              Your account (<strong>{userEmail}</strong>) does not have administrator privileges.
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.6', marginBottom: '30px' }}>
              If you believe this is an error, please contact systems administration.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Link href="/" className={styles.submitBtn} style={{ display: 'block', textDecoration: 'none', textAlign: 'center', margin: 0 }}>
                Back to Storefront
              </Link>
              <button 
                onClick={handleSignOut} 
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  padding: '12px',
                  fontSize: '12px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-sm)'
                }}
              >
                Sign Out & Switch Account
              </button>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main id="main-content" className={styles.adminPage}>
        <div className="container">
          <div className={styles.titleRow}>
            <div>
              <h1>Catalog Admin Dashboard</h1>
              {userEmail && (
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Logged in as: <strong>{userEmail}</strong>
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <Link href="/" className={styles.backLink}>
                ← Back to Storefront
              </Link>
              <button
                onClick={handleSignOut}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#e57373',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                Sign Out
              </button>
            </div>
          </div>

          {status.type && (
            <div className={`${styles.statusMsg} ${styles[status.type]}`}>
              {status.message}
            </div>
          )}

          <div className={styles.grid}>
            {/* Left: Product Creator Card */}
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Add New Product</h2>
              <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.field}>
                  <label className={styles.label}>Product Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="Classic Gold Ring"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className={styles.input}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Description *</label>
                  <textarea
                    required
                    placeholder="Provide a detailed description of the jewellery item..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className={styles.textarea}
                  />
                </div>

                <div className={styles.fieldRow}>
                  <div className={styles.field}>
                    <label className={styles.label}>Category *</label>
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className={styles.select}
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Image Upload * (Select one or more)</label>
                  <div className={styles.fileInputWrapper}>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageChange}
                      className={styles.fileInput}
                    />
                    {imagePreviews.length > 0 && (
                      <div className={styles.previewsContainer}>
                        {imagePreviews.map((preview, idx) => (
                          <div key={idx} className={styles.previewCard}>
                            <img src={preview} alt={`Upload Preview ${idx + 1}`} />
                            <button
                              type="button"
                              onClick={() => removeSelectedImage(idx)}
                              className={styles.removePreviewBtn}
                              aria-label="Remove image"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <h3 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginTop: '10px' }}>
                  Product Details (Specifications)
                </h3>

                <div className={styles.fieldRow}>
                  <div className={styles.field}>
                    <label className={styles.label}>Stone details</label>
                    <input
                      type="text"
                      placeholder="AAA Cubic Zirconia"
                      value={stone}
                      onChange={(e) => setStone(e.target.value)}
                      className={styles.input}
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label}>Dimensions</label>
                    <input
                      type="text"
                      placeholder="Pendant: 15mm, Chain: 18in"
                      value={dimensions}
                      onChange={(e) => setDimensions(e.target.value)}
                      className={styles.input}
                    />
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Care Instructions</label>
                  <textarea
                    placeholder="Avoid contact with water and perfume..."
                    value={careInstructions}
                    onChange={(e) => setCareInstructions(e.target.value)}
                    className={styles.textarea}
                  />
                </div>

                <h3 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginTop: '10px', marginBottom: '10px' }}>
                  Product Variants * (At least one variant is mandatory)
                </h3>

                {formVariants.map((variant, index) => (
                  <div key={index} className={styles.fieldRow} style={{ alignItems: 'flex-end', gap: '10px', marginBottom: '15px', borderBottom: '1px solid var(--border-color-light)', paddingBottom: '15px' }}>
                    <div className={styles.field} style={{ flex: 2 }}>
                      <label className={styles.label}>Metal Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Silver, 18K Yellow Gold"
                        value={variant.metalType}
                        onChange={(e) => updateFormVariant(index, 'metalType', e.target.value)}
                        className={styles.input}
                      />
                    </div>
                    <div className={styles.field} style={{ flex: 2 }}>
                      <label className={styles.label}>Purity *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 925 Sterling Silver"
                        value={variant.purity}
                        onChange={(e) => updateFormVariant(index, 'purity', e.target.value)}
                        className={styles.input}
                      />
                    </div>
                    <div className={styles.field} style={{ flex: 1.5 }}>
                      <label className={styles.label}>Price (₹) *</label>
                      <input
                        type="number"
                        required
                        min="1"
                        step="1"
                        placeholder="10000"
                        value={variant.price}
                        onChange={(e) => updateFormVariant(index, 'price', e.target.value)}
                        className={styles.input}
                      />
                    </div>
                    <div className={styles.field} style={{ flex: 1 }}>
                      <label className={styles.label}>Stock *</label>
                      <input
                        type="number"
                        required
                        min="0"
                        step="1"
                        placeholder="5"
                        value={variant.stock}
                        onChange={(e) => updateFormVariant(index, 'stock', e.target.value)}
                        className={styles.input}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={formVariants.length <= 1}
                      onClick={() => removeFormVariant(index)}
                      style={{
                        background: 'none',
                        border: '1px solid #e57373',
                        color: '#e57373',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        borderRadius: 'var(--radius-sm)',
                        height: '42px',
                        alignSelf: 'flex-end',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: formVariants.length <= 1 ? 0.5 : 1
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addFormVariant}
                  style={{
                    background: 'transparent',
                    border: '1px dashed var(--champagne-gold)',
                    color: 'var(--champagne-gold)',
                    padding: '10px',
                    fontSize: '12px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    cursor: 'pointer',
                    borderRadius: 'var(--radius-sm)',
                    width: '100%',
                    marginBottom: '20px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  + Add Metal Variant
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={styles.submitBtn}
                >
                  {isSubmitting ? 'Saving to Database...' : 'Create Product'}
                </button>
              </form>
            </div>

            {/* Right: Existing Products List */}
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Live Inventory in Neon Database ({products.length})</h2>
              
              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  Loading database items...
                </div>
              ) : products.length === 0 ? (
                <div className={styles.emptyState}>
                  No products in Neon Database. Use the creator form to add your first luxury piece!
                </div>
              ) : (
                <div className={styles.productList}>
                  {products.map((prod) => (
                    <div key={prod.id} className={styles.productRow}>
                      <div className={styles.productThumbnail}>
                        <img src={prod.images[0]} alt={prod.title} />
                      </div>
                      <div className={styles.productInfo}>
                        <h4 className={styles.productTitle}>{prod.title}</h4>
                        <span className={styles.productMeta}>
                          ID: <code>{prod.id}</code> | Category: {prod.categoryId}
                        </span>
                      </div>
                      <div className={styles.productPrice}>
                        ₹{prod.basePrice.toLocaleString('en-IN')}
                      </div>
                      <button
                        onClick={() => handleDelete(prod.id)}
                        className={styles.deleteBtn}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
