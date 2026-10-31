/* Run with playwright-cli on an in-stock local product page. */
/* eslint-disable @typescript-eslint/no-unused-expressions */
async page => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const context = page.context();
  const productUrl = page.url();
  check(new URL(productUrl).hostname === 'localhost', 'Use a local development product page');
  const faults = [];
  page.on('pageerror', error => faults.push(error.message));
  await context.unrouteAll({ behavior: 'wait' });
  await context.clearCookies();
  await context.route('**/api/auth/me', route => route.fulfill({ status: 401, json: { error: 'Guest browser check' } }));
  await context.route('**/*', route => {
    const request = route.request();
    if (!['GET', 'HEAD'].includes(request.method()) && new URL(request.url()).pathname !== '/api/cart-products') {
      return route.fulfill({ status: 503, json: { error: 'Blocked browser-test mutation' } });
    }
    return route.fallback();
  });
  await page.evaluate(() => localStorage.clear());
  await page.goto(productUrl);
  await page.getByRole('button', { name: 'Add to shopping bag', exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('button[class*="addToCartBtn"]')?.disabled);
  const dialog = page.getByRole('dialog', { name: 'Shopping Cart' });
  const open = page.getByRole('button', { name: /^Open shopping bag/ });
  const close = page.getByRole('button', { name: 'Close cart', exact: true });
  const sampleOpening = async () => page.evaluate(async () => {
    const dialog = document.querySelector('dialog[aria-label="Shopping Cart"]');
    const drawer = dialog.querySelector('[class*="_drawer"]');
    const body = document.body;
    const logo = document.querySelector('header a[aria-label="Wishlyn home"]');
    const snapshot = () => ({
      t: performance.now(), y: scrollY, width: body.getBoundingClientRect().width,
      logoX: logo.getBoundingClientRect().x, scrollLeft: dialog.scrollLeft,
      x: drawer.getBoundingClientRect().x, right: drawer.getBoundingClientRect().right,
      open: dialog.open,
    });
    const before = snapshot();
    const trigger = document.querySelector('button[aria-label^="Open shopping bag"]');
    trigger.focus({ preventScroll: true });
    trigger.click();
    const frames = await new Promise(resolve => {
      const frames = [];
      const start = performance.now();
      const frame = () => {
        frames.push(snapshot());
        if (performance.now() - start < 450) requestAnimationFrame(frame);
        else resolve(frames);
      };
      requestAnimationFrame(frame);
    });
    return { before, frames, viewport: innerWidth, drawerWidth: drawer.getBoundingClientRect().width };
  });
  const results = [];
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'instant' }));
    const result = await sampleOpening();
    const frames = result.frames.filter(frame => frame.open);
    check(frames.length > 4, `Too few opening frames at ${width}`);
    check(frames.every(frame => frame.scrollLeft === 0), `Dialog scrolled to its translated focus target at ${width}`);
    check(frames.every(frame => Math.abs(frame.y - result.before.y) < 1), `Page scrolled during opening at ${width}`);
    check(frames.every(frame => Math.abs(frame.width - result.before.width) < 1 && Math.abs(frame.logoX - result.before.logoX) < 1), `Scrollbar lock moved the page at ${width}`);
    check(frames[0].x - frames.at(-1).x > result.drawerWidth / 2, `Drawer did not visibly slide in at ${width}`);
    check(frames.every((frame, index) => !index || frame.x <= frames[index - 1].x + 0.1), `Drawer reversed direction during opening at ${width}`);
    check(Math.abs(frames.at(-1).right - width) < 1, `Drawer did not reach viewport edge at ${width}`);
    check(await close.evaluate(element => element === document.activeElement), `Initial focus missing at ${width}`);
    // Native dialogs may cycle through browser chrome (reported as body), but
    // must never focus a background page control.
    for (const key of ['Tab', 'Tab', 'Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      check(await dialog.evaluate(element => element.matches(':modal') && (element.contains(document.activeElement) || document.activeElement === document.body)), `Focus escaped to a background control at ${width}`);
    }
    await close.focus();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog[aria-label="Shopping Cart"]').open);
    check(await open.evaluate(element => element === document.activeElement), `Focus not restored after Escape at ${width}`);
    // Let the existing discrete display/overlay exit transition finish.
    await page.waitForFunction(() => getComputedStyle(document.querySelector('dialog[aria-label="Shopping Cart"]')).display === 'none');
    check(await page.evaluate(() => document.body.style.overflow) === '', `Scroll lock leaked at ${width}`);
    results.push({ width, frameCount: frames.length, firstX: frames[0].x, lastX: frames.at(-1).x, maxDialogScroll: Math.max(...frames.map(frame => frame.scrollLeft)), maxFrameIntervalMs: Math.max(...frames.slice(1).map((frame, i) => frame.t - frames[i].t)) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  // Close during entry, then reopen during exit. Native focus and state must stay in sync.
  const interrupted = await page.evaluate(async () => {
    const dialog = document.querySelector('dialog[aria-label="Shopping Cart"]');
    const trigger = document.querySelector('button[aria-label^="Open shopping bag"]');
    const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
    for (let i = 0; i < 4; i++) {
      trigger.click();
      await nextFrame();
      await nextFrame();
      dialog.querySelector('button[aria-label="Close cart"]').click();
      await nextFrame();
      await nextFrame();
    }
    trigger.click();
    await nextFrame();
    await nextFrame();
    return dialog.open;
  });
  check(interrupted, 'Rapid reopening left dialog state closed');
  await page.waitForFunction(() => document.querySelector('dialog[aria-label="Shopping Cart"]').getAnimations({ subtree: true }).every(animation => animation.playState === 'finished'));
  check(await dialog.evaluate(element => element.open && element.scrollLeft === 0), 'Interrupted opening was corrupted');
  await page.mouse.click(20, 450);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('dialog[aria-label="Shopping Cart"]')).display === 'none');
  check(await open.evaluate(element => element === document.activeElement), 'Backdrop close did not restore focus');

  await page.getByRole('checkbox', { name: 'Add gift packaging', exact: false }).check();
  await page.getByLabel('Gift message (optional)').fill('A little shine for you');
  await page.getByRole('button', { name: 'Add to shopping bag', exact: true }).click();
  await dialog.getByText('Gift message: “A little shine for you”').waitFor();
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Review checkout')?.disabled);
  check(await dialog.getByRole('link').count() > 0, 'Populated bag lost product link');
  await close.click();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('dialog[aria-label="Shopping Cart"]')).display === 'none');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open.click();
  const reduced = await dialog.evaluate(element => {
    const drawer = element.querySelector('[class*="_drawer"]');
    return { duration: getComputedStyle(drawer).transitionDuration, right: drawer.getBoundingClientRect().right, scrollLeft: element.scrollLeft };
  });
  check(reduced.duration === '0s' && reduced.scrollLeft === 0 && Math.abs(reduced.right - 1440) < 1, 'Reduced motion still slides the drawer');
  await close.click();
  await page.waitForFunction(() => !document.querySelector('dialog[aria-label="Shopping Cart"]').open);
  check(await page.evaluate(() => document.body.style.overflow) === '', 'Reduced-motion close leaked scroll lock');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  check(faults.length === 0, `Runtime exceptions: ${faults.join('; ')}`);
  return { status: 'PASS', results, rapidReopening: true, focusRestored: true, escapeAndBackdrop: true, populatedBagAndGift: true, checkoutRefresh: true, reducedMotion: true, pageErrors: faults };
}
