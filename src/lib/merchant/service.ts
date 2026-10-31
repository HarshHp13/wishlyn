import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { query, transaction } from '../database';
import { ApiError } from '../api';
import { merchantId, productInput, validateMerchantImages } from './validation';
import type { MerchantProduct, MerchantSummary, MerchantVariant, ProductStatus, StockEvent } from './types';

type ProductRow = { id: string; title: string; description: string; category_id: string; images: string[]; stone: string | null; dimensions: string | null; care_instructions: string | null; status: ProductStatus; revision: number; facts_confirmed: boolean; updated_at: Date };
type VariantRow = { id: string; product_id: string; metal_type: string; purity: string; size: string | null; price: string; stock: number; reserved_stock: number; active: boolean };
async function detail(client: PoolClient, id: string): Promise<MerchantProduct> {
  const { rows } = await client.query<ProductRow>('SELECT * FROM products WHERE id=$1', [id]);
  const product = rows[0];
  if (!product) throw new ApiError(404, 'product_not_found', 'This product was not found.');
  const variants = await client.query<VariantRow>('SELECT * FROM product_variants WHERE product_id=$1 ORDER BY id', [id]);
  const history = await client.query<{ id: string; variant_id: string; actor_id: string; adjustment: number; stock_before: number; stock_after: number; reason: string; created_at: Date }>('SELECT * FROM merchant_stock_events WHERE product_id=$1 ORDER BY id DESC LIMIT 100', [id]);
  return { id: product.id, title: product.title, description: product.description, categoryId: product.category_id, images: product.images, stone: product.stone || '', dimensions: product.dimensions || '', careInstructions: product.care_instructions || '', status: product.status, revision: product.revision, factsConfirmed: product.facts_confirmed, updatedAt: product.updated_at.toISOString(),
    variants: variants.rows.map((row): MerchantVariant => ({ id: row.id, productId: row.product_id, metalType: row.metal_type, purity: row.purity, size: row.size || '', price: Number(row.price), stock: row.stock, reservedStock: row.reserved_stock, active: row.active })),
    history: history.rows.map((row): StockEvent => ({ id: row.id, variantId: row.variant_id, actorId: row.actor_id, adjustment: row.adjustment, stockBefore: row.stock_before, stockAfter: row.stock_after, reason: row.reason, createdAt: row.created_at.toISOString() })) };
}
export async function getMerchantProduct(id: string) {
  merchantId(id);
  return transaction(async client => { await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'); return detail(client, id); });
}
export async function listMerchantProducts(options: { search?: string; status?: string; lowStock?: boolean; offset?: number } = {}) {
  const search = (options.search || '').trim().slice(0, 100).replace(/[\\%_]/g, '\\$&');
  const status = ['draft','published','archived'].includes(options.status || '') ? options.status : null;
  const offset = Number.isSafeInteger(options.offset) ? Math.max(0, Math.min(options.offset!, 10000)) : 0;
  const { rows } = await query<ProductRow & { available_stock: string; low_stock: boolean }>(`SELECT p.*, COALESCE((SELECT SUM(stock-reserved_stock) FROM product_variants WHERE product_id=p.id AND active),0)::text AS available_stock,
    EXISTS(SELECT 1 FROM product_variants WHERE product_id=p.id AND active AND stock-reserved_stock <= 5) AS low_stock
    FROM products p WHERE ($1::text IS NULL OR p.title ILIKE $1 OR p.id ILIKE $1) AND ($2::text IS NULL OR p.status=$2)
    AND (NOT $3::boolean OR EXISTS(SELECT 1 FROM product_variants WHERE product_id=p.id AND active AND stock-reserved_stock <= 5))
    ORDER BY p.updated_at DESC,p.id LIMIT 21 OFFSET $4`, [search ? `%${search}%` : null, status, Boolean(options.lowStock), offset]);
  const categories = await query<{ id: string; name: string; slug: string }>('SELECT id,name,slug FROM categories ORDER BY name,id LIMIT 100');
  return { products: rows.slice(0, 20).map((row): MerchantSummary => ({ id: row.id, title: row.title, status: row.status, revision: row.revision, image: row.images[0] || null, availableStock: Number(row.available_stock), lowStock: row.low_stock, updatedAt: row.updated_at.toISOString() })), categories: categories.rows, nextOffset: rows.length > 20 ? offset + 20 : null };
}
export async function saveMerchantProduct(actorId: string, value: unknown, id?: string) {
  const input = productInput(value, Boolean(id));
  if (id) merchantId(id);
  return transaction(async client => {
    const creationKey = `${actorId}:${input.requestKey}`;
    const creationHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    if (!id) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`merchant-create:${creationKey}`]);
      // Freeze the cached aggregate as well: a creation retry may race a later edit.
      const prior = await client.query<{ id: string; creation_hash: string }>('SELECT id,creation_hash FROM products WHERE creation_key=$1 FOR SHARE', [creationKey]);
      if (prior.rows[0]) {
        if (prior.rows[0].creation_hash !== creationHash) throw new ApiError(409, 'save_reference_changed', 'This new product was already saved with different details. Reload the catalogue to edit it.');
        return detail(client, prior.rows[0].id);
      }
    }
    // Product first, then variants in ID order. Checkout takes product share locks before variants.
    const existing = id ? (await client.query<ProductRow>('SELECT * FROM products WHERE id=$1 FOR UPDATE', [id])).rows[0] : undefined;
    if (id && !existing) throw new ApiError(404, 'product_not_found', 'This product was not found.');
    if (existing && existing.revision !== input.revision) throw new ApiError(409, 'product_changed', 'This product was edited elsewhere. Your form is intact; reload the latest product before saving.');
    validateMerchantImages(input.images, existing?.images);
    const category = await client.query('SELECT id FROM categories WHERE id=$1 FOR KEY SHARE', [input.categoryId]);
    if (!category.rowCount) throw new ApiError(400, 'invalid_category', 'Choose an existing category.');
    const previous = existing ? (await client.query<VariantRow>('SELECT * FROM product_variants WHERE product_id=$1 ORDER BY id FOR UPDATE', [id])).rows : [];
    const known = new Map(previous.map(row => [row.id, row]));
    if (input.variants.some(row => row.id && !known.has(row.id))) throw new ApiError(400, 'variant_ownership', 'A supplied variant does not belong to this product.');
    if (previous.some(row => !input.variants.some(next => next.id === row.id))) throw new ApiError(400, 'variant_missing', 'Existing variants must be kept. Disable a discontinued variant instead of deleting its history.');
    const productId = id || `${input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 65) || 'product'}-${randomUUID()}`;
    const fields = [productId, input.title, input.description, input.categoryId, input.images, input.stone || null, input.dimensions || null, input.careInstructions || null, input.status, input.factsConfirmed];
    if (existing) await client.query('UPDATE products SET title=$2,description=$3,category_id=$4,images=$5,stone=$6,dimensions=$7,care_instructions=$8,status=$9,facts_confirmed=$10,revision=revision+1,updated_at=now() WHERE id=$1', fields);
    else await client.query('INSERT INTO products(id,title,description,category_id,images,stone,dimensions,care_instructions,status,facts_confirmed,creation_key,creation_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [...fields, creationKey, creationHash]);
    for (const variant of input.variants) {
      const old = variant.id ? known.get(variant.id)! : undefined;
      const stockBefore = old?.stock || 0;
      const stockAfter = stockBefore + variant.stockAdjustment;
      if (stockAfter < (old?.reserved_stock || 0) || stockAfter > 1_000_000) throw new ApiError(409, 'stock_conflict', 'This adjustment would remove reserved stock or exceed the stock limit. Reload the current inventory.');
      const variantId = variant.id || `v-${randomUUID()}`;
      if (old) await client.query('UPDATE product_variants SET metal_type=$2,purity=$3,size=$4,price=$5,stock=$6,active=$7 WHERE id=$1', [variantId, variant.metalType, variant.purity, variant.size || null, variant.price, stockAfter, variant.active]);
      else await client.query('INSERT INTO product_variants(id,product_id,metal_type,purity,size,price,stock,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [variantId, productId, variant.metalType, variant.purity, variant.size || null, variant.price, stockAfter, variant.active]);
      if (variant.stockAdjustment) await client.query('INSERT INTO merchant_stock_events(product_id,variant_id,actor_id,adjustment,stock_before,stock_after,reason) VALUES($1,$2,$3,$4,$5,$6,$7)', [productId, variantId, actorId, variant.stockAdjustment, stockBefore, stockAfter, input.stockReason]);
    }
    return detail(client, productId);
  });
}
