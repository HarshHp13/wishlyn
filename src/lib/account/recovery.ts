import { createHash, randomBytes } from "node:crypto";
import { query, transaction } from "../database";
import { ApiError } from "../api";
import { hashPassword, normalizeEmail, validatePassword } from "../auth";

export function recoveryConfiguration() {
  const origin = process.env.APP_ORIGIN,
    from = process.env.RECOVERY_EMAIL_FROM,
    key = process.env.RECOVERY_EMAIL_API_KEY;
  if (
    process.env.ACCOUNT_RECOVERY_ENABLED !== "true" ||
    !origin ||
    !from ||
    !key
  )
    throw new ApiError(
      503,
      "recovery_unavailable",
      "Password recovery is currently unavailable. See store help for available support options.",
    );
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new ApiError(
      503,
      "recovery_unavailable",
      "Password recovery is not configured.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.origin !== origin ||
    url.username ||
    url.password ||
    /[\r\n]/.test(from)
  )
    throw new ApiError(
      503,
      "recovery_unavailable",
      "Password recovery is not configured.",
    );
  return { origin, from, key };
}
export async function requestRecovery(emailInput: unknown): Promise<void> {
  const config = recoveryConfiguration(),
    email = normalizeEmail(emailInput);
  const token = randomBytes(32).toString("hex"),
    hash = createHash("sha256").update(token).digest("hex");
  const ownerId = await transaction(async (client) => {
    const profile = (
      await client.query(
        "SELECT id,session_version FROM profiles WHERE email=$1 AND disabled_at IS NULL FOR UPDATE",
        [email],
      )
    ).rows[0];
    if (!profile) return null;
    await client.query(
      "UPDATE account_recovery_tokens SET consumed_at=now() WHERE owner_id=$1 AND consumed_at IS NULL",
      [profile.id],
    );
    await client.query(
      "INSERT INTO account_recovery_tokens(token_hash,owner_id,session_version,expires_at,delivery_state) VALUES($1,$2,$3,now()+interval '20 minutes','pending')",
      [hash, profile.id, profile.session_version],
    );
    return profile.id as string;
  });
  if (!ownerId) return;
  // A fragment keeps the token out of HTTP access logs and referrer URLs.
  const link = `${config.origin}/reset-password#token=${token}`;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `wishlyn-reset-${hash}`,
      },
      body: JSON.stringify({
        from: config.from,
        to: [email],
        subject: "Reset your Wishlyn password",
        text: `Use this single-use link within 20 minutes to reset your password:\n${link}\n\nIf you did not request this, ignore this message.`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Delivery failed");
    const payload = await response.json();
    if (typeof payload?.id !== "string" || !payload.id)
      throw new Error("Delivery unconfirmed");
    await query(
      "UPDATE account_recovery_tokens SET delivery_state='sent' WHERE token_hash=$1 AND consumed_at IS NULL",
      [hash],
    );
  } catch {
    await query(
      "UPDATE account_recovery_tokens SET delivery_state='failed',consumed_at=COALESCE(consumed_at,now()) WHERE token_hash=$1",
      [hash],
    );
    // The caller receives the same acceptance response for unknown accounts and
    // failed delivery. Staff monitor failed rows; no sent-email claim is made.
  }
}
export async function resetPassword(
  tokenInput: unknown,
  passwordInput: unknown,
): Promise<void> {
  if (typeof tokenInput !== "string" || !/^[a-f0-9]{64}$/.test(tokenInput))
    throw new ApiError(
      400,
      "invalid_reset",
      "This reset link is invalid or expired. Request a new one.",
    );
  const password = validatePassword(passwordInput, true),
    passwordHash = await hashPassword(password);
  const hash = createHash("sha256").update(tokenInput).digest("hex");
  await transaction(async (client) => {
    const candidate = (
      await client.query(
        "SELECT owner_id FROM account_recovery_tokens WHERE token_hash=$1",
        [hash],
      )
    ).rows[0];
    if (!candidate)
      throw new ApiError(
        400,
        "invalid_reset",
        "This reset link is invalid or expired. Request a new one.",
      );
    const profile = (
      await client.query(
        "SELECT id,session_version,disabled_at FROM profiles WHERE id=$1 FOR UPDATE",
        [candidate.owner_id],
      )
    ).rows[0];
    const token = (
      await client.query(
        "SELECT * FROM account_recovery_tokens WHERE token_hash=$1 FOR UPDATE",
        [hash],
      )
    ).rows[0];
    if (
      !profile ||
      profile.disabled_at ||
      !token ||
      token.consumed_at ||
      token.delivery_state !== "sent" ||
      new Date(token.expires_at).getTime() <= Date.now() ||
      token.session_version !== profile.session_version
    )
      throw new ApiError(
        400,
        "invalid_reset",
        "This reset link is invalid or expired. Request a new one.",
      );
    await client.query("UPDATE profiles SET password_hash=$2 WHERE id=$1", [
      profile.id,
      passwordHash,
    ]);
    await client.query("DELETE FROM auth_sessions WHERE profile_id=$1", [
      profile.id,
    ]);
    await client.query(
      "UPDATE account_recovery_tokens SET consumed_at=now() WHERE owner_id=$1 AND consumed_at IS NULL",
      [profile.id],
    );
  });
}
