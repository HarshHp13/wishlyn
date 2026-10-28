import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bagMatchesPurchase } from '../../src/lib/commerce/bag-match';

const savedQuote = [{ variantId: 'piece-a', quantity: 1, giftWrap: true, giftMessage: 'For A' }];

test('paying a saved quote preserves a different current bag', () => {
  assert.equal(bagMatchesPurchase([{ variantId: 'piece-b', quantity: 1, giftWrap: false }], savedQuote), false);
  assert.equal(bagMatchesPurchase([...savedQuote, { variantId: 'piece-b', quantity: 1, giftWrap: false, giftMessage: '' }], savedQuote), false);
});

test('changes during payment preserve new quantities, variants and personalizations', () => {
  assert.equal(bagMatchesPurchase([{ ...savedQuote[0], quantity: 2 }], savedQuote), false);
  assert.equal(bagMatchesPurchase([{ ...savedQuote[0], giftMessage: 'For B' }], savedQuote), false);
  assert.equal(bagMatchesPurchase([{ ...savedQuote[0], variantId: 'piece-a-other-size' }], savedQuote), false);
  assert.equal(bagMatchesPurchase([], savedQuote), false);
});

test('only the exact purchased configurations and aggregate quantities can clear', () => {
  assert.equal(bagMatchesPurchase(savedQuote, savedQuote), true);
  assert.equal(bagMatchesPurchase([{ ...savedQuote[0], quantity: 2 }], [...savedQuote, ...savedQuote]), true);
  assert.equal(bagMatchesPurchase([{ ...savedQuote[0], giftMessage: ' For A ' }], savedQuote), true);
  assert.equal(bagMatchesPurchase([{ ...savedQuote[0], quantity: NaN }], savedQuote), false);
});
