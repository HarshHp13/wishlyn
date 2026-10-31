/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI consumes this function expression. */
async page => {
  const user = { id: 'browser-fixture-user', email: 'browser@example.test', role: 'customer' };
  const product = { id: 'browser-piece', title: 'Browser fixture piece', description: 'Synthetic test', categoryId: 'test', basePrice: 199, images: ['/logo.png'], rating: 0, reviewsCount: 0, details: {} };
  const variant = { id: 'browser-variant', productId: product.id, metalType: 'Steel', purity: 'Plated', price: 199, stock: 5 };
  const cart = [{ id: 'fixture-gift', variantId: variant.id, product, variant, quantity: 1, giftWrap: true, giftMessage: 'For the recipient' }];
  const shipping = { firstName: 'Asha', lastName: 'Fixture', phone: '+919876543210', address: '123 Browser Test Lane', city: 'Mumbai', state: 'Maharashtra', zipCode: '400001', country: 'India' };
  const order = { id: `WISH-${'A'.repeat(32)}`, ownerId: user.id, email: user.email, items: [{ variantId: variant.id, productId: product.id, title: product.title, metalType: variant.metalType, purity: variant.purity, size: null, image: '/logo.png', quantity: 1, giftWrap: true, giftMessage: cart[0].giftMessage, unitPricePaise: 19900, giftWrapPaise: 35000, lineTotalPaise: 54900 }], shipping, currency: 'INR', subtotalPaise: 54900, shippingPaise: 25000, taxPaise: 1600, totalPaise: 81500, status: 'pending_payment', reservationState: 'active', paymentSetupState: 'idle', providerOrderId: null, providerPaymentId: null, fulfillmentStatus: 'unfulfilled', trackingCarrier: null, trackingNumber: null, trackingUrl: null, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now()+900000).toISOString(), updatedAt: new Date().toISOString(), events: [{ id: '1', type: 'quoted', message: 'Fixture quote saved.', createdAt: new Date().toISOString() }] };
  let sdkAttempt = 0, createRequests = 0, quoteRequests = 0;
  await page.context().route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.hostname === 'checkout.razorpay.com') {
      sdkAttempt++;
      if (sdkAttempt === 1) return route.abort();
      return route.fulfill({ contentType: 'application/javascript', body: 'window.Razorpay = class { constructor(options) { this.options=options; } on() {} open() { this.options.modal.ondismiss(); } };' });
    }
    if (url.origin !== 'http://localhost:3102') return route.abort();
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: { user } });
      if (url.pathname === '/api/checkout/quote') { quoteRequests++; return route.fulfill({ status: 201, json: { order } }); }
      if (url.pathname === '/api/create-order') { createRequests++; order.paymentSetupState='bound'; order.providerOrderId='order_browser'; return route.fulfill({ json: { key: 'rzp_test_fixture', amount: order.totalPaise, currency: 'INR', providerOrderId: order.providerOrderId } }); }
      if (url.pathname === `/api/orders/${order.id}` || url.pathname === `/api/admin/orders/${order.id}`) return route.fulfill({ json: { order } });
      if (url.pathname === '/api/orders' || url.pathname === '/api/admin/orders') return route.fulfill({ json: { orders: [order], nextOffset: null } });
      return route.fulfill({ status: 503, json: { error: 'Unconfigured test route blocked.' } });
    }
    if (!['GET','HEAD'].includes(req.method())) return route.abort();
    return route.continue();
  });
  await page.context().addInitScript(({ key, cart }) => { localStorage.setItem(key, JSON.stringify(cart)); }, { key: `wishlyn-cart-profile-${user.email}`, cart });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:3102/checkout');
  await page.getByRole('heading', { name: 'Delivery details' }).waitFor();
  await page.getByRole('button', { name: 'Review current total' }).click({ noWaitAfter: true });
  await page.getByText('Enter a valid 6-digit Indian PIN code.').waitFor();
  const validationFocused = await page.locator('#firstName').evaluate(el => el === document.activeElement);
  for (const [key, value] of Object.entries(shipping)) {
    if (key === 'state') await page.locator('#state').selectOption(value);
    else if (key !== 'country') await page.locator(`#${key}`).fill(value);
  }
  await page.getByRole('button', { name: 'Review current total' }).click({ noWaitAfter: true });
  await page.getByRole('heading', { name: 'Review your order' }).waitFor();
  const pay = page.getByRole('button', { name: 'Pay ₹815.00', exact: true });
  const requiresAcknowledgment = await pay.isDisabled();
  await page.getByRole('checkbox').check();
  await pay.click({ noWaitAfter: true });
  await page.getByRole('alert').filter({ hasText: 'Payment could not load' }).waitFor();
  const recoveredAfterFailure = await pay.isEnabled();
  await pay.click({ noWaitAfter: true });
  await page.getByRole('alert').filter({ hasText: 'payment window closed' }).waitFor();
  const viewport = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForFunction(() => window.scrollY === 0);
  await page.screenshot({ path: '/tmp/wishlyn-w2-checkout-mobile.png', fullPage: true });
  await page.goto(`http://localhost:3102/orders/${order.id}`);
  await page.getByRole('heading', { name: 'Awaiting payment', exact: true }).waitFor();
  const orderRecovered = await page.getByText(order.id, { exact: true }).count() > 0;
  const giftPersisted = await page.getByText(/Message: “For the recipient”/).count() > 0;
  user.role = 'admin'; order.status='paid'; order.reservationState='consumed'; order.providerPaymentId='pay_browser';
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(`http://localhost:3102/admin/orders/${order.id}`);
  await page.getByRole('button', { name: 'Mark processing' }).waitFor();
  const adminViewport = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  await page.screenshot({ path: '/tmp/wishlyn-w2-order-admin-mobile.png', fullPage: true });
  return { mode: 'Browser UI with synthetic auth/order responses; all application mutations and payment SDK network intercepted', validationFocused, requiresAcknowledgment, recoveredAfterFailure, sdkAttempt, createRequests, quoteRequests, viewport, orderRecovered, giftPersisted, adminViewport };
}
