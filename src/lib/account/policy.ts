/** Publish only merchant-approved facts supplied explicitly by the operator. */
export function servicePolicy() {
  const approved = process.env.SERVICE_POLICY_APPROVED === "true";
  const text = (key: string) =>
    approved && process.env[key]?.trim()
      ? process.env[key]!.trim().slice(0, 4000)
      : null;
  const configuredEmail = approved ? process.env.SUPPORT_EMAIL?.trim() : null;
  const email =
    configuredEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuredEmail)
      ? configuredEmail
      : null;
  return {
    approved,
    email,
    shipping: text("SERVICE_SHIPPING_POLICY"),
    returns: text("SERVICE_RETURNS_POLICY"),
    cancellation: text("SERVICE_CANCELLATION_POLICY"),
    warranty: text("SERVICE_WARRANTY_POLICY"),
  };
}
