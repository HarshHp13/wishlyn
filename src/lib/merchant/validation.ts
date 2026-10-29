import { ApiError, requireObject } from '../api';
import type { ProductStatus } from './types';
import { isProductImageUrl } from '../productImages';

function invalid(message: string): never { throw new ApiError(400, 'invalid_product', message); }
function text(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) invalid(`${label} must be text of at most ${max} characters.`);
  const clean = value.trim();
  if (required && !clean) invalid(`${label} is required.`);
  return clean;
}
export function merchantId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)) invalid('Choose a valid product or variant.');
  return value;
}
export interface VariantInput {
  id?: string; metalType: string; purity: string; size: string; price: number;
  stockAdjustment: number; active: boolean;
}
export function productInput(value: unknown, editing: boolean) {
  const body = requireObject(value);
  if (!editing && (typeof body.requestKey !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(body.requestKey))) invalid('Start a new product form to obtain a save reference.');
  if ((!editing && body.id !== undefined) || body.product_id !== undefined) invalid('New product identifiers are assigned by the store.');
  const status = body.status;
  if (!['draft','published','archived'].includes(String(status)) || (!editing && status === 'archived')) invalid('Choose draft or published for a new product.');
  if (editing && (!Number.isSafeInteger(body.revision) || Number(body.revision) < 1)) invalid('Reload the product before editing it.');
  if (typeof body.factsConfirmed !== 'boolean') invalid('Confirm whether product facts have been checked.');
  if (!Array.isArray(body.images) || body.images.length > 10 || body.images.some(image => typeof image !== 'string' || image.length > 2048)) invalid('Choose at most ten product images.');
  if (new Set(body.images).size !== body.images.length) invalid('Product images must not be repeated.');
  if (!Array.isArray(body.variants) || body.variants.length < 1 || body.variants.length > 50) invalid('Supply between one and fifty variants.');
  const variants: VariantInput[] = body.variants.map((value, i) => {
    const row = requireObject(value);
    if (row.product_id !== undefined || row.productId !== undefined || row.stock !== undefined || row.reservedStock !== undefined || row.reserved_stock !== undefined) invalid('Stock changes must use an adjustment; variant ownership is assigned by the store.');
    if (!editing && row.id !== undefined) invalid('New variant identifiers are assigned by the store.');
    const id = row.id === undefined ? undefined : merchantId(row.id);
    if (typeof row.price !== 'number' || !Number.isFinite(row.price) || row.price <= 0 || row.price > 1_000_000 || Math.abs(row.price * 100 - Math.round(row.price * 100)) > 0.000001) invalid(`Variant ${i + 1} needs a positive price with at most two decimal places.`);
    if (!Number.isSafeInteger(row.stockAdjustment) || Math.abs(Number(row.stockAdjustment)) > 1_000_000 || (!id && Number(row.stockAdjustment) < 0)) invalid(`Variant ${i + 1} needs a whole stock adjustment within one million units.`);
    if (typeof row.active !== 'boolean') invalid(`Choose availability for variant ${i + 1}.`);
    return { id, metalType: text(row.metalType, 'Material / metal', 64, true), purity: text(row.purity, 'Finish / purity', 64, true), size: text(row.size, 'Size', 32), price: row.price, stockAdjustment: Number(row.stockAdjustment), active: row.active };
  });
  const ids = variants.flatMap(row => row.id ? [row.id] : []);
  if (new Set(ids).size !== ids.length) invalid('A variant cannot be repeated.');
  const options = variants.filter(row => row.active).map(row => JSON.stringify([row.metalType.toLowerCase(), row.purity.toLowerCase(), row.size.toLowerCase()]));
  if (new Set(options).size !== options.length) invalid('Active variants must have distinct material, finish and size combinations.');
  const result = {
    title: text(body.title, 'Title', 255, true), description: text(body.description, 'Description', 10000),
    categoryId: text(body.categoryId, 'Category', 64, true), images: body.images as string[],
    stone: text(body.stone, 'Stone', 255), dimensions: text(body.dimensions, 'Dimensions', 255),
    careInstructions: text(body.careInstructions, 'Care instructions', 5000), status: status as ProductStatus,
    factsConfirmed: body.factsConfirmed, revision: editing ? Number(body.revision) : 0, requestKey: editing ? '' : body.requestKey as string,
    stockReason: text(body.stockReason, 'Stock adjustment reason', 500), variants,
  };
  if (variants.some(row => row.stockAdjustment !== 0) && !result.stockReason) invalid('Explain the stock adjustment so it can be recorded in history.');
  if (status === 'published' && (!result.description || !result.images.length || !result.factsConfirmed || !variants.some(row => row.active))) invalid('Publishing requires a description, a product image, checked facts and at least one active variant. Save a draft while details are incomplete.');
  return result;
}

/** Keep legacy images only on their original product; new media comes from this store's upload service. */
export function validateMerchantImages(images: string[], previous: string[] = []) {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  for (const image of images) {
    if (previous.includes(image) && isProductImageUrl(image)) continue;
    let valid = false;
    try {
      const url = new URL(image);
      valid = Boolean(cloud && /^[a-z0-9_-]+$/i.test(cloud) && url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.search && !url.hash && url.hostname === 'res.cloudinary.com' && url.pathname.startsWith(`/${cloud}/image/upload/`) && url.pathname.length > `/${cloud}/image/upload/`.length);
    } catch { /* Invalid media is rejected below. */ }
    if (!valid) invalid('New images must be uploaded through the configured store image service. Existing images may be kept or removed.');
  }
}
