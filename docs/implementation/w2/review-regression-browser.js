/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI consumes this function expression. */
async page => {
  const origin = 'http://localhost:3102';
  const alice = { id: 'review-user-a', email: 'review-a@example.test', role: 'admin' };
  const bob = { id: 'review-user-b', email: 'review-b@example.test', role: 'customer' };
  let user = alice, failingRead = false, failureStatus = 403, scenario = 'privacy', deniedReads = 0, verified = 0;
  const id = `WISH-${'A'.repeat(32)}`;
  const shipping = { firstName: 'Alice', lastName: 'Review', phone: '+919876543210', address: '123 Private Account A Street', city: 'Mumbai', state: 'Maharashtra', zipCode: '400001', country: 'India' };
  const line = { variantId: 'variant-a', productId: 'product-a', title: 'Purchased piece A', metalType: 'Steel', purity: 'Plated', size: null, image: '/logo.png', quantity: 1, giftWrap: false, giftMessage: '', unitPricePaise: 19900, giftWrapPaise: 0, lineTotalPaise: 19900 };
  const order = { id, ownerId: alice.id, email: alice.email, items: [line], shipping, currency: 'INR', subtotalPaise: 19900, shippingPaise: 25000, taxPaise: 600, totalPaise: 45500, status: 'paid', reservationState: 'consumed', paymentSetupState: 'bound', providerOrderId: 'order_fixture', providerPaymentId: 'pay_fixture', fulfillmentStatus: 'unfulfilled', trackingCarrier: null, trackingNumber: null, trackingUrl: null, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now()+900000).toISOString(), updatedAt: new Date().toISOString(), events: [] };
  await page.context().route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.hostname === 'checkout.razorpay.com') return route.fulfill({ contentType: 'application/javascript', body: 'window.Razorpay = class { constructor(options) { this.options=options; } on() {} open() { window.__reviewPayment = this.options; if (window.__reviewAutoPay !== false) this.options.handler({razorpay_order_id:"order_fixture",razorpay_payment_id:"pay_fixture",razorpay_signature:"synthetic-only"}); } };' });
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/auth/me') return route.fulfill({ json: { user } });
      if (url.pathname === '/api/create-order') return route.fulfill({ json: { key: 'rzp_test_fixture', amount: order.totalPaise, currency: 'INR', providerOrderId: order.providerOrderId } });
      if (url.pathname === '/api/verify-payment') { verified++; order.status='paid'; order.reservationState='consumed'; return route.fulfill({ json: { verified: true, order } }); }
      if (url.pathname === `/api/admin/orders/${id}` || url.pathname === `/api/orders/${id}` || url.pathname === '/api/admin/orders' || url.pathname === '/api/orders') {
        if (failingRead) { deniedReads++; return route.fulfill({ status: failureStatus, json: { error: 'Test new account read failed.' } }); }
        return route.fulfill({ json: url.pathname.endsWith('/orders') ? { orders: [order], nextOffset: null } : { order } });
      }
      return route.fulfill({ status: 503, json: { error: 'Blocked unused synthetic route.' } });
    }
    if (!['GET','HEAD'].includes(req.method())) return route.abort();
    return route.continue();
  });
  await page.goto(`${origin}/admin/orders/${id}`);
  await page.getByRole('button', { name: 'Mark processing' }).waitFor();
  const privateAddressBefore = await page.getByText('123 Private Account A Street', { exact: false }).count();
  user = bob; failingRead = true;
  await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'wishlyn-auth-invalidation', newValue: 'review-account-switch' })));
  await page.getByRole('alert').filter({ hasText: 'Test new account read failed.' }).waitFor();
  const privateAddressAfter = await page.getByText('123 Private Account A Street', { exact: false }).count();
  const privateEmailAfter = await page.getByText('review-a@example.test', { exact: false }).count();
  await page.screenshot({ path: '/tmp/wishlyn-w2-review-privacy-fixed.png', fullPage: true });

  if (privateAddressAfter || privateEmailAfter) throw new Error('Admin-to-customer failure exposed the prior account.');
  const additionalPrivacy = [];
  for (const fixture of [
    { name: 'customer-switch-503', path: `/orders/${id}`, initial: { ...alice, role: 'customer' }, next: bob, status: 503 },
    { name: 'admin-list-customer-403', path: '/admin/orders', initial: alice, next: bob, status: 403 },
    { name: 'same-account-demotion-403', path: `/admin/orders/${id}`, initial: alice, next: { ...alice, role: 'customer' }, status: 403 },
  ]) {
    user = fixture.initial; failingRead = false;
    await page.goto(`${origin}${fixture.path}`);
    await page.locator('main').getByText(alice.email, { exact: false }).waitFor();
    user = fixture.next; failingRead = true; failureStatus = fixture.status;
    await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'wishlyn-auth-invalidation', newValue: String(Date.now()) })));
    await page.getByRole('alert').filter({ hasText: 'Test new account read failed.' }).waitFor();
    const main = await page.locator('main').textContent();
    const hidden = !main.includes(shipping.address) && !main.includes(alice.email) && !main.includes(id);
    if (!hidden) throw new Error(`${fixture.name} exposed prior data.`);
    additionalPrivacy.push({ scenario: fixture.name, priorDataHidden: hidden });
  }

  scenario = 'old-quote'; user = { ...alice, role: 'customer' }; failingRead = false;
  order.status='pending_payment'; order.reservationState='active'; order.providerPaymentId=null;
  const productB = { id:'product-b', title:'Unpurchased piece B', description:'Synthetic review fixture', categoryId:'test', basePrice:299, images:['/logo.png'], rating:0, reviewsCount:0, details:{} };
  const variantB = { id:'variant-b', productId:productB.id, metalType:'Steel', purity:'Plated', price:299, stock:5 };
  const cartB = [{ id:'variant-b-standard', variantId:variantB.id, product:productB, variant:variantB, quantity:1, giftWrap:false }];
  const key = `wishlyn-cart-profile-${alice.email}`;
  await page.evaluate(({key,cartB}) => { localStorage.setItem(key,JSON.stringify(cartB)); localStorage.setItem('wishlyn-cart',JSON.stringify(cartB)); localStorage.removeItem('wishlyn-cart-guest'); }, {key,cartB});
  await page.goto(`${origin}/checkout?order=${id}`);
  await page.getByRole('heading', { name:'Review your order' }).waitFor();
  const beforeBag = await page.evaluate(key => { localStorage.removeItem('wishlyn-cart-guest'); return JSON.parse(localStorage.getItem(key)||'[]').map(item=>item.variantId); },key);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name:'Pay ₹455.00', exact:true }).click({noWaitAfter:true});
  await page.getByRole('heading', { name:'Payment confirmed', exact:true }).waitFor();
  const afterBag = await page.evaluate(key => JSON.parse(localStorage.getItem(key)||'[]').map(item=>item.variantId),key);
  if (afterBag.length !== 1 || afterBag[0] !== variantB.id) throw new Error('Paying old quote cleared unrelated bag B.');
  order.status='pending_payment'; order.reservationState='active'; order.providerPaymentId=null;
  const productA = { ...productB, id: line.productId, title: line.title, basePrice: 199 };
  const variantA = { ...variantB, id: line.variantId, productId: line.productId, price: 199 };
  const cartA = [{ id: 'variant-a-standard', variantId: variantA.id, product: productA, variant: variantA, quantity: 1, giftWrap: false }];
  await page.evaluate(({key,cart}) => { localStorage.setItem(key, JSON.stringify(cart)); localStorage.setItem('wishlyn-cart', JSON.stringify(cart)); localStorage.removeItem('wishlyn-cart-guest'); }, {key,cart:cartA});
  await page.goto(`${origin}/checkout?order=${id}`);
  await page.getByRole('heading', { name: 'Review your order' }).waitFor();
  await page.evaluate(() => { window.__reviewAutoPay = false; });
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Pay ₹455.00', exact: true }).click({ noWaitAfter: true });
  await page.waitForFunction(() => Boolean(window.__reviewPayment));
  await page.evaluate(({key,cart,user}) => { localStorage.setItem(key, JSON.stringify(cart)); localStorage.setItem('wishlyn-cart', JSON.stringify(cart)); window.dispatchEvent(new CustomEvent('wishlyn-auth-change', { detail: { user, status: 'authenticated' } })); }, {key,cart:cartB,user});
  await page.getByText('The current catalogue total differs from your bag.', { exact: false }).waitFor();
  await page.evaluate(async () => { await window.__reviewPayment.handler({razorpay_order_id:'order_fixture',razorpay_payment_id:'pay_fixture',razorpay_signature:'synthetic-only'}); });
  await page.getByRole('heading', { name: 'Payment confirmed', exact: true }).waitFor();
  const changedBagAfterPayment = await page.evaluate(key => JSON.parse(localStorage.getItem(key)||'[]').map(item=>item.variantId),key);
  if (changedBagAfterPayment.length !== 1 || changedBagAfterPayment[0] !== variantB.id) throw new Error('Changing the bag during payment lost unrelated pieces.');
  return {mode:'Actual application UI with synthetic auth/order/payment responses; all API writes and remote traffic intercepted',privacy:{privateAddressBefore,deniedReads,privateAddressAfter,privateEmailAfter},additionalPrivacy,changedBagAfterPayment,oldQuote:{purchasedVariant:line.variantId,beforeBag,afterBag,verified},scenario};
}
