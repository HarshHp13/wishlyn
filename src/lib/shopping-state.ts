import { isProductImageUrl } from './productImages';
import type { Product, ProductVariant } from '../data/db';

export const SHOPPING_VERSION = 2;
export const MAX_SHOPPING_ITEMS = 50;
export const MAX_QUANTITY = 99;

export interface CartItem {
  id: string;
  variantId: string;
  product: Product;
  variant: ProductVariant;
  quantity: number;
  giftWrap: boolean;
  giftMessage?: string;
  unavailable?: boolean;
}

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
export const validId = (v: unknown): v is string => text(v, 160) && /^[a-zA-Z0-9_-]+$/.test(v);

export function lineId(variantId: string, giftWrap: boolean, message?: string): string {
  return JSON.stringify([variantId, giftWrap, giftWrap ? (message || '').trim().slice(0, 150) : '']);
}

export function validProduct(value: unknown): value is Product {
  if (!record(value) || !validId(value.id) || !text(value.title, 300) || typeof value.description !== 'string' || value.description.length > 20000 || !validId(value.categoryId) || !finite(value.basePrice) || value.basePrice > 1000000) return false;
  if (!Array.isArray(value.images) || value.images.length > 20 || !value.images.every(isProductImageUrl)) return false;
  return finite(value.rating) && finite(value.reviewsCount) && record(value.details) && Object.values(value.details).every(v => v === undefined || typeof v === 'string');
}

export function validVariant(value: unknown): value is ProductVariant {
  return record(value) && validId(value.id) && validId(value.productId) && text(value.metalType) && typeof value.purity === 'string' && value.purity.length <= 100 &&
    (value.size === undefined || text(value.size, 100)) && finite(value.price) && value.price <= 1000000 && Number.isSafeInteger(value.stock) && Number(value.stock) >= 0;
}

export function decodeCart(raw: string | null): { items: CartItem[]; recovered: boolean } {
  if (!raw) return { items: [], recovered: false };
  if (raw.length > 1000000) return { items: [], recovered: true };
  try {
    const data: unknown = JSON.parse(raw);
    if (!record(data) || data.version !== SHOPPING_VERSION || !Array.isArray(data.items)) return { items: [], recovered: true };
    const items: CartItem[] = [];
    let recovered = data.items.length > MAX_SHOPPING_ITEMS;
    for (const value of data.items.slice(0, MAX_SHOPPING_ITEMS)) {
      if (!record(value) || !validProduct(value.product) || !validVariant(value.variant) || value.variantId !== value.variant.id || value.product.id !== value.variant.productId ||
        !Number.isSafeInteger(value.quantity) || Number(value.quantity) < 1 || Number(value.quantity) > MAX_QUANTITY || typeof value.giftWrap !== 'boolean' ||
        (value.giftMessage !== undefined && (typeof value.giftMessage !== 'string' || value.giftMessage.length > 150))) { recovered = true; continue; }
      const giftMessage = value.giftWrap ? String(value.giftMessage || '').trim() : undefined;
      const item: CartItem = { id: lineId(value.variant.id, value.giftWrap, giftMessage), variantId: value.variant.id, product: value.product, variant: value.variant, quantity: Number(value.quantity), giftWrap: value.giftWrap, giftMessage, unavailable: value.unavailable === true };
      const existing = items.find(i => i.id === item.id);
      if (existing) { existing.quantity = Math.min(MAX_QUANTITY, existing.quantity + item.quantity); recovered = true; }
      else items.push(item);
    }
    return { items, recovered };
  } catch { return { items: [], recovered: true }; }
}

export function decodeWishlist(raw: string | null): { items: string[]; recovered: boolean } {
  if (!raw) return { items: [], recovered: false };
  if (raw.length > 1000000) return { items: [], recovered: true };
  try {
    const data: unknown = JSON.parse(raw);
    if (!record(data) || data.version !== SHOPPING_VERSION || !Array.isArray(data.items)) return { items: [], recovered: true };
    const items = [...new Set(data.items.filter(validId))].slice(0, MAX_SHOPPING_ITEMS);
    return { items, recovered: items.length !== data.items.length };
  } catch { return { items: [], recovered: true }; }
}

export function encodeShopping<T>(items: T[]): string { return JSON.stringify({ version: SHOPPING_VERSION, items }); }
export function shoppingKey(kind: string, accountId: string | null): string { return `wishlyn-v2-${kind}-${accountId ? `account-${accountId}` : 'guest'}`; }

export function addCartLine(items: CartItem[], input: Omit<CartItem, 'id'>): CartItem[] {
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > MAX_QUANTITY || !validProduct(input.product) || !validVariant(input.variant) || input.variantId !== input.variant.id || input.product.id !== input.variant.productId) return items;
  const id = lineId(input.variantId, input.giftWrap, input.giftMessage);
  const used = items.filter(i => i.variantId === input.variantId).reduce((sum, i) => sum + i.quantity, 0);
  const existing = items.find(i => i.id === id);
  const quantity = Math.min(input.quantity, input.variant.stock - used, MAX_QUANTITY - (existing?.quantity || 0));
  if (quantity <= 0 || (!existing && items.length >= MAX_SHOPPING_ITEMS)) return items;
  const fresh = { ...input, giftMessage: input.giftWrap ? (input.giftMessage || '').trim().slice(0, 150) : undefined, id, quantity: (existing?.quantity || 0) + quantity, unavailable: false };
  return existing ? items.map(i => i.id === id ? fresh : i) : [...items, fresh];
}

export function changeQuantity(items: CartItem[], id: string, quantity: number): CartItem[] {
  if (!Number.isSafeInteger(quantity) || quantity < 1) return items;
  return items.map(item => {
    if (item.id !== id || item.unavailable) return item;
    const other = items.filter(i => i.variantId === item.variantId && i.id !== id).reduce((sum, i) => sum + i.quantity, 0);
    const available = Math.max(0, item.variant.stock - other);
    return available ? { ...item, quantity: Math.min(quantity, available, MAX_QUANTITY) } : item;
  });
}

export function reconcileCart(items: CartItem[], current: { product: Product; variant: ProductVariant }[]): { items: CartItem[]; changed: boolean } {
  let changed = false;
  const reconciled = items.map(item => {
    const found = current.find(row => row.variant.id === item.variantId && row.product.id === item.product.id);
    if (!found || !validProduct(found.product) || !validVariant(found.variant)) { changed ||= !item.unavailable; return { ...item, unavailable: true }; }
    changed ||= item.variant.price !== found.variant.price || item.variant.stock !== found.variant.stock || !!item.unavailable;
    return { ...item, ...found, unavailable: false };
  });
  return { items: reconciled, changed };
}

export function cartHasUnavailable(items: CartItem[]): boolean {
  return items.some(item => item.unavailable || items.filter(i => i.variantId === item.variantId).reduce((sum, i) => sum + i.quantity, 0) > item.variant.stock);
}
