'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { getAuthState, getServerAuthState, refreshAuthSession, subscribeAuth } from '../../lib/authClient';
import type { MerchantProduct, MerchantSummary, ProductStatus } from '../../lib/merchant/types';
import styles from './admin.module.css';

type VariantForm = { key: string; id?: string; metalType: string; purity: string; size: string; price: string; stockAdjustment: string; stock: number; reservedStock: number; active: boolean };
type Editor = { id?: string; revision: number; requestKey: string; title: string; description: string; categoryId: string; images: string[]; stone: string; dimensions: string; careInstructions: string; factsConfirmed: boolean; status: ProductStatus; stockReason: string; variants: VariantForm[] };
type Upload = { key: string; file: File; preview: string; url?: string };
type Catalogue = { products: MerchantSummary[]; categories: { id: string; name: string }[]; nextOffset: number | null };
const variant = (): VariantForm => ({ key: crypto.randomUUID(), metalType: '', purity: '', size: '', price: '', stockAdjustment: '0', stock: 0, reservedStock: 0, active: true });
const emptyEditor = (categoryId = ''): Editor => ({ requestKey: crypto.randomUUID(), revision: 0, title: '', description: '', categoryId, images: [], stone: '', dimensions: '', careInstructions: '', factsConfirmed: false, status: 'draft', stockReason: '', variants: [variant()] });
const fromProduct = (product: MerchantProduct): Editor => ({ ...product, requestKey: '', stockReason: '', variants: product.variants.map(row => ({ ...row, key: row.id, price: String(row.price), stockAdjustment: '0' })) });
async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...init, credentials: 'same-origin', cache: 'no-store', signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'The request failed. Please retry.');
  return result;
}

