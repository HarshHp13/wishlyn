import { query as databaseQuery } from './database';
import type { DbProduct, DbVariant } from './neon';
import type { CatalogueFilters } from './catalogue-filters';

export class CatalogueUnavailableError extends Error {
  constructor() { super('The catalogue is temporarily unavailable. Please retry.'); this.name = 'CatalogueUnavailableError'; }
}
async function query<T>(statement: string, values: unknown[] = []): Promise<T[]> {
  try {
    return (await databaseQuery(statement, values)).rows as T[];
  } catch { throw new CatalogueUnavailableError(); }
}
const published = "COALESCE(to_jsonb(p)->>'status', 'published') = 'published'";
const columns = `p.id, p.title, p.description, p.category_id, p.images, p.rating, p.reviews_count,
 p.stone, p.dimensions, p.care_instructions, p.created_at,
 (SELECT MIN(price) FROM product_variants WHERE product_id = p.id AND COALESCE((to_jsonb(product_variants)->>'active')::boolean,true)) AS base_price`;
const availableStock = "v.stock - COALESCE((to_jsonb(v)->>'reserved_stock')::integer, 0)";

export async function cataloguePage(filters: CatalogueFilters, limit = 8) {
  const search = filters.search.replace(/[\\%_]/g, '\\$&');
  const values = [filters.category || null, search ? `%${search}%` : null, filters.maxPrice ?? null];
  const where = `${published} AND EXISTS (SELECT 1 FROM product_variants WHERE product_id = p.id AND COALESCE((to_jsonb(product_variants)->>'active')::boolean,true))
    AND ($1::text IS NULL OR p.category_id = $1)
    AND ($2::text IS NULL OR p.title ILIKE $2 OR p.description ILIKE $2)
    AND ($3::numeric IS NULL OR (SELECT MIN(price) FROM product_variants WHERE product_id = p.id AND COALESCE((to_jsonb(product_variants)->>'active')::boolean,true)) <= $3)`;
  const order = filters.sort === 'price-low' ? 'base_price ASC, p.id ASC' : filters.sort === 'price-high' ? 'base_price DESC, p.id ASC' : 'p.created_at DESC, p.id ASC';
  const count = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM products p WHERE ${where}`, values);
  const total = Number(count[0].count);
  const pageSize = Math.max(1, Math.min(48, limit));
  const page = Math.min(filters.page, Math.max(1, Math.ceil(total / pageSize)));
  const rows = await query<DbProduct>(`SELECT ${columns} FROM products p WHERE ${where} ORDER BY ${order} LIMIT $4 OFFSET $5`, [...values, pageSize, (page - 1) * pageSize]);
  return { rows, total, page, pageSize };
}
export async function catalogueCategories() {
  return query<{ id: string; name: string; slug: string }>(`SELECT c.id, c.name, c.slug FROM categories c WHERE EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id AND ${published} AND EXISTS (SELECT 1 FROM product_variants WHERE product_id = p.id AND COALESCE((to_jsonb(product_variants)->>'active')::boolean,true))) ORDER BY c.id LIMIT 100`);
}
export async function catalogueHighlights() {
  return query<DbProduct>(`SELECT DISTINCT ON (p.category_id) ${columns} FROM products p WHERE ${published} AND EXISTS (SELECT 1 FROM product_variants WHERE product_id = p.id AND COALESCE((to_jsonb(product_variants)->>'active')::boolean,true)) ORDER BY p.category_id, p.created_at DESC, p.id LIMIT 12`);
}
export async function catalogueProduct(id: string) {
  const rows = await query<DbProduct>(`SELECT ${columns} FROM products p WHERE p.id = $1 AND ${published} LIMIT 1`, [id]);
  return rows[0] || null;
}
export async function catalogueProductsByIds(ids: string[]) {
  if (!ids.length) return [];
  return query<DbProduct>(`SELECT ${columns} FROM products p WHERE p.id = ANY($1::text[]) AND ${published} LIMIT 50`, [ids.slice(0, 50)]);
}
export async function catalogueVariants(productId: string) {
  return query<DbVariant>(`SELECT v.id, v.product_id, v.size, v.metal_type, v.purity, v.price, ${availableStock} AS stock FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.product_id = $1 AND ${published} AND COALESCE((to_jsonb(v)->>'active')::boolean,true) ORDER BY v.id LIMIT 200`, [productId]);
}
export async function catalogueVariantsByIds(ids: string[]) {
  if (!ids.length) return [];
  return query<DbVariant>(`SELECT v.id, v.product_id, v.size, v.metal_type, v.purity, v.price, ${availableStock} AS stock FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = ANY($1::text[]) AND ${published} AND COALESCE((to_jsonb(v)->>'active')::boolean,true) LIMIT 50`, [ids.slice(0, 50)]);
}
export async function catalogueRelated(productId: string, categoryId: string) {
  const rows = await query<DbProduct>(`SELECT ${columns} FROM products p WHERE p.id <> $1 AND p.category_id = $2 AND ${published} AND EXISTS (SELECT 1 FROM product_variants WHERE product_id = p.id AND COALESCE((to_jsonb(product_variants)->>'active')::boolean,true)) ORDER BY p.created_at DESC, p.id LIMIT 1`, [productId, categoryId]);
  return rows[0] || null;
}
export async function catalogueSitemap(offset = 0) {
  return query<{ id: string; created_at: string }>(`SELECT p.id, p.created_at FROM products p WHERE ${published} AND EXISTS (SELECT 1 FROM product_variants WHERE product_id = p.id AND COALESCE((to_jsonb(product_variants)->>'active')::boolean,true)) ORDER BY p.id LIMIT 5000 OFFSET $1`, [offset]);
}
export async function catalogueSize() {
  const rows = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM products p WHERE ${published} AND EXISTS (SELECT 1 FROM product_variants WHERE product_id = p.id AND COALESCE((to_jsonb(product_variants)->>'active')::boolean,true))`);
  return Number(rows[0].count);
}
