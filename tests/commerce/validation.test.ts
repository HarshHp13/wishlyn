import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commerceTotals, GIFT_WRAP_PAISE } from '../../src/lib/commerce-rules';
import { validateShipping, validatePurchaseLines, validateIdempotencyKey } from '../../src/lib/commerce/validation';
import { verifyHmac } from '../../src/lib/commerce/gateway';
import { createHmac } from 'node:crypto';

const address = { firstName: 'Asha', lastName: 'Test', phone: '+91 98765 43210', address: '123 Fixture Street', city: 'Mumbai', state: 'Maharashtra', zipCode: '400001', country: 'India' };

test('delivery details normalize Indian phone and reject unsupported formats', () => {
  assert.equal(validateShipping(address).phone, '+919876543210');
  for (const overrides of [{ country: 'United States' }, { phone: '1234567890' }, { zipCode: '000001' }, { state: 'Unknown' }, { address: 'x' }, { firstName: '  ' }]) assert.throws(() => validateShipping({ ...address, ...overrides }));
});
test('cart quantities are bounded safe integers; invalid lines are never skipped', () => {
  const good = { variantId: 'v1', quantity: 1, giftWrap: false };
  for (const quantity of [-1, 0, .5, NaN, Infinity, '1', 100]) assert.throws(() => validatePurchaseLines([{ ...good, quantity }]));
  for (const lines of [[], [good, {}], [{ ...good, variantId: '' }], [{ ...good, giftWrap: 'true' }], Array.from({ length: 41 }, () => good)]) assert.throws(() => validatePurchaseLines(lines));
});
test('personalization remains part of line identity and duplicates normalize deterministically', () => {
  const line = { variantId: 'v1', quantity: 1, giftWrap: true, giftMessage: '  Hello  ' };
  assert.equal(validatePurchaseLines([line, line])[0].quantity, 2);
  assert.equal(validatePurchaseLines([line, { ...line, giftMessage: 'Other recipient' }]).length, 2);
  assert.throws(() => validatePurchaseLines([{ ...line, giftWrap: false }]));
  assert.throws(() => validatePurchaseLines([{ ...line, giftMessage: 'a'.repeat(151) }]));
});
test('gift and shipping boundary calculations preserve configured integer paise totals', () => {
  assert.deepEqual(commerceTotals(19_900), { subtotalPaise: 19_900, shippingPaise: 25_000, taxPaise: 600, totalPaise: 45_500 });
  assert.equal(commerceTotals(300_000).shippingPaise, 0);
  assert.equal(commerceTotals(299_999).shippingPaise, 25_000);
  assert.equal(GIFT_WRAP_PAISE, 35_000);
  assert.throws(() => commerceTotals(NaN));
  assert.throws(() => commerceTotals(-1));
});
test('request keys and signatures validate strict identity and bytes', () => {
  assert.throws(() => validateIdempotencyKey('short'));
  assert.equal(validateIdempotencyKey('fixture-request-0001'), 'fixture-request-0001');
  const secret = 'synthetic-key-only';
  const signature = createHmac('sha256', secret).update('order_fixture|pay_fixture').digest('hex');
  assert.equal(verifyHmac('order_fixture|pay_fixture', signature, secret), true);
  assert.equal(verifyHmac('order_other|pay_fixture', signature, secret), false);
  assert.equal(verifyHmac('order_fixture|pay_fixture', 'zz'.repeat(32), secret), false);
});
