/* eslint-disable @typescript-eslint/no-unused-expressions -- Standalone function consumed by Playwright CLI run-code. */
async (page) => {
  const origin = "http://localhost:3055",
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return ["localhost", "127.0.0.1"].includes(url.hostname)
      ? route.continue()
      : route.abort();
  });
  async function signIn(email) {
    await page.goto(origin + "/login?redirect=%2Fprofile");
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page
      .getByLabel("Password", { exact: true })
      .fill("Browser fixture password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByRole("button", { name: "Save profile", exact: true })
      .waitFor();
  }
  await page.goto(origin + "/product/browser-product");
  await page.getByRole("button", { name: "Add to wishlist", exact: true }).click();
  await page.getByRole("button", { name: "Remove from wishlist", exact: true }).waitFor();
  const guestTransferResponse = page.waitForResponse(response => {
    const request = response.request();
    return response.url().endsWith("/api/account/wishlist") && request.method() === "POST" && request.postDataJSON()?.action === "transfer";
  });
  await signIn("browser-a@example.test");
  const guestTransferSaved = (await guestTransferResponse).status() === 200;
  await page.getByLabel("First name", { exact: true }).fill("Asha");
  await page.getByLabel("Last name", { exact: true }).fill("Fixture");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page.getByText("Profile saved.", { exact: true }).waitFor();
  await page.request.post(origin + "/api/auth/login", { headers: { origin }, data: { email: "browser-b@example.test", password: "Browser fixture password" } });
  await page.getByLabel("First name", { exact: true }).fill("Stale A edit");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page.getByText("Your account changed. Verify your account and retry this action.", { exact: false }).waitFor();
  const bProfile = await (await page.request.get(origin + "/api/account/profile", { headers: { "X-Wishlyn-Account-ID": "browser-b" } })).json();
  const staleCookieWriteBlocked = bProfile.profile.firstName === "";
  await page.request.post(origin + "/api/auth/login", { headers: { origin }, data: { email: "browser-a@example.test", password: "Browser fixture password" } });
  await page.getByRole("button", { name: "Reload account", exact: true }).click();
  await page.getByLabel("First name", { exact: true }).fill("Asha");
  for (const [label, value] of [
    ["Address label", "Browser home"],
    ["Recipient first name", "Asha"],
    ["Recipient last name", "Fixture"],
    ["Mobile number", "9876543210"],
    ["Street address", "123 Browser Test Lane"],
    ["City", "Mumbai"],
    ["PIN code", "400001"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page
    .getByRole("combobox", { name: "State / union territory", exact: true })
    .selectOption("Maharashtra");
  await page.getByRole("button", { name: "Save address", exact: true }).click();
  await page.getByText("Address saved.", { exact: true }).waitFor();
  const addressPersisted = await page
    .getByRole("button", { name: "Edit Browser home", exact: true })
    .isVisible();
  await page.getByLabel("Current password", { exact: true }).fill("wrong");
  await page
    .getByLabel("New password", { exact: true })
    .fill("New fixture password");
  await page
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await page
    .getByText("The current password is incorrect.", { exact: false })
    .waitFor();
  const failedPasswordRetained =
    (await page
      .getByLabel("Current password", { exact: true })
      .inputValue()) === "wrong";
  await page.setViewportSize({ width: 320, height: 860 });
  const narrowAccount = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    unlabelled: [
      ...document.querySelectorAll("main input,main select,main textarea"),
    ].filter((el) => !el.labels?.length).length,
  }));
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForFunction(() => window.scrollY === 0);
  await page.screenshot({
    path: "/tmp/wishlyn-w5-account-mobile.png",
    fullPage: true,
  });
  await page.request.post(origin + "/api/account/wishlist", {
    headers: { origin, "X-Wishlyn-Account-ID": "browser-a" },
    data: { action: "add", productId: "browser-product" },
  });
  await page.goto(origin + "/wishlist");
  await page
    .getByText("Synthetic account piece", { exact: true })
    .first()
    .waitFor();
  const orderData = await (
    await page.request.get(origin + "/api/orders")
  ).json();
  const orderId = orderData.orders.find((order) =>
    order.items.some((item) => item.productId === "browser-product"),
  ).id;
  await page.goto(origin + "/support?order=" + orderId);
  await page
    .getByLabel("Subject", { exact: true })
    .fill("Synthetic delivery question");
  await page
    .getByLabel("Request details", { exact: true })
    .fill("Please confirm the synthetic order delivery details.");
  await page
    .getByRole("button", { name: "Submit request", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Synthetic delivery question", exact: true })
    .waitFor();
  const requestPath = new URL(page.url()).pathname;
  await page
    .getByLabel("Add a reply", { exact: true })
    .fill("A synthetic customer follow-up.");
  await page.getByRole("button", { name: "Save reply", exact: true }).click();
  await page
    .getByText("A synthetic customer follow-up.", { exact: true })
    .waitFor();
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForFunction(() => window.scrollY === 0);
  await page.screenshot({
    path: "/tmp/wishlyn-w5-support-mobile.png",
    fullPage: true,
  });
  await page.request.post(origin + "/api/auth/logout", { headers: { origin } });
  await signIn("browser-b@example.test");
  const accountIsolated =
    (await page
      .getByRole("button", { name: "Edit Browser home", exact: true })
      .count()) === 0 &&
    (await page.getByLabel("Address label", { exact: true }).inputValue()) ===
      "";
  const requestIsolated =
    (await page.request.get(origin + "/api" + requestPath, { headers: { "X-Wishlyn-Account-ID": "browser-b" } })).status() === 404;
  await page.goto(origin + "/forgot-password");
  await page
    .getByLabel("Account email", { exact: true })
    .fill("browser-b@example.test");
  await page
    .getByRole("button", { name: "Request reset link", exact: true })
    .click();
  await page
    .getByText("Password recovery is currently unavailable.", { exact: false })
    .waitFor();
  await page.request.post(origin + "/api/auth/logout", { headers: { origin } });
  await signIn("browser-admin@example.test");
  await page.goto(origin + "/admin" + requestPath);
  await page
    .getByLabel("Reply to customer", { exact: true })
    .fill("The store team reviewed this synthetic request.");
  await page
    .getByRole("combobox", { name: "Request status", exact: true })
    .selectOption("resolved");
  await page.getByRole("button", { name: "Save reply", exact: true }).click();
  await page
    .getByText("The store team reviewed this synthetic request.", {
      exact: true,
    })
    .waitFor();
  const narrowSupport = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForFunction(() => window.scrollY === 0);
  await page.screenshot({
    path: "/tmp/wishlyn-w5-support-desktop.png",
    fullPage: true,
  });
  // Real browser tabs share cookies/storage, with only auth verification delayed.
  await page.request.post(origin + "/api/auth/logout", { headers: { origin } });
  await signIn("browser-a@example.test");
  await page.request.post(origin + "/api/account/wishlist", { headers: { origin, "X-Wishlyn-Account-ID": "browser-a" }, data: { action: "remove", productId: "browser-product" } });
  await page.request.post(origin + "/api/auth/logout", { headers: { origin } });
  await page.goto(origin + "/product/browser-product");
  await page.getByRole("button", { name: "Add to wishlist", exact: true }).click();
  await page.getByRole("button", { name: "Remove from wishlist", exact: true }).waitFor();
  await page.getByLabel("Add gift packaging (+ ₹350 per item)", { exact: true }).check();
  await page.getByLabel("Gift message (optional)", { exact: true }).fill("Synthetic migration gift");
  await page.getByRole("button", { name: "Add to shopping bag", exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("wishlyn-v2-cart-guest") || '{"items":[]}').items.some(item => item.quantity === 1));
  const slow = await page.context().newPage();
  slow.on("pageerror", error => errors.push(error.message));
  await slow.route("**/*", route => ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await slow.goto(origin + "/product/browser-product");
  await slow.getByRole("button", { name: "Remove from wishlist", exact: true }).waitFor();
  let releaseAuth, authStarted;
  const authGate = new Promise(resolve => { releaseAuth = resolve; });
  const authObserved = new Promise(resolve => { authStarted = resolve; });
  await slow.route("**/api/auth/me", async route => {
    authStarted();
    await authGate;
    await route.fulfill({ response: await slow.request.get(origin + "/api/auth/me") });
  });
  await slow.evaluate(() => window.dispatchEvent(new Event("focus")));
  await authObserved;
  const fastTransfer = page.waitForResponse(response => response.url().endsWith("/api/account/wishlist") && response.request().method() === "POST" && response.request().postDataJSON()?.action === "transfer");
  await signIn("browser-a@example.test");
  await fastTransfer;
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("wishlyn-v2-cart-account-browser-a") || '{"items":[]}').items.length > 0);
  const migratedCart = await page.evaluate(() => JSON.parse(localStorage.getItem("wishlyn-v2-cart-account-browser-a") || '{"items":[]}').items);
  const guestCartExactMigration = migratedCart.length === 1 && migratedCart[0].quantity === 1 && migratedCart[0].variantId === "browser-variant" && migratedCart[0].giftWrap === true && migratedCart[0].giftMessage === "Synthetic migration gift";
  await page.request.post(origin + "/api/account/wishlist", { headers: { origin, "X-Wishlyn-Account-ID": "browser-a" }, data: { action: "remove", productId: "browser-product" } });
  releaseAuth();
  await slow.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.getAttribute("aria-label") === "Add to wishlist" && !button.disabled));
  const afterDelayed = await (await slow.request.get(origin + "/api/account/wishlist", { headers: { "X-Wishlyn-Account-ID": "browser-a" } })).json();
  const sharedGuestReplayBlocked = !afterDelayed.items.includes("browser-product");
  await slow.close();

  async function delayedGuestTab() {
    const tab = await page.context().newPage();
    tab.on("pageerror", error => errors.push(error.message));
    await tab.route("**/*", route => ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    await tab.goto(origin + "/product/browser-product");
    await tab.getByRole("button", { name: "Remove from wishlist", exact: true }).waitFor();
    let release, observed;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { observed = resolve; });
    await tab.route("**/api/auth/me", async route => {
      observed(); await gate;
      await route.fulfill({ response: await tab.request.get(origin + "/api/auth/me") });
    });
    await tab.evaluate(() => window.dispatchEvent(new Event("focus")));
    await started;
    return { tab, release };
  }
  await page.request.post(origin + "/api/auth/logout", { headers: { origin } });
  await page.goto(origin + "/product/browser-product");
  await page.getByRole("button", { name: "Add to wishlist", exact: true }).click();
  await page.getByRole("button", { name: "Remove from wishlist", exact: true }).waitFor();
  const canceledId = await page.evaluate(() => JSON.parse(localStorage.getItem("wishlyn-v2-wishlist-guest-selections"))[0].id);
  const canceled = await delayedGuestTab(), canceledTransfers = [];
  canceled.tab.on("request", request => {
    if (request.url().endsWith("/api/account/wishlist") && request.method() === "POST" && request.postDataJSON()?.action === "transfer") canceledTransfers.push(...request.postDataJSON().transfers);
  });
  await page.getByRole("button", { name: "Remove from wishlist", exact: true }).click();
  await page.getByRole("button", { name: "Add to wishlist", exact: true }).waitFor();
  await signIn("browser-a@example.test"); canceled.release();
  await canceled.tab.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.getAttribute("aria-label") === "Add to wishlist" && !button.disabled));
  const canceledList = await (await canceled.tab.request.get(origin + "/api/account/wishlist", { headers: { "X-Wishlyn-Account-ID": "browser-a" } })).json();
  const unclaimedGuestCancellationBlocked = canceledList.items.length === 0 && !canceledTransfers.some(record => record.id === canceledId);
  await canceled.tab.close();

  await page.request.post(origin + "/api/auth/logout", { headers: { origin } });
  await page.goto(origin + "/product/browser-product");
  await page.getByRole("button", { name: "Add to wishlist", exact: true }).click();
  await page.getByRole("button", { name: "Remove from wishlist", exact: true }).waitFor();
  await page.getByLabel("Add gift packaging (+ ₹350 per item)", { exact: true }).check();
  await page.getByLabel("Gift message (optional)", { exact: true }).fill("Synthetic gift intended for A");
  await page.getByRole("button", { name: "Add to shopping bag", exact: true }).click();
  await page.getByRole("button", { name: "Increase quantity of Synthetic account piece", exact: true }).click();
  await page.getByRole("button", { name: "Close cart", exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("wishlyn-v2-cart-guest") || '{"items":[]}').items.some(item => item.quantity === 2 && item.giftMessage === "Synthetic gift intended for A"));
  const denied = await delayedGuestTab(), deniedTransfers = [];
  denied.tab.on("request", request => {
    if (request.url().endsWith("/api/account/wishlist") && request.method() === "POST" && request.postDataJSON()?.action === "transfer") deniedTransfers.push(request.postDataJSON());
  });
  await denied.tab.evaluate(() => {
    window.__wishlynDenyStorage = false;
    for (const name of ["getItem", "setItem", "removeItem"]) {
      const original = Storage.prototype[name];
      Storage.prototype[name] = function (...args) {
        if (window.__wishlynDenyStorage) throw new DOMException("Synthetic storage denial", "SecurityError");
        return original.apply(this, args);
      };
    }
  });
  const deniedFastTransfer = page.waitForResponse(response => response.url().endsWith("/api/account/wishlist") && response.request().method() === "POST" && response.request().postDataJSON()?.action === "transfer");
  await signIn("browser-a@example.test"); await deniedFastTransfer;
  const deniedAMigration = await page.evaluate(() => JSON.parse(localStorage.getItem("wishlyn-v2-cart-account-browser-a") || '{"items":[]}').items.find(item => item.giftMessage === "Synthetic gift intended for A"));
  await page.request.post(origin + "/api/account/wishlist", { headers: { origin, "X-Wishlyn-Account-ID": "browser-a" }, data: { action: "remove", productId: "browser-product" } });
  await page.request.post(origin + "/api/auth/login", { headers: { origin }, data: { email: "browser-b@example.test", password: "Browser fixture password" } });
  await denied.tab.evaluate(() => { window.__wishlynDenyStorage = true; }); denied.release();
  await denied.tab.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.getAttribute("aria-label") === "Add to wishlist" && !button.disabled));
  await denied.tab.getByRole("button", { name: "Open shopping bag", exact: true }).click();
  await denied.tab.getByText("Your shopping bag is empty.", { exact: true }).waitFor();
  const deniedBList = await (await denied.tab.request.get(origin + "/api/account/wishlist", { headers: { "X-Wishlyn-Account-ID": "browser-b" } })).json();
  const storageDeniedSharedGuestIsolated = deniedTransfers.length === 0 && deniedBList.items.length === 0 && deniedAMigration?.quantity === 2 && deniedAMigration?.giftMessage === "Synthetic gift intended for A";
  const storageDeniedCartEmpty = await denied.tab.getByText("Your shopping bag is empty.", { exact: true }).isVisible();
  await denied.tab.getByText("Some guest selections are retained for verification", { exact: false }).first().waitFor();
  await denied.tab.evaluate(() => { window.__wishlynDenyStorage = false; });
  await denied.tab.evaluate(() => window.dispatchEvent(new Event("focus")));
  await denied.tab.waitForFunction(() => !document.querySelector('[role="dialog"]')?.textContent?.includes("retained for verification") && ![...document.querySelectorAll("dialog[open]")].some(dialog => dialog.textContent.includes("retained for verification")));
  await denied.tab.getByText("Your shopping bag is empty.", { exact: true }).waitFor();
  await denied.tab.close();
  return {
    provenance:
      "Local development server and actual disposable PostgreSQL; synthetic users/orders; remote requests blocked; auth verification alone delayed; controlled Storage denial in one tab; no email/payment/provider action.",
    addressPersisted,
    guestTransferSaved,
    staleCookieWriteBlocked,
    guestCartExactMigration,
    sharedGuestReplayBlocked,
    unclaimedGuestCancellationBlocked,
    storageDeniedSharedGuestIsolated,
    storageDeniedCartEmpty,
    failedPasswordRetained,
    savedPieceVisible: true,
    accountIsolated,
    requestIsolated,
    recoveryUnavailable: true,
    staffReply: true,
    narrowAccount,
    narrowSupport,
    errors,
  };
}
