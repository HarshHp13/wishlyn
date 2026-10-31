import test from 'node:test';
import assert from 'node:assert/strict';
import { safeInternalRedirect } from '../../src/lib/safeRedirect';
const origin = 'https://store.example.test';
test('login return URLs reject protocol-relative origins, backslashes and decoded or encoded controls', () => {
  const queries = ['/%0a/attacker.invalid', '/%09/attacker.invalid', '/%0d/attacker.invalid', '//attacker.invalid', '/%5cattacker.invalid', '/%00/attacker.invalid', '/%250a/attacker.invalid'];
  for (const query of queries) {
    const candidate = new URLSearchParams(`redirect=${query}`).get('redirect');
    assert.equal(safeInternalRedirect(candidate, origin), '/profile', query);
  }
  for (const candidate of ['javascript:alert(1)', 'https://attacker.invalid', '\\attacker.invalid', '/\\attacker.invalid', '/\u0085/attacker.invalid', null]) assert.equal(safeInternalRedirect(candidate, origin), '/profile');
});
test('normal internal paths retain query/hash and resolve against the store origin', () => {
  for (const candidate of ['/checkout', '/orders/order-123?from=checkout#receipt', '/?search=gold%20tone&sort=price', '/profile?next=https%3A%2F%2Fexample.test']) {
    const result = safeInternalRedirect(candidate, origin);
    assert.equal(result, candidate);
    assert.equal(new URL(result, origin).origin, origin);
  }
});
