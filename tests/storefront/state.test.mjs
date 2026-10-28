import test from 'node:test';
import assert from 'node:assert/strict';
import { addCartLine, cartHasUnavailable, changeQuantity, decodeCart, decodeWishlist, encodeShopping, lineId, reconcileCart, shoppingKey } from '../../src/lib/shopping-state.ts';
import { catalogueUrl, parseCatalogueFilters } from '../../src/lib/catalogue-filters.ts';

export const product = { id: 'piece-1', title: 'Test piece', description: 'Synthetic catalogue fixture', categoryId: 'earrings', basePrice: 199, images: ['/test.png'], rating: 0, reviewsCount: 0, details: {} };
export const variant = { id: 'variant-1', productId: product.id, metalType: 'Listed material', purity: '18K plated', price: 199, stock: 5 };
export const line = { variantId: variant.id, product, variant, quantity: 1, giftWrap: false };

test('unversioned and malformed cart data are recovered without preserving unsafe entries', () => {
  for (const raw of ['no json', '{}', '[{}]', JSON.stringify({ version: 9, items: [] })]) assert.deepEqual(decodeCart(raw), { items: [], recovered: true });
  const valid = addCartLine([], line)[0];
  const invalid = [
    { ...valid, product: { ...product, images: null } },
    { ...valid, product: { ...product, title: {} } },
    { ...valid, product: { ...product, images: ['javascript:alert(1)'] } },
    { ...valid, product: { ...product, images: ['https://unconfigured.example/image.jpg'] } },
    { ...valid, variant: { ...variant, price: -100 } },
    { ...valid, variant: { ...variant, price: 1e308 } },
    { ...valid, variant: { ...variant, stock: 1.2 } },
    { ...valid, variantId: 'other' },
    { ...valid, variant: { ...variant, productId: 'other' } },
    { ...valid, quantity: -1 }, { ...valid, quantity: 0.5 }, { ...valid, quantity: 100 },
    { ...valid, giftMessage: 'x'.repeat(151) },
  ];
  for (const item of invalid) assert.deepEqual(decodeCart(encodeShopping([item])), { items: [], recovered: true });
  assert.equal(decodeCart(encodeShopping([valid, ...invalid])).items.length, 1);
});
test('gift personalization is exact line identity and round-trips independently', () => {
  let items = addCartLine([], { ...line, giftWrap: true, giftMessage: 'For Alice' });
  items = addCartLine(items, { ...line, giftWrap: true, giftMessage: 'For Bob' });
  items = addCartLine(items, { ...line, giftWrap: true, giftMessage: ' For Alice ' });
  items = addCartLine(items, line);
  assert.equal(items.length, 3);
  assert.equal(items[0].quantity, 2);
  assert.deepEqual(decodeCart(encodeShopping(items)).items.map(i => [i.giftMessage, i.quantity]), [['For Alice', 2], ['For Bob', 1], [undefined, 1]]);
  assert.notEqual(lineId(variant.id, true, 'For Alice'), lineId(variant.id, true, 'For Bob'));
  assert.equal(lineId(variant.id, false, 'irrelevant'), lineId(variant.id, false));
});
test('aggregate variant demand is bounded across wrapped/unwrapped lines', () => {
  let items = addCartLine([], { ...line, quantity: 3 });
  items = addCartLine(items, { ...line, quantity: 3, giftWrap: true });
  assert.deepEqual(items.map(i => i.quantity), [3, 2]);
  assert.deepEqual(changeQuantity(items, items[1].id, 10).map(i => i.quantity), [3, 2]);
  assert.equal(addCartLine(items, { ...line, quantity: 1, giftWrap: true, giftMessage: 'Third' }).length, 2);
});
test('reconciliation reprices while preserving gift instructions and exposes shortages', () => {
  const items = addCartLine([], { ...line, quantity: 3, giftWrap: true, giftMessage: 'Keep me' });
  const result = reconcileCart(items, [{ product, variant: { ...variant, price: 299, stock: 2 } }]);
  assert.equal(result.changed, true); assert.equal(result.items[0].variant.price, 299);
  assert.equal(result.items[0].giftMessage, 'Keep me'); assert.equal(result.items[0].quantity, 3);
  assert.equal(cartHasUnavailable(result.items), true);
  assert.equal(cartHasUnavailable(reconcileCart(items, []).items), true);
});
test('account keys are distinct and wishlist validation is bounded', () => {
  assert.notEqual(shoppingKey('cart', 'customer-a'), shoppingKey('cart', 'customer-b'));
  assert.notEqual(shoppingKey('cart', null), shoppingKey('cart', 'customer-a'));
  assert.deepEqual(decodeWishlist(encodeShopping(['piece-1', 'piece-1', null, '../private'])), { items: ['piece-1'], recovered: true });
});
test('filter URLs preserve all independent controls and reset pagination deliberately', () => {
  const filters = parseCatalogueFilters({ category: 'earrings', search: ' gold ', sort: 'price-high', maxPrice: '900', page: '3' });
  const url = catalogueUrl(filters, { category: 'necklaces', page: 1 });
  const query = Object.fromEntries(new URL(url, 'http://fixture').searchParams);
  assert.deepEqual(parseCatalogueFilters(query), { category: 'necklaces', search: 'gold', sort: 'price-high', maxPrice: 900, page: 1 });
  assert.equal(catalogueUrl(filters, { search: '', category: '', maxPrice: undefined, sort: 'newest', page: 1 }), '/#shop');
  assert.equal(parseCatalogueFilters({ maxPrice: '-1', page: 'NaN', sort: 'rating' }).maxPrice, undefined);
  assert.equal(parseCatalogueFilters({ page: '-3' }).page, 1);
});
