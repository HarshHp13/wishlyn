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
  await signIn("browser-a@example.test");
  await page.getByLabel("First name", { exact: true }).fill("Asha");
  await page.getByLabel("Last name", { exact: true }).fill("Fixture");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await page.getByText("Profile saved.", { exact: true }).waitFor();
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
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "/tmp/wishlyn-w5-account-mobile.png",
    fullPage: true,
  });
  await page.request.post(origin + "/api/account/wishlist", {
    headers: { origin },
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
  await page.evaluate(() => window.scrollTo(0, 0));
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
    (await page.request.get(origin + "/api" + requestPath)).status() === 404;
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
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "/tmp/wishlyn-w5-support-desktop.png",
    fullPage: true,
  });
  return {
    provenance:
      "Local development server and actual disposable PostgreSQL; synthetic users/orders; remote requests blocked; no email/payment/provider action.",
    addressPersisted,
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
