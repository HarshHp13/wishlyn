/* Function expression consumed by playwright-cli run-code. */
/* eslint-disable @typescript-eslint/no-unused-expressions */
async page => {
  const origin = 'http://localhost:3043';
  const context = page.context();
  await context.unrouteAll({ behavior: 'wait' });
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const faults = [];
  page.on('pageerror', error => faults.push(error.message));
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET' && request.method() !== 'HEAD' && !['/api/cart-products', '/api/wishlist-products'].includes(url.pathname)) {
      return route.fulfill({ status: 503, json: { error: 'Blocked synthetic browser mutation' } });
    }
    return route.continue();
  });
  await context.clearCookies();
  await page.goto(origin);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${origin}/product/fixture-01`);
  await page.getByRole('button', { name: 'Add to shopping bag', exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('button[class*="addToCartBtn"]')?.disabled);
  const layouts = [];
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const dimensions = await page.evaluate(() => {
      const logo = document.querySelector('header a[aria-label="Wishlyn home"]').getBoundingClientRect();
      return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, logoOffset: Math.abs(logo.x + logo.width / 2 - innerWidth / 2) };
    });
    check(dimensions.scrollWidth <= width, `Product overflows at ${width}`);
    check(dimensions.logoOffset < 1, `Logo is not centered at ${width}`);
    layouts.push(dimensions);
  }
  await page.getByLabel('Choose your option').selectOption('variant-alt');
  await page.getByRole('checkbox', { name: 'Add gift packaging' }).check();
  await page.getByLabel('Gift message (optional)').fill('For Alice');
  await page.getByRole('button', { name: 'Add to shopping bag', exact: true }).click();
  await page.getByRole('dialog', { name: 'Shopping Cart' }).waitFor();
  await page.getByText('Gift message: “For Alice”').waitFor();
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Review checkout')?.disabled);
  check(await page.getByRole('dialog', { name: 'Shopping Cart' }).getByRole('link', { name: 'Fixture piece 1' }).count() === 1, 'Bag product link missing');
  await page.getByRole('button', { name: 'Close cart', exact: true }).click();
  await page.getByLabel('Gift message (optional)').fill('For Bob');
  await page.getByRole('button', { name: 'Add to shopping bag', exact: true }).click();
  await page.getByText('Gift message: “For Bob”').waitFor();
  check(await page.getByText('Gift message: “For Alice”').count() === 1, 'Distinct gift message lost');
  await page.getByRole('button', { name: 'Close cart', exact: true }).click();
  await page.getByRole('tab', { name: 'Jewellery care' }).click();
  check((await page.getByRole('tabpanel', { name: 'Jewellery care' }).innerText()).includes('not yet been provided'), 'Empty care fallback');
  await page.getByRole('tab', { name: 'Jewellery care' }).press('Home');
  check(await page.getByRole('tab', { name: 'Specifications' }).getAttribute('aria-selected') === 'true', 'Tab keyboard selection failed');
  await page.getByRole('button', { name: 'Enlarge product image' }).click();
  await page.getByRole('dialog', { name: 'Fixture piece 1 enlarged images' }).waitFor();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Escape');
  check(await page.getByRole('button', { name: 'Enlarge product image' }).evaluate(element => element === document.activeElement), 'Lightbox focus not restored');
  await context.route('https://api.postalpincode.in/**', route => route.abort('internetdisconnected'));
  await page.getByLabel('Check estimated delivery').fill('110001');
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  await page.getByText('Postal lookup is unavailable.', { exact: false }).waitFor();
  await page.screenshot({ path: 'docs/implementation/evidence/storefront/product-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'docs/implementation/evidence/storefront/product-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Add to wishlist', exact: true }).click();
  await page.getByRole('button', { name: 'Remove from wishlist', exact: true }).waitFor();
  await context.route('**/api/wishlist-products', route => route.fulfill({ status: 503, json: { error: 'Synthetic outage' } }));
  await page.goto(`${origin}/wishlist`);
  await page.getByText('Your saved list has been kept.', { exact: false }).waitFor();
  check(await page.getByText('Your wishlist is empty', { exact: true }).count() === 0, 'Outage disguised as empty');
  await context.unroute('**/api/wishlist-products');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByRole('heading', { name: 'Fixture piece 1', exact: true }).waitFor();
  await page.goto(`${origin}/?category=earrings&sort=price-high&maxPrice=115#shop`);
  await page.getByRole('navigation', { name: 'Jewellery categories' }).getByRole('link', { name: 'Necklaces', exact: true }).click();
  await page.waitForURL('**category=necklaces**');
  const afterCategory = new URL(page.url());
  check(afterCategory.searchParams.get('sort') === 'price-high' && afterCategory.searchParams.get('maxPrice') === '115', 'Category reset unrelated filters');
  await page.reload();
  check(await page.getByLabel('Sort by').inputValue() === 'price-high', 'Sort not restored on reload');
  await page.goto(`${origin}/?search=definitely-no-such-piece&category=earrings#shop`);
  await page.getByRole('link', { name: 'Reset search and filters' }).click();
  await page.waitForURL(`${origin}/#shop`);
  const indexed = await page.request.get(`${origin}/robots.txt`);
  const sitemap = await page.request.get(`${origin}/sitemaps/0.xml`);
  check(indexed.ok() && (await indexed.text()).includes('/sitemap.xml'), 'Robots sitemap missing');
  const xml = await sitemap.text();
  check(sitemap.ok() && xml.includes('fixture-19') && !xml.includes('fixture-20'), 'Sitemap published coverage mismatch');
  check(faults.length === 0, `Runtime exceptions: ${faults.join('; ')}`);
  return { status: 'PASS', fixtureProducts: 19, layouts, exactVariant: 'variant-alt', distinctGiftMessages: true, careFallback: true, lightboxKeyboardFocus: true, postalOutageHonest: true, wishlistRetry: true, filterPersistence: true, crawlablePublishedSitemap: true, pageErrors: faults, mutations: 'blocked except read-only catalogue APIs', providerPayments: 'not exercised' };
}