function MerchantWorkspace({ verified }: { verified: boolean }) {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saved, setSaved] = useState<MerchantProduct | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const uploadsRef = useRef<Upload[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; uploadsRef.current.forEach(item => URL.revokeObjectURL(item.preview)); }; }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    if (!verified) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ search, status, lowStock: String(lowStock), offset: String(offset) });
    request<Catalogue>(`/api/admin/product?${params}`, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      setCatalogue(data); setListError(''); setLoading(false);
      setEditor(current => current || emptyEditor(data.categories[0]?.id));
    }).catch(() => { if (!controller.signal.aborted) { setListError('The catalogue could not be loaded. Retry to see current products.'); setLoading(false); } });
    return () => controller.abort();
  }, [search, status, lowStock, offset, reload, verified]);
  const changeUploads = useCallback((next: Upload[]) => { uploadsRef.current = next; setUploads(next); }, []);
  function clearUploads() { uploadsRef.current.forEach(item => URL.revokeObjectURL(item.preview)); changeUploads([]); }
  function newProduct() {
    if (dirty && !window.confirm('Discard unsaved product changes?')) return;
    clearUploads(); setEditor(emptyEditor(catalogue?.categories[0]?.id)); setSaved(null); setDirty(false); setError(''); setMessage(''); heading.current?.focus();
  }
  async function openProduct(id: string) {
    if (dirty && !window.confirm('Discard unsaved changes and load the saved product?')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const data = await request<{ product: MerchantProduct }>(`/api/admin/product?id=${encodeURIComponent(id)}`);
      if (!alive.current) return;
      clearUploads(); setEditor(fromProduct(data.product)); setSaved(data.product); setDirty(false); heading.current?.focus();
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'This product could not be loaded.'); }
    finally { if (alive.current) setBusy(false); }
  }
  function field<K extends keyof Editor>(key: K, value: Editor[K]) { setEditor(current => current && { ...current, [key]: value }); setDirty(true); setMessage(''); }
  function variantField<K extends keyof VariantForm>(key: string, fieldName: K, value: VariantForm[K]) {
    if (editor) field('variants', editor.variants.map(row => row.key === key ? { ...row, [fieldName]: value } : row));
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editor || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const images = [...editor.images];
      // Keep each completed upload so a failed later upload/save can retry without losing selection.
      for (const upload of uploadsRef.current) {
        let url = upload.url;
        if (!url) {
          const body = new FormData(); body.set('file', upload.file);
          const data = await request<{ url: string }>('/api/cloudinary/upload', { method: 'POST', body });
          url = data.url;
          if (!alive.current) return;
          changeUploads(uploadsRef.current.map(item => item.key === upload.key ? { ...item, url } : item));
        }
        images.push(url);
      }
      const body = { ...editor, images, variants: editor.variants.map(row => ({ id: row.id, metalType: row.metalType, purity: row.purity, size: row.size, price: Number(row.price), stockAdjustment: Number(row.stockAdjustment), active: row.active })) };
      const data = await request<{ product: MerchantProduct }>('/api/admin/product', { method: editor.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!alive.current) return;
      clearUploads(); setEditor(fromProduct(data.product)); setSaved(data.product); setDirty(false);
      setMessage(`Product saved as ${data.product.status}.`); setReload(value => value + 1);
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'The product could not be saved. Your form has been kept.'); }
    finally { if (alive.current) setBusy(false); }
  }
  if (!verified) return null;
  return <div className={styles.workspace}>
    <div className={styles.titleRow}><div><p className={styles.eyebrow}>Merchant workspace</p><h1>Catalogue & inventory</h1><p>Maintain products, availability and stock adjustments.</p></div><button className={styles.primary} onClick={newProduct} disabled={busy}>New product</button></div>
    <nav className={styles.navigation} aria-label="Merchant navigation"><Link href="/admin" aria-current="page">Catalogue</Link><Link href="/admin/orders">Orders</Link><Link href="/admin/support">Support requests</Link><Link href="/profile">My account</Link><Link href="/">Storefront</Link></nav>
    <div className={styles.grid}>
      <section className={styles.card} aria-labelledby="catalogue-title"><h2 id="catalogue-title">Products</h2>
        <div className={styles.field}><label htmlFor="product-search">Search products</label><input id="product-search" type="search" maxLength={100} value={search} onChange={event => { setSearch(event.target.value); setOffset(0); setLoading(true); }} /></div>
        <div className={styles.field}><label htmlFor="product-filter">Publication status</label><select id="product-filter" value={status} onChange={event => { setStatus(event.target.value); setOffset(0); setLoading(true); }}><option value="">All products</option><option value="draft">Drafts</option><option value="published">Published</option><option value="archived">Archived</option></select></div>
        <label className={styles.check}><input type="checkbox" checked={lowStock} onChange={event => { setLowStock(event.target.checked); setOffset(0); setLoading(true); }} />Low stock only (5 or fewer available)</label>
        {loading && <p role="status">Loading products…</p>}
        {listError && <div role="alert"><p>{listError}</p><button onClick={() => { setLoading(true); setReload(value => value + 1); }}>Retry catalogue</button></div>}
        {!loading && !listError && catalogue?.products.length === 0 && <p>No products match these filters.</p>}
        {!listError && <ul className={styles.productList}>{catalogue?.products.map(product => <li key={product.id}><button className={styles.product} onClick={() => void openProduct(product.id)} disabled={busy} aria-pressed={editor?.id === product.id}><strong>{product.title}</strong><span>{product.status} · {product.availableStock} available{product.lowStock ? ' · Low stock' : ''}</span></button></li>)}</ul>}
        <div className={styles.actions}>{offset > 0 && <button onClick={() => { setOffset(Math.max(0, offset - 20)); setLoading(true); }}>Previous products</button>}{catalogue?.nextOffset !== null && catalogue?.nextOffset !== undefined && <button onClick={() => { setOffset(catalogue.nextOffset!); setLoading(true); }}>Next products</button>}</div>
      </section>
      <section className={styles.card} aria-labelledby="editor-title"><h2 id="editor-title" ref={heading} tabIndex={-1}>{editor?.id ? 'Edit product' : 'New product'}</h2>
        {message && <p className={styles.success} role="status">{message}</p>}{error && <p id="save-error" className={styles.error} role="alert">{error}</p>}
        {busy && <p role="status">Please wait…</p>}
        {!editor && <p>Load the catalogue to start editing.</p>}
        {editor && <form onSubmit={save} aria-describedby={error ? 'save-error' : undefined}>
          <fieldset disabled={busy} className={styles.form}>
            <div className={styles.field}><label htmlFor="product-title">Product title</label><input id="product-title" required maxLength={255} value={editor.title} onChange={event => field('title', event.target.value)} /></div>
            <div className={styles.field}><label htmlFor="product-description">Description</label><textarea id="product-description" maxLength={10000} value={editor.description} onChange={event => field('description', event.target.value)} /></div>
            <div className={styles.field}><label htmlFor="product-category">Category</label><select id="product-category" required value={editor.categoryId} onChange={event => field('categoryId', event.target.value)}><option value="">Choose a category</option>{catalogue?.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{catalogue?.categories.length === 0 && <p>No categories are configured. A category must be added during catalogue setup.</p>}</div>
            <div className={styles.row}>{([['stone', 'Stone (optional)', 255], ['dimensions', 'Dimensions (optional)', 255]] as const).map(([key, label, max]) => <div className={styles.field} key={key}><label htmlFor={`product-${key}`}>{label}</label><input id={`product-${key}`} maxLength={max} value={editor[key]} onChange={event => field(key, event.target.value)} /></div>)}</div>
            <div className={styles.field}><label htmlFor="product-care">Care instructions (optional)</label><textarea id="product-care" maxLength={5000} value={editor.careInstructions} onChange={event => field('careInstructions', event.target.value)} /><p>Use verified item facts. Leave unknown details blank.</p></div>
            <div className={styles.field}><label htmlFor="product-images">Add product images</label><input id="product-images" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => {
              const files = Array.from(event.target.files || []);
              if (editor.images.length + uploads.length + files.length > 10 || files.some(file => file.size > 5 * 1024 * 1024 || !['image/jpeg','image/png','image/webp'].includes(file.type))) { setError('Choose up to ten JPEG, PNG or WebP images, each at most 5 MB.'); return; }
              changeUploads([...uploads, ...files.map(file => ({ key: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }))]); setDirty(true); event.target.value = '';
            }} /><p>Up to 10 images, 5 MB each. Drafts may be saved without an image.</p></div>
            <ul className={styles.images}>{editor.images.map((image, i) => <li key={image}><Image src={image} width={96} height={96} alt={`Product image ${i + 1}`} unoptimized /><button type="button" onClick={() => field('images', editor.images.filter(item => item !== image))}>Remove image {i + 1}</button></li>)}{uploads.map((upload, i) => <li key={upload.key}><Image src={upload.preview} width={96} height={96} alt={`Selected image ${i + 1}`} unoptimized /><span>{upload.file.name}{upload.url ? ' · Uploaded' : ''}</span><button type="button" onClick={() => { URL.revokeObjectURL(upload.preview); changeUploads(uploads.filter(item => item.key !== upload.key)); setDirty(true); }}>Remove selected image {i + 1}</button></li>)}</ul>
            <h3>Variants & stock</h3><p>Enter physical stock changes as an adjustment. Reserved units remain protected. Existing variants can be disabled without losing history.</p>
            {editor.variants.map((row, i) => <fieldset className={styles.variant} key={row.key}><legend>Variant {i + 1}</legend><div className={styles.row}>
              {([['metalType','Material / metal',64],['purity','Finish / purity',64],['size','Size (optional)',32]] as const).map(([key,label,max]) => <div className={styles.field} key={key}><label htmlFor={`${row.key}-${key}`}>{label} · {i + 1}</label><input id={`${row.key}-${key}`} required={key !== 'size'} maxLength={max} value={row[key]} onChange={event => variantField(row.key, key, event.target.value)} /></div>)}
              <div className={styles.field}><label htmlFor={`${row.key}-price`}>Price (₹) · {i + 1}</label><input id={`${row.key}-price`} type="number" inputMode="decimal" min="0.01" max="1000000" step="0.01" required value={row.price} onChange={event => variantField(row.key, 'price', event.target.value)} /></div>
              <div className={styles.field}><label htmlFor={`${row.key}-stock`}>{row.id ? 'Stock adjustment (+/−)' : 'Initial stock'} · {i + 1}</label><input id={`${row.key}-stock`} type="number" inputMode="numeric" step="1" min={row.id ? '-1000000' : '0'} max="1000000" required value={row.stockAdjustment} onChange={event => variantField(row.key, 'stockAdjustment', event.target.value)} /></div>
            </div><p>Last loaded: {row.stock} total · {row.reservedStock} reserved · {row.stock - row.reservedStock} available</p><label className={styles.check}><input type="checkbox" checked={row.active} onChange={event => variantField(row.key, 'active', event.target.checked)} />Offer variant {i + 1} for sale when the product is published</label>{!row.id && editor.variants.length > 1 && <button type="button" onClick={() => field('variants', editor.variants.filter(item => item.key !== row.key))}>Remove new variant {i + 1}</button>}</fieldset>)}
            <button type="button" disabled={editor.variants.length >= 50} onClick={() => field('variants', [...editor.variants, variant()])}>Add variant</button>
            <div className={styles.field}><label htmlFor="stock-reason">Stock adjustment reason</label><textarea id="stock-reason" maxLength={500} required={editor.variants.some(row => Number(row.stockAdjustment) !== 0)} value={editor.stockReason} onChange={event => field('stockReason', event.target.value)} placeholder="For example: received supplier delivery" /></div>
            <label className={styles.check}><input type="checkbox" checked={editor.factsConfirmed} onChange={event => field('factsConfirmed', event.target.checked)} />I have checked that the images, material, finish and description accurately represent this product.</label>
            <div className={styles.field}><label htmlFor="product-status">Save product as</label><select id="product-status" value={editor.status} onChange={event => field('status', event.target.value as ProductStatus)}><option value="draft">Draft — hidden from the storefront</option><option value="published">Published — visible in the storefront</option>{editor.id && <option value="archived">Archived — unavailable for new orders</option>}</select><p>Archiving preserves existing orders and product identity. It does not cancel a saved purchase.</p></div>
            <details className={styles.preview}><summary>Preview current form</summary><h3>{editor.title || 'Untitled product'}</h3><p>{editor.description || 'Description not supplied.'}</p><p>{editor.variants.filter(row => row.active).map(row => `${row.metalType} / ${row.purity}${row.size ? ` / ${row.size}` : ''} — ₹${row.price || '0'}`).join(' · ')}</p><p>{editor.status} · {editor.images.length + uploads.length} image(s)</p></details>
            <div className={styles.actions}><button type="submit" className={styles.primary}>Save product</button>{saved && <button type="button" onClick={() => void openProduct(saved.id)}>Reload saved product</button>}{saved?.status === 'published' && <Link href={`/product/${saved.id}`}>View published product</Link>}</div>
            {dirty && <p role="status">You have unsaved changes.</p>}
          </fieldset>
        </form>}
        {saved && <section className={styles.history} aria-labelledby="stock-history"><h3 id="stock-history">Stock adjustment history</h3><p>The most recent 100 merchant adjustments. Payment movements remain in order history.</p>{saved.history.length === 0 ? <p>No merchant adjustments recorded.</p> : <ol>{saved.history.map(entry => <li key={entry.id}><strong>{entry.adjustment > 0 ? '+' : ''}{entry.adjustment} units · {entry.stockBefore} → {entry.stockAfter}</strong><p>{entry.reason}</p><p>Variant {entry.variantId}</p><p>By {entry.actorId} · {new Date(entry.createdAt).toLocaleString()}</p></li>)}</ol>}</section>}
      </section>
    </div>
  </div>;
}
export default function AdminPage() {
  const auth = useSyncExternalStore(subscribeAuth, getAuthState, getServerAuthState);
  const [owner, setOwner] = useState<string | null>(null);
  if (auth.status === 'authenticated' && auth.user && auth.user.id !== owner) setOwner(auth.user.id);
  if (auth.status === 'guest' && owner !== null) setOwner(null);
  useEffect(() => { void refreshAuthSession().catch(() => undefined); }, []);
  return <><Header /><main id="main-content" className={styles.adminPage}>
    {auth.status === 'loading' && <p role="status">Verifying your account…</p>}
    {auth.status === 'error' && <div role="alert"><p>Your account could not be verified.</p><button onClick={() => void refreshAuthSession(true).catch(() => undefined)}>Retry account</button></div>}
    {auth.status === 'guest' && <p><Link href="/login?redirect=/admin">Sign in</Link> with an administrator account to maintain the catalogue.</p>}
    {auth.status === 'authenticated' && auth.user?.role !== 'admin' && <p>This workspace requires an administrator account. <Link href="/profile">Go to your account</Link>.</p>}
    {owner && <MerchantWorkspace key={owner} verified={auth.status === 'authenticated' && auth.user?.id === owner && auth.user.role === 'admin'} />}
  </main><Footer /></>;
}
