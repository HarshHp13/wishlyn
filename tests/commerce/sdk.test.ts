import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadRazorpay } from '../../src/lib/commerce/razorpay-client';

test('SDK failure/timeout resolves within a bound and retry replaces failed elements', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  type Script = { src: string; async: boolean; dataset: Record<string, string>; onload: (() => void) | null; onerror: (() => void) | null; remove(): void };
  let attached: Script | undefined;
  let removed = 0, appended = 0;
  const fakeWindow: { Razorpay?: unknown } = {};
  const fakeDocument = {
    querySelector: () => attached,
    createElement: () => ({ src: '', async: false, dataset: {}, onload: null, onerror: null, remove() { removed++; if (attached === this) attached = undefined; } }) as Script,
    head: { appendChild(script: Script) { attached = script; appended++; } },
  };
  Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: fakeDocument, configurable: true });
  try {
    const first = loadRazorpay(100);
    assert.equal(loadRazorpay(100), first, 'concurrent clicks share one script request');
    attached?.onerror?.();
    await assert.rejects(first, /could not load/);
    assert.equal(removed, 1);
    await assert.rejects(loadRazorpay(10), /too long/);
    assert.equal(removed, 2);
    const third = loadRazorpay(100);
    class FakeRazorpay { open() {} on() {} }
    fakeWindow.Razorpay = FakeRazorpay;
    attached?.onload?.();
    assert.equal(await third, FakeRazorpay);
    assert.equal(appended, 3);
    assert.equal(await loadRazorpay(), FakeRazorpay);
    assert.equal(appended, 3);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else Reflect.deleteProperty(globalThis, 'document');
  }
});
