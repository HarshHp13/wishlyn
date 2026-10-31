/* eslint-disable @typescript-eslint/no-unused-expressions -- Run with playwright-cli run-code --filename. */
async page => {
  const origin = 'http://localhost:3158';
  const output = '/tmp/wishlyn-account-admin-redesign';
  const checks = {};
  const errors = [];
  const blocked = [];
  const assert = (value, label) => { if (!value) throw new Error(label); checks[label] = true; };
  await page.unroute('**/*');
  page.removeAllListeners('pageerror');
  page.on('pageerror', error => errors.push(error.message));
  let user = { id: 'design-admin', email: 'asha@example.test', role: 'admin' };
  let profile = { ownerId: user.id, email: user.email, firstName: 'Asha', lastName: 'Rao', version: 1 };
  let addresses = [{ id: 'home-address', version: 1, label: 'Home', firstName: 'Asha', lastName: 'Rao', phone: '9876543210', address: '12 Garden Road', city: 'Mumbai', state: 'Maharashtra', zipCode: '400001', country: 'India' }];
  const categories = [{ id: 'earrings', name: 'Earrings' }, { id: 'necklaces', name: 'Necklaces' }];
  const pieces = [
    ['gold-hoops', 'Everyday gold hoops', '/editorial/gold-hoops.webp', 'published', 18],
    ['aura-pendant', 'Aura evil eye pendant', '/aura_evil_eye_pendant.png', 'published', 3],
    ['new-piece', 'A new beginning necklace', null, 'draft', 0],
    ['missing-image', 'Archive sample with unavailable image', '/fixture-missing.webp', 'archived', 0],
    ['invalid-image', 'Unverified image sample', 'https://untrusted.invalid/private.jpg', 'draft', 0],
  ];
  const products = pieces.map(([id, title, image, status, stock]) => ({
    id, title, description: 'A considered everyday piece with a polished gold finish.', categoryId: 'earrings', images: image ? [image] : [], status, revision: 1,
    stone: '', dimensions: '', careInstructions: 'Store in a dry place.', factsConfirmed: true, updatedAt: '2026-10-31T08:00:00Z', history: [],
    variants: [{ id: id + '-variant', productId: id, metalType: 'Stainless steel', purity: 'Gold plated', size: '', price: 1299, stock, reservedStock: 0, active: true }],
  }));
  let failSave = true, failList = false, failAuth = false, uploadRequests = 0;
  const order = { id: 'WISH-DESIGN-0001', ownerId: user.id, email: user.email, status: 'paid', fulfillmentStatus: 'processing', totalPaise: 129900, subtotalPaise: 129900, shippingPaise: 0, taxPaise: 0, createdAt: '2026-10-31T08:00:00Z', shipping: addresses[0], paymentSetupState: 'idle', items: [{ variantId: 'gold-hoops-variant', productId: 'gold-hoops', title: 'Everyday gold hoops', metalType: 'Steel', purity: 'Gold plated', quantity: 1, unitPricePaise: 129900, lineTotalPaise: 129900 }], events: [] };
  const support = { id: 'request-design', ownerId: user.id, orderId: order.id, subject: 'Delivery update for my order', kind: 'help', status: 'open', version: 1, createdAt: order.createdAt, updatedAt: order.createdAt, events: [] };
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ viewerId: user?.id, ...body }) });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { blocked.push(url.href); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const method = route.request().method();
    if (url.pathname === '/api/auth/me') return failAuth ? json(route, { error: 'Fixture verification outage' }, 503) : json(route, { user });
    if (url.pathname === '/api/auth/logout') { user = null; return json(route, { success: true }); }
    if (url.pathname === '/api/account/profile') { if (method === 'POST') profile = { ...profile, ...route.request().postDataJSON(), version: profile.version + 1 }; return json(route, { profile }); }
    if (url.pathname === '/api/account/addresses') {
      if (method === 'POST') {
        const body = route.request().postDataJSON();
        if (body.action === 'delete') addresses = addresses.filter(a => a.id !== body.id);
        else { const address = { ...body, id: body.id || 'new-address', version: (body.version || 0) + 1 }; addresses = [...addresses.filter(a => a.id !== address.id), address]; }
      }
      return json(route, { ownerId: user.id, addresses });
    }
    if (url.pathname === '/api/account/password') return json(route, { error: 'The current password is incorrect.' }, 400);
    if (url.pathname === '/api/account/wishlist') return json(route, { ownerId: user?.id, items: [], version: 0, browserImported: true });
    if (url.pathname === '/api/cart-products' || url.pathname === '/api/wishlist-products') return json(route, { products: [] });
    if (url.pathname === '/api/cloudinary/upload') { uploadRequests++; return json(route, { url: '/classic_rose_gold_ring.png' }); }
    if (url.pathname === '/api/admin/product') {
      if (method === 'GET') {
        if (url.searchParams.has('id')) return json(route, { product: products.find(p => p.id === url.searchParams.get('id')) });
        if (failList) return json(route, { error: 'Fixture catalogue outage' }, 503);
        const filtered = products.filter(p => p.title.toLowerCase().includes((url.searchParams.get('search') || '').toLowerCase()) && (!url.searchParams.get('status') || p.status === url.searchParams.get('status')) && (url.searchParams.get('lowStock') !== 'true' || p.variants[0].stock <= 5));
        return json(route, { products: filtered.map(p => ({ id: p.id, title: p.title, status: p.status, image: p.images[0] || null, revision: p.revision, availableStock: p.variants[0].stock, lowStock: p.variants[0].stock <= 5, updatedAt: p.updatedAt })), categories, nextOffset: null });
      }
      if (failSave) { failSave = false; return json(route, { error: 'Fixture save failed. Please retry.' }, 503); }
      const body = route.request().postDataJSON();
      const existing = products.find(p => p.id === body.id);
      const product = { ...body, id: body.id || 'created-piece', revision: (existing?.revision || 0) + 1, updatedAt: order.createdAt, history: [], variants: body.variants.map((v, i) => ({ ...v, id: v.id || 'created-variant-' + i, stock: (existing?.variants[i]?.stock || 0) + v.stockAdjustment, reservedStock: 0 })) };
      if (existing) Object.assign(existing, product); else products.push(product);
      return json(route, { product });
    }
    if (url.pathname.startsWith('/api/admin/orders')) return json(route, url.pathname.endsWith(order.id) ? { order } : { orders: [order], nextOffset: null });
    if (url.pathname.startsWith('/api/admin/support')) return json(route, url.pathname.endsWith(support.id) ? { request: support } : { requests: [support], nextOffset: null });
    return json(route, { error: 'Unexpected API blocked in design fixture' }, 503);
  });
  const reflow = [];
  async function measure(route) {
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const size = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      reflow.push({ route, ...size });
      assert(size.scrollWidth <= size.width, route + ' fits ' + width);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto(origin + '/profile');
  await page.getByRole('button', { name: 'Save profile', exact: true }).waitFor();
  await page.screenshot({ path: output + '/account-desktop.png', fullPage: true });
  await page.getByLabel('First name', { exact: true }).fill('Asha Updated');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await page.getByText('Profile saved.', { exact: true }).waitFor();
  assert(profile.firstName === 'Asha Updated', 'Profile saves');
  await page.getByRole('button', { name: 'Edit Home', exact: true }).click();
  await page.getByLabel('City', { exact: true }).fill('Pune');
  await page.getByRole('button', { name: 'Save address', exact: true }).click();
  await page.getByText('Address saved.', { exact: true }).waitFor();
  assert(addresses[0].city === 'Pune', 'Address editing saves');
  await page.getByLabel('Current password', { exact: true }).fill('incorrect-current');
  await page.getByLabel('New password', { exact: true }).fill('new-password-value');
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  await page.getByText('The current password is incorrect.', { exact: true }).waitFor();
  assert(await page.getByLabel('New password', { exact: true }).inputValue() === 'new-password-value', 'Failed password update retains form');
  await measure('/profile');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({ path: output + '/account-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => { const sizes = [...document.querySelectorAll('main *')].map(el => [el, parseFloat(getComputedStyle(el).fontSize)]); for (const [el, size] of sizes) if (size) el.style.fontSize = size * 2 + 'px'; });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Account doubled text reflows at 320');
  await page.screenshot({ path: output + '/account-double-text.png', fullPage: true });
  await page.getByRole('button', { name: 'Delete Home', exact: true }).click();
  await page.getByText('No saved addresses yet', { exact: true }).waitFor();
  assert(addresses.length === 0, 'Address delete and empty state');
  await page.goto(origin + '/admin');
  const hoops = page.getByRole('button', { name: /Everyday gold hoops/ });
  await hoops.waitFor();
  await hoops.locator('img').waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('button img')].some(img => img.complete && img.naturalWidth > 0));
  assert(await hoops.locator('img').count() === 1, 'Product row has thumbnail');
  await page.getByRole('button', { name: /Archive sample with unavailable image/ }).getByText('No image').waitFor();
  assert(true, 'Broken image has fallback');
  assert(await page.getByRole('button', { name: /A new beginning necklace/ }).getByText('No image').count() === 1, 'Missing image has fallback');
  assert(await page.getByRole('button', { name: /Unverified image sample/ }).getByText('No image').count() === 1, 'Untrusted image has fallback');
  assert(!blocked.some(url => url.includes('untrusted.invalid')), 'Untrusted image is never requested');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await hoops.click();
  await page.getByRole('heading', { name: 'Edit product', exact: true }).waitFor();
  await page.screenshot({ path: output + '/admin-desktop.png', fullPage: true });
  assert(await hoops.getAttribute('aria-pressed') === 'true', 'Selected product is indicated');
  await page.getByLabel('Product title', { exact: true }).fill('Everyday gold hoops updated');
  await page.getByLabel('Add product images', { exact: true }).setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRXkAAAAASUVORK5CYII=', 'base64') });
  await page.getByRole('button', { name: 'Save product', exact: true }).click();
  await page.getByText('Fixture save failed. Please retry.', { exact: true }).waitFor();
  assert(await page.getByLabel('Product title', { exact: true }).inputValue() === 'Everyday gold hoops updated', 'Failed save retains product form');
  await page.getByRole('button', { name: 'Save product', exact: true }).click();
  await page.getByText('Product saved as published.', { exact: true }).waitFor();
  assert(uploadRequests === 1, 'Uploaded image retained across failed save');
  await page.getByLabel('Search products', { exact: true }).fill('no-match');
  await page.getByText('No pieces found', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByRole('button', { name: /Everyday gold hoops updated/ }).waitFor();
  assert(true, 'Search empty state and clear filters');
  await page.getByLabel('Publication status', { exact: true }).selectOption('draft');
  await page.getByRole('button', { name: /A new beginning necklace/ }).waitFor();
  assert(await page.getByRole('button', { name: /Everyday gold hoops updated/ }).count() === 0, 'Publication filter');
  await page.getByLabel('Publication status', { exact: true }).selectOption('');
  await page.getByRole('button', { name: /Everyday gold hoops updated/ }).waitFor();
  failList = true;
  await page.getByLabel('Search products', { exact: true }).fill('hoops');
  await page.getByRole('button', { name: 'Retry catalogue', exact: true }).waitFor();
  failList = false;
  await page.getByRole('button', { name: 'Retry catalogue', exact: true }).click();
  await page.getByRole('button', { name: /Everyday gold hoops updated/ }).waitFor();
  assert(true, 'Catalogue outage recovers');
  await page.getByLabel('Search products', { exact: true }).fill('');
  await page.getByRole('button', { name: /Aura evil eye pendant/ }).waitFor();
  await measure('/admin');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({ path: output + '/admin-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => { const sizes = [...document.querySelectorAll('main *')].map(el => [el, parseFloat(getComputedStyle(el).fontSize)]); for (const [el, size] of sizes) if (size) el.style.fontSize = size * 2 + 'px'; });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Admin doubled text reflows at 320');
  await page.screenshot({ path: output + '/admin-double-text.png', fullPage: true });
  await page.goto(origin + '/admin/orders');
  await page.getByRole('link', { name: order.id, exact: true }).waitFor();
  assert(await page.getByRole('navigation', { name: 'Merchant navigation' }).getByRole('link', { name: 'Orders', exact: true }).getAttribute('aria-current') === 'page', 'Order navigation current state');
  await measure('/admin/orders');
  await page.screenshot({ path: output + '/orders-desktop.png', fullPage: true });
  await page.getByRole('link', { name: order.id, exact: true }).click();
  await page.getByRole('heading', { name: 'Delivery and fulfillment', exact: true }).waitFor();
  await measure('/admin/orders/detail');
  await page.goto(origin + '/admin/support');
  await page.getByRole('link', { name: support.subject, exact: true }).waitFor();
  await measure('/admin/support');
  await page.screenshot({ path: output + '/support-desktop.png', fullPage: true });
  await page.getByRole('link', { name: support.subject, exact: true }).click();
  await page.getByRole('button', { name: 'Save reply', exact: true }).waitFor();
  await measure('/admin/support/detail');
  await page.goto(origin + '/profile');
  await page.getByRole('button', { name: 'Save profile', exact: true }).waitFor();
  await page.getByLabel('First name', { exact: true }).fill('Retained account draft');
  failAuth = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByRole('button', { name: 'Retry account check', exact: true }).waitFor();
  assert(await page.getByLabel('First name', { exact: true }).count() === 0, 'Auth outage hides private account form');
  failAuth = false;
  await page.getByRole('button', { name: 'Retry account check', exact: true }).click();
  await page.getByRole('button', { name: 'Save profile', exact: true }).waitFor();
  assert(await page.getByLabel('First name', { exact: true }).inputValue() === 'Retained account draft', 'Auth recovery retains account draft');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('link', { name: /Sign in to manage your account/ }).waitFor();
  assert(await page.getByLabel('First name', { exact: true }).count() === 0, 'Sign out hides private data');
  assert(errors.length === 0, 'No uncaught browser errors');
  return { provenance: 'Local Next app with intercepted synthetic API responses; no database or provider writes.', checks, reflow, errors };
}
