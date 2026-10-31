/* Open a local product page, then run with playwright-cli run-code --filename=... */
/* eslint-disable @typescript-eslint/no-unused-expressions */
async page => {
  const context = page.context();
  await context.unrouteAll({ behavior: 'wait' });
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  const origin = new URL(page.url()).origin;
  check(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Use a local test server');
  await context.route('**/*', route => {
    const request = route.request();
    if (!['GET', 'HEAD'].includes(request.method()) && !['/api/cart-products', '/api/wishlist-products'].includes(new URL(request.url()).pathname)) {
      return route.fulfill({ status: 503, json: { error: 'Blocked synthetic browser mutation' } });
    }
    return route.continue();
  });
  await page.clock.setFixedTime(new Date('2026-10-31T10:00:00Z'));
  await page.reload();
  const input = page.getByLabel('Check estimated delivery', { exact: true });
  const button = page.getByRole('button', { name: 'Check', exact: true });
  const status = page.locator('#postal-status');
  await input.waitFor();
  const makeOffice = (pincode, state, district = 'Test district') => [{ Status: 'Success', PostOffice: [{ Pincode: pincode, State: state, District: district, Country: 'India', DeliveryStatus: 'Delivery', BranchType: 'Head Post Office' }] }];
  let calls = 0;
  let mode = 'success';
  let heldRoute;
  await context.route('https://api.postalpincode.in/**', async route => {
    calls += 1;
    const pin = new URL(route.request().url()).pathname.split('/').pop();
    if (mode === 'hold') { heldRoute = route; return; }
    if (mode === 'outage') return route.abort('internetdisconnected');
    if (mode === 'malformed') return route.fulfill({ json: [{ Status: 'Success', PostOffice: [{ State: null }] }] });
    if (mode === 'not-found') return route.fulfill({ json: [{ Status: 'Error', PostOffice: null }] });
    return route.fulfill({ json: makeOffice(pin, pin === '201301' ? 'Uttar Pradesh' : 'Delhi', pin === '201301' ? 'Gautam Buddha Nagar' : 'New Delhi') });
  });
  await input.fill('012345');
  await button.click();
  check((await status.innerText()).includes('Enter a valid 6-digit'), 'Invalid PIN message missing');
  check(calls === 0 && await input.getAttribute('aria-invalid') === 'true', 'Invalid PIN made a request or lacked invalid state');
  await input.fill('201301');
  await input.press('Enter');
  await page.getByText('Estimated arrival:', { exact: false }).waitFor();
  let success = await status.innerText();
  check(success.includes('5–7 Nov 2026') || success.includes('5 – 7 Nov 2026'), `Local date range incorrect: ${success}`);
  check(success.includes('2 Nov 2026') && success.includes('next open postal day'), 'Sunday booking not explained');
  check(success.includes('Wishlyn estimate') && success.includes('national holidays') && success.includes('does not confirm'), 'Estimate limitations missing');
  check(await status.getAttribute('aria-atomic') === 'true', 'Status announcement is not atomic');
  const widths = [];
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
    check(dimensions.content <= width, `Page overflow at ${width}`);
    widths.push(dimensions);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await input.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/wishlyn-bag-delivery/postal-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await input.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/wishlyn-bag-delivery/postal-desktop.png' });
  for (const failure of ['outage', 'malformed', 'not-found']) {
    mode = failure;
    await input.fill('110001');
    await button.click();
    await page.waitForFunction(() => document.querySelector('#postal-code').getAttribute('aria-invalid') === 'true');
    check(!(await status.innerText()).includes('Estimated arrival:'), `${failure} retained an estimate`);
  }
  mode = 'hold';
  await input.fill('201301');
  await button.click();
  await page.getByRole('button', { name: 'Checking…', exact: true }).waitFor();
  check(await page.getByRole('button', { name: 'Checking…', exact: true }).isDisabled(), 'Pending request should disable duplicate submit');
  mode = 'success';
  await input.fill('110001');
  check(await status.innerText() === '', 'Editing a PIN did not clear the old result');
  await button.click();
  await page.getByText('Estimated arrival:', { exact: false }).waitFor();
  if (heldRoute) await heldRoute.fulfill({ json: makeOffice('201301', 'Uttar Pradesh', 'OLD RESULT') }).catch(() => {});
  success = await status.innerText();
  check(success.includes('New Delhi') && !success.includes('OLD RESULT'), 'Stale response replaced current PIN');
  check(success.includes('10–13 Nov 2026') || success.includes('10 – 13 Nov 2026'), 'National surface estimate incorrect');
  mode = 'hold';
  await input.fill('201301');
  await button.click();
  await page.getByText('Postal lookup is unavailable.', { exact: false }).waitFor({ timeout: 11000 });
  check(await button.isEnabled(), 'Timed-out request did not recover');
  if (heldRoute) await heldRoute.abort().catch(() => {});
  await page.getByRole('tab', { name: 'Shipping & help' }).click();
  const shipping = await page.getByRole('tabpanel', { name: 'Shipping & help' }).innerText();
  check(shipping.includes('Sector 27, Noida (201301)') && shipping.includes('India Post Parcel (surface)'), 'Shipping tab has inconsistent service/origin');
  check(errors.length === 0, `Runtime errors: ${errors.join('; ')}`);
  page.off('pageerror', onError);
  await context.unrouteAll({ behavior: 'wait' });
  return { status: 'PASS', origin, fixedIndiaDate: '2026-10-31', widths, invalidPIN: true, surfaceDateRanges: true, sundayBooking: true, apiFailures: true, timeoutRecovery: true, staleRequest: true, accessibleStatus: true, shippingCopy: true, errors };
}
