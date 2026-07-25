'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { getProducts, getCategories, Product, Category } from '../../data/mockDb';
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

  // Authentication State
  const [userRole, setUserRole] = useState<'loading' | 'unauthenticated' | 'customer' | 'admin'>('loading');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [basePrice, setBasePrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [stone, setStone] = useState('');
  const [dimensions, setDimensions] = useState('');
  const [careInstructions, setCareInstructions] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Default Variant Stocks
  const [silverStock, setSilverStock] = useState('10');
  const [yellowGoldStock, setYellowGoldStock] = useState('5');
  const [roseGoldStock, setRoseGoldStock] = useState('5');
  const [platinumStock, setPlatinumStock] = useState('2');

  // Verify authorization on mount
  useEffect(() => {
    async function checkAuth() {
      if (typeof window === 'undefined') return;

      const offlineMode = localStorage.getItem('wishlyn-offline-mode') === 'true';
      const storedUser = localStorage.getItem('wishlyn-user');

      if (offlineMode && storedUser) {
        try {
          const userObj = JSON.parse(storedUser);
          setUserEmail(userObj.email);
          setSessionToken('offline-mock-token');
          if (userObj.role === 'admin' || userObj.email.includes('admin')) {
            setUserRole('admin');
            loadData();
          } else {
            setUserRole('customer');
          }
          return;
        } catch (e) {}
      }

      const token = localStorage.getItem('wishlyn-token');
      if (!token) {
        setUserRole('unauthenticated');
        return;
      }

      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        if (!res.ok || !data.user) {
          setUserRole('unauthenticated');
          return;
        }

        setUserEmail(data.user.email);
        setSessionToken(token);

        if (data.user.role === 'admin') {
          setUserRole('admin');
          loadData();
        } else {
          setUserRole('customer');
        }
      } catch (err) {
        console.error('[Admin Auth] Verification error:', err);
        setUserRole('unauthenticated');
      }
    }

    checkAuth();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [fetchedProducts, fetchedCategories] = await Promise.all([
        getProducts(),
        getCategories(),
      ]);
      setProducts(fetchedProducts);
      setCategories(fetchedCategories);
      if (fetchedCategories.length > 0 && !categoryId) {
        // Set default category
        setCategoryId(fetchedCategories[0].id);
      }
    } catch (err: any) {
      console.error('[Admin] Error loading catalog data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
      setImagePreview(URL.createObjectURL(file));
    }
  };

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
    if (!sessionToken) {
      setStatus({ type: 'error', message: 'You must be logged in to create products.' });
      return;
    }

    setIsSubmitting(true);
    setStatus({ type: null, message: '' });

    try {
      let imageUrl = '';

      // 1. Upload image to Cloudinary (calls our API route)
      if (imageFile) {
        const uploadData = new FormData();
        uploadData.append('file', imageFile);

        const uploadRes = await fetch('/api/cloudinary/upload', {
          method: 'POST',
          body: uploadData,
        });

        const uploadResult = await uploadRes.json();
        if (!uploadRes.ok || uploadResult.error) {
          throw new Error(uploadResult.error || 'Image upload failed to retrieve URL');
        }
        
        imageUrl = uploadResult.url;
        if (uploadResult.warning) {
          console.warn('[Admin Cloudinary Warning]:', uploadResult.warning);
        }
      } else {
        // Fallback placeholder image if none selected
        imageUrl =
          'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=600&q=80';
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
        base_price: parseFloat(basePrice) || 0,
        images: [imageUrl],
        rating: 5.0,
        reviews_count: 0,
        stone: stone || null,
        dimensions: dimensions || null,
        care_instructions: careInstructions || null,
      };

      const variantsToCreate = [
        {
          id: `v-${productId}-silver`,
          product_id: productId,
          metal_type: 'Silver',
          purity: '925 Sterling Silver',
          price_adjustment: 0,
          stock: parseInt(silverStock) || 0,
        },
        {
          id: `v-${productId}-yellowgold`,
          product_id: productId,
          metal_type: '18K Yellow Gold',
          purity: '18K Solid Yellow Gold',
          price_adjustment: 40,
          stock: parseInt(yellowGoldStock) || 0,
        },
        {
          id: `v-${productId}-rosegold`,
          product_id: productId,
          metal_type: '18K Rose Gold',
          purity: '18K Solid Rose Gold',
          price_adjustment: 40,
          stock: parseInt(roseGoldStock) || 0,
        },
        {
          id: `v-${productId}-platinum`,
          product_id: productId,
          metal_type: 'Platinum',
          purity: '950 Solid Platinum',
          price_adjustment: 120,
          stock: parseInt(platinumStock) || 0,
        },
      ];

      // 2. Call backend Admin API to create product and default variants
      const res = await fetch('/api/admin/product', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
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
      setBasePrice('');
      setStone('');
      setDimensions('');
      setCareInstructions('');
      setImageFile(null);
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
      setImagePreview(null);
      setSilverStock('10');
      setYellowGoldStock('5');
      setRoseGoldStock('5');
      setPlatinumStock('2');
      
      // Reload products list
      loadData();
    } catch (err: any) {
      console.error('[Admin Submit Error]:', err);
      setStatus({
        type: 'error',
        message: err.message || 'An unexpected error occurred during creation.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!sessionToken) {
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
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        }
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
    } catch (err: any) {
      console.error('[Admin Delete Error]:', err);
      setStatus({
        type: 'error',
        message: err.message || 'Failed to delete product.',
      });
    }
  };

  if (userRole === 'loading') {
    return (
      <>
        <Header />
        <main className={styles.adminPage} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
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
        <main className={styles.adminPage} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
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
        <main className={styles.adminPage} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
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
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    localStorage.removeItem('wishlyn-token');
                    localStorage.removeItem('wishlyn-user');
                    localStorage.removeItem('wishlyn-offline-mode');
                    localStorage.removeItem('wishlyn-mock-user');
                  }
                  setUserRole('unauthenticated');
                  router.push('/login');
                }} 
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
      <main className={styles.adminPage}>
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
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    localStorage.removeItem('wishlyn-token');
                    localStorage.removeItem('wishlyn-user');
                    localStorage.removeItem('wishlyn-offline-mode');
                    localStorage.removeItem('wishlyn-mock-user');
                  }
                  setUserRole('unauthenticated');
                  router.push('/login');
                }}
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
                    <label className={styles.label}>Base Price (USD) *</label>
                    <input
                      type="number"
                      required
                      min="1"
                      step="0.01"
                      placeholder="199.00"
                      value={basePrice}
                      onChange={(e) => setBasePrice(e.target.value)}
                      className={styles.input}
                    />
                  </div>

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
                  <label className={styles.label}>Image Upload *</label>
                  <div className={styles.fileInputWrapper}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className={styles.fileInput}
                    />
                    {imagePreview && (
                      <div className={styles.imagePreview}>
                        <img src={imagePreview} alt="Upload Preview" />
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

                <h3 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginTop: '10px' }}>
                  Variant Stock Quantities
                </h3>

                <div className={styles.fieldRow}>
                  <div className={styles.field}>
                    <label className={styles.label}>Silver Stock</label>
                    <input
                      type="number"
                      min="0"
                      value={silverStock}
                      onChange={(e) => setSilverStock(e.target.value)}
                      className={styles.input}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Yellow Gold Stock</label>
                    <input
                      type="number"
                      min="0"
                      value={yellowGoldStock}
                      onChange={(e) => setYellowGoldStock(e.target.value)}
                      className={styles.input}
                    />
                  </div>
                </div>

                <div className={styles.fieldRow}>
                  <div className={styles.field}>
                    <label className={styles.label}>Rose Gold Stock</label>
                    <input
                      type="number"
                      min="0"
                      value={roseGoldStock}
                      onChange={(e) => setRoseGoldStock(e.target.value)}
                      className={styles.input}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>Platinum Stock</label>
                    <input
                      type="number"
                      min="0"
                      value={platinumStock}
                      onChange={(e) => setPlatinumStock(e.target.value)}
                      className={styles.input}
                    />
                  </div>
                </div>

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
              <h2 className={styles.cardTitle}>Live Inventory in Supabase ({products.length})</h2>
              
              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  Loading database items...
                </div>
              ) : products.length === 0 ? (
                <div className={styles.emptyState}>
                  No products in Supabase. Use the creator form to add your first luxury piece!
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
                        ${prod.basePrice.toFixed(2)}
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
