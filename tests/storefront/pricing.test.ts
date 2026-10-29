import test from 'node:test';
import assert from 'node:assert/strict';
import { cartSubtotalPaise, estimateTotals } from '../../src/lib/cart-pricing';
import { commerceTotals, GIFT_WRAP_PAISE, MAX_ORDER_PAISE } from '../../src/lib/commerce-rules';
import { addCartLine } from '../../src/lib/shopping-state';

const product = { id: 'piece', title: 'Fixture', description: '', categoryId: 'earrings', basePrice: 20000, images: [], rating: 0, reviewsCount: 0, details: {} };
const variant = { id: 'sku', productId: 'piece', metalType: 'Fixture', purity: '', price: 20000, stock: 100 };
test('valid large persisted bags return an adjustment state instead of throwing at render', () => {
  const items = addCartLine([], { variantId: 'sku', product, variant, quantity: 99, giftWrap: false });
  assert.equal(items.length, 1);
  assert.equal(estimateTotals(cartSubtotalPaise(items)), null);
  assert.equal(estimateTotals(MAX_ORDER_PAISE + 1), null);
  assert.equal(estimateTotals(NaN), null);
  assert.deepEqual(estimateTotals(10000), commerceTotals(10000));
});
test('gift and fractional-rupee estimates use the same integer commercial rules as quotes', () => {
  const items = addCartLine([], { variantId: 'sku', product, variant: { ...variant, price: 0.1 }, quantity: 3, giftWrap: true });
  const paise = 30 + 3 * GIFT_WRAP_PAISE;
  assert.equal(cartSubtotalPaise(items), paise);
  assert.deepEqual(estimateTotals(cartSubtotalPaise(items)), commerceTotals(paise));
});
