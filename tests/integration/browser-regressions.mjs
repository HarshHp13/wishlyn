/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI consumes a callable expression. */
async page => {
  const origin = 'http://localhost:3126';
  const context = page.context();
  await context.unrouteAll({ behavior: 'wait' });
  const check = (value, message) => { if (!value) throw new Error(message); };
  const user = { id: 'integration-customer', email: 'fixture@example.test', role: 'customer' };
  const first = `WISH-${'A'.repeat(32)}`, second = `WISH-${'B'.repeat(32)}`;
  const shipping = { firstName: 'Asha', lastName: 'Fixture', phone: '9876543210', address: '123 Synthetic Street', city: 'Mumbai', state: 'Maharashtra', zipCode: '400001', country: 'India' };
  const product = { id: 'fixture-01', title: 'Synthetic checkout piece', description: 'Fixture only', categoryId: 'earrings', basePrice: 199, images: [], rating: 0, reviewsCount: 0, details: {} };
  const variant = { id: 'variant-1', productId: product.id, metalType: 'Fixture material', purity: 'Plated', price: 199, stock: 100 };
  const order = { id: first, ownerId: user.id, email: user.email, items: [{ variantId: variant.id, productId: product.id, title: 'First saved order piece', metalType: variant.metalType, purity: variant.purity, size: null, image: null, quantity: 1, giftWrap: false, giftMessage: '', unitPricePaise: 19900, giftWrapPaise: 0, lineTotalPaise: 19900 }], shipping, currency: 'INR', subtotalPaise: 19900, shippingPaise: 25000, taxPaise: 600, totalPaise: 45500, status: 'pending_payment', reservationState: 'active', paymentSetupState: 'idle', providerOrderId: null, providerPaymentId: null, fulfillmentStatus: 'unfulfilled', trackingCarrier: null, trackingNumber: null, trackingUrl: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 900000).toISOString() };
  let holdOrderRead = false, releaseOrderRead, notifyOrderRead;
  let failedSecond = 0, quotePayload, orderStatus = 'pending_payment', secondAvailable = false;
  const paymentRequests = [], pageErrors = [];
  let releaseSdk, notifySdk;
  const sdkStarted = new Promise(resolve => { notifySdk = resolve; });
  const resumeSdk = new Promise(resolve => { releaseSdk = resolve; });
  let authMode = 'normal', authCount = 0, releaseFirst, releaseSecond, notifyFirst, notifySecond;
  page.on('pageerror', error => pageErrors.push(error.message));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.hostname === 'checkout.razorpay.com') { notifySdk(); await resumeSdk; return route.fulfill({ contentType: 'application/javascript', body: 'window.Razorpay = class { on(){} open(){} };' }); }
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/auth/me') {
        if (authMode === 'superseded') {
          authCount++;
          if (authCount === 1) { notifyFirst(); await new Promise(resolve => { releaseFirst = resolve; }); }
          else if (authCount === 2) { notifySecond(); await new Promise(resolve => { releaseSecond = resolve; }); }
        }
        return route.fulfill({ json: { user } });
      }
      if (url.pathname === `/api/orders/${first}`) {
        if (holdOrderRead) { notifyOrderRead(); await new Promise(resolve => { releaseOrderRead = resolve; }); }
        return route.fulfill({ json: { viewerId: user.id, order: { ...order, status: orderStatus } } });
      }
      if (url.pathname === `/api/orders/${second}`) {
        if (secondAvailable) return route.fulfill({ json: { viewerId: user.id, order: { ...order, id: second, items: [{ ...order.items[0], title: 'Recovered second saved piece' }] } } });
        failedSecond++; return route.fulfill({ status: 503, json: { error: 'Second order is temporarily unavailable' } });
      }
      if (url.pathname === '/api/account/addresses') return route.fulfill({ json: { viewerId: user.id, ownerId: user.id, addresses: [{ ...shipping, id: 'address-fixture', version: 1, label: 'Home fixture' }] } });
      if (url.pathname === '/api/cart-products') return route.fulfill({ json: { items: [{ product, variant }] } });
      if (url.pathname === '/api/checkout/quote') { quotePayload = request.postDataJSON(); return route.fulfill({ json: { viewerId: user.id, order } }); }
      if (url.pathname === '/api/create-order') { paymentRequests.push(request.postDataJSON().orderId); return route.fulfill({ status: 503, json: { error: 'Synthetic provider operation blocked' } }); }
      return route.fulfill({ status: 503, json: { error: 'Unused synthetic API blocked' } });
    }
    if (!['GET', 'HEAD'].includes(request.method())) return route.abort();
    return route.continue();
  });
  await page.goto(`${origin}/checkout?order=${first}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Review your order', exact: true }).waitFor();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /^Pay / }).click();
  await sdkStarted;
  await page.evaluate(path => window.history.pushState({}, '', path), `/checkout?order=${second}`);
  await page.getByRole('alert').filter({ hasText: 'Second order is temporarily unavailable' }).waitFor();
  check(await page.getByText('First saved order piece', { exact: true }).count() === 0, 'Old order leaked into new reference');
  check(await page.getByRole('button', { name: /^Pay / }).count() === 0, 'Old order remains payable');
  check(await page.getByRole('button', { name: 'Retry loading order', exact: true }).isVisible(), 'Saved-order retry missing');
  releaseSdk();
  await page.waitForFunction(() => typeof window.Razorpay === 'function');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  check(paymentRequests.length === 0 && failedSecond > 0, 'Unexpected payment request');
  secondAvailable = true;
  await page.getByRole('button', { name: 'Retry loading order', exact: true }).click();
  await page.getByText('Recovered second saved piece', { exact: true }).waitFor();
  check(!await page.getByRole('checkbox').isChecked(), 'Recovered order retained old payment approval');

  authMode = 'superseded'; authCount = 0;
  const startedFirst = new Promise(resolve => { notifyFirst = resolve; });
  const startedSecond = new Promise(resolve => { notifySecond = resolve; });
  await page.goto(`${origin}/checkout?order=${first}`, { waitUntil: 'domcontentloaded' });
  await startedFirst;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await startedSecond;
  const oldResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/me');
  releaseFirst(); await oldResponse;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  check(page.url().includes('/checkout?order='), 'Superseded auth redirected to login');
  await page.getByText('Verifying your account…', { exact: true }).waitFor();
  releaseSecond();
  await page.getByRole('heading', { name: 'Review your order', exact: true }).waitFor();
  authMode = 'normal';
  orderStatus = 'cancelled';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByText('This order is cancelled.', { exact: false }).waitFor();
  check(await page.getByRole('button', { name: /^Pay / }).count() === 0, 'Same-account revalidation left cancelled order payable');
  orderStatus = 'pending_payment';
  await page.goto(`${origin}/orders/${first}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Awaiting payment', exact: true }).waitFor();
  orderStatus = 'paid'; holdOrderRead = true;
  const orderReadStarted = new Promise(resolve => { notifyOrderRead = resolve; });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await orderReadStarted;
  await page.getByText('Loading order details…', { exact: true }).waitFor();
  check(await page.getByRole('button', { name: 'Cancel unpaid order', exact: true }).count() === 0, 'Stale cancel action appeared before refreshed order status');
  check(await page.getByRole('link', { name: 'Review and pay', exact: true }).count() === 0, 'Stale payment link appeared before refreshed order status');
  releaseOrderRead(); holdOrderRead = false;
  await page.getByRole('heading', { name: 'Payment confirmed', exact: true }).waitFor();
  check(await page.getByRole('button', { name: 'Cancel unpaid order', exact: true }).count() === 0, 'Paid order remains cancellable');
  orderStatus = 'pending_payment';

  const key = `wishlyn-v2-cart-account-${user.id}`;
  const line = { id: JSON.stringify([variant.id, false, '']), variantId: variant.id, product, variant: { ...variant, price: 20000 }, quantity: 99, giftWrap: false };
  await page.evaluate(({ key, line }) => localStorage.setItem(key, JSON.stringify({ version: 2, items: [line] })), { key, line });
  await page.goto(`${origin}/checkout`, { waitUntil: 'domcontentloaded' });
  await page.locator('main').getByText('Reduce your bag to a subtotal of', { exact: false }).waitFor();
  check(await page.getByRole('heading', { name: 'Something went wrong', exact: true }).count() === 0, 'Large bag crashed checkout');
  await page.goto(`${origin}/checkout?order=${first}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Review your order', exact: true }).waitFor();
  check(await page.getByRole('button', { name: /^Pay / }).isVisible(), 'Large unrelated bag blocked saved purchase');

  await page.evaluate(({ key, line }) => localStorage.setItem(key, JSON.stringify({ version: 2, items: [{ ...line, quantity: 1, variant: { ...line.variant, price: 199 } }] })), { key, line });
  await page.goto(`${origin}/checkout`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Choose an address', { exact: true }).selectOption('address-fixture');
  check(await page.getByLabel('Street address', { exact: true }).inputValue() === shipping.address, 'Saved delivery details not applied');
  await page.getByRole('button', { name: 'Review current total', exact: true }).click();
  await page.getByRole('heading', { name: 'Review your order', exact: true }).waitFor();
  check(quotePayload.shipping.city === shipping.city && quotePayload.items[0].variantId === variant.id, 'Quote lost saved address/exact variant');
  const layouts = [];
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const geometry = await page.evaluate(() => {
      const logo = document.querySelector('header a[aria-label="Wishlyn home"]').getBoundingClientRect();
      return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, logoCenter: logo.left + logo.width / 2 };
    });
    check(geometry.scrollWidth <= width, `Checkout overflows at ${width}`);
    check(Math.abs(geometry.logoCenter - width / 2) <= 1, `Logo is not centered at ${width}`); layouts.push(geometry);
  }
  await page.evaluate(() => { window.scrollTo({ top: 0, behavior: 'instant' }); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.waitForFunction(() => scrollY === 0);
  await page.screenshot({ path: '/tmp/wishlyn-completion-checkout-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => scrollY === 0);
  await page.screenshot({ path: '/tmp/wishlyn-completion-checkout-mobile.png', fullPage: true });
  check(pageErrors.length === 0, `Runtime errors: ${pageErrors.join('; ')}`);
  return { status: 'PASS', staleSavedOrderHidden: true, retiredSdkActionDoesNotStartPayment: true, failedSavedOrderRetry: true, savedOrderRetryLoads: true, supersededAuthStaysInCheckout: true, sameAccountOrderStatusRefreshed: true, sameAccountOrderReadHidesActions: true, largeBagAdjustment: true, savedPurchaseWithLargeBag: true, savedAddressQuote: true, layouts, pageErrors, paymentRequests, provenance: 'Isolated production Next application; API/provider traffic intercepted with synthetic data; no live purchase' };
}
