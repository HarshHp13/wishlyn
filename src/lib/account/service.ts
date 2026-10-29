import { randomUUID } from "node:crypto";
import { query, transaction } from "../database";
import { ApiError } from "../api";
import { comparePassword, hashPassword, validatePassword } from "../auth";
import type { SessionUser } from "../session";
import {
  CheckoutValidationError,
  validateShipping,
} from "../commerce/validation";
import { validId } from "../shopping-state";
import { boundedText, uuid, version } from "./validation";
import { lockAccount } from "./request";
import type { AccountProfile, SavedAddress, SavedWishlist } from "./types";

export async function getProfile(user: SessionUser): Promise<AccountProfile> {
  const result = await query(
    "SELECT first_name,last_name,version FROM account_details WHERE owner_id=$1",
    [user.id],
  );
  return {
    ownerId: user.id,
    email: user.email,
    firstName: result.rows[0]?.first_name || "",
    lastName: result.rows[0]?.last_name || "",
    version: result.rows[0]?.version || 1,
  };
}
export async function saveProfile(
  request: Request,
  user: SessionUser,
  body: Record<string, unknown>,
): Promise<AccountProfile> {
  const firstName = boundedText(body.firstName, "first name", 0, 80),
    lastName = boundedText(body.lastName, "last name", 0, 80),
    expected = version(body.version);
  await transaction(async (client) => {
    await lockAccount(request, client, user);
    await client.query(
      "INSERT INTO account_details(owner_id) VALUES($1) ON CONFLICT DO NOTHING",
      [user.id],
    );
    const result = await client.query(
      "UPDATE account_details SET first_name=$2,last_name=$3,version=version+1,updated_at=now() WHERE owner_id=$1 AND version=$4 RETURNING owner_id",
      [user.id, firstName, lastName, expected],
    );
    if (!result.rowCount)
      throw new ApiError(
        409,
        "stale_record",
        "This profile changed in another session. Reload before saving.",
      );
  });
  return getProfile(user);
}
export async function addresses(user: SessionUser): Promise<SavedAddress[]> {
  const result = await query(
    "SELECT id,label,address,version FROM account_addresses WHERE owner_id=$1 ORDER BY created_at,id LIMIT 20",
    [user.id],
  );
  return result.rows.map((row) => ({
    ...row.address,
    id: row.id,
    label: row.label,
    version: row.version,
  }));
}
export async function saveAddress(
  request: Request,
  user: SessionUser,
  body: Record<string, unknown>,
): Promise<void> {
  const id = body.id === undefined ? randomUUID() : uuid(body.id);
  const label = boundedText(body.label, "address label", 1, 60);
  let address;
  try {
    address = validateShipping(body);
  } catch (error) {
    if (error instanceof CheckoutValidationError)
      throw new ApiError(
        400,
        "invalid_address",
        Object.values(error.fields).join(" "),
      );
    throw error;
  }
  const expected = body.id === undefined ? undefined : version(body.version);
  await transaction(async (client) => {
    await lockAccount(request, client, user);
    if (expected === undefined) {
      const count = await client.query(
        "SELECT COUNT(*)::int AS count FROM account_addresses WHERE owner_id=$1",
        [user.id],
      );
      if (count.rows[0].count >= 20)
        throw new ApiError(
          400,
          "address_limit",
          "Keep at most 20 saved addresses.",
        );
      await client.query(
        "INSERT INTO account_addresses(id,owner_id,label,address) VALUES($1,$2,$3,$4)",
        [id, user.id, label, JSON.stringify(address)],
      );
    } else {
      const result = await client.query(
        "UPDATE account_addresses SET label=$3,address=$4,version=version+1,updated_at=now() WHERE id=$1 AND owner_id=$2 AND version=$5 RETURNING id",
        [id, user.id, label, JSON.stringify(address), expected],
      );
      if (!result.rowCount)
        throw new ApiError(
          409,
          "stale_record",
          "This address is unavailable or changed. Reload before saving.",
        );
    }
  });
}
export async function deleteAddress(
  request: Request,
  user: SessionUser,
  body: Record<string, unknown>,
): Promise<void> {
  const id = uuid(body.id),
    expected = version(body.version);
  await transaction(async (client) => {
    await lockAccount(request, client, user);
    const result = await client.query(
      "DELETE FROM account_addresses WHERE id=$1 AND owner_id=$2 AND version=$3 RETURNING id",
      [id, user.id, expected],
    );
    if (!result.rowCount)
      throw new ApiError(
        409,
        "stale_record",
        "This address is unavailable or changed. Reload before deleting.",
      );
  });
}
export async function changePassword(
  request: Request,
  user: SessionUser,
  body: Record<string, unknown>,
): Promise<void> {
  const current = validatePassword(body.currentPassword),
    next = validatePassword(body.newPassword, true);
  const hash = await hashPassword(next);
  await transaction(async (client) => {
    await lockAccount(request, client, user);
    const profile = await client.query(
      "SELECT password_hash FROM profiles WHERE id=$1",
      [user.id],
    );
    if (!(await comparePassword(current, profile.rows[0].password_hash)))
      throw new ApiError(
        400,
        "wrong_password",
        "The current password is incorrect.",
      );
    if (await comparePassword(next, profile.rows[0].password_hash))
      throw new ApiError(
        400,
        "same_password",
        "Choose a different new password.",
      );
    await client.query("UPDATE profiles SET password_hash=$2 WHERE id=$1", [
      user.id,
      hash,
    ]);
    await client.query("DELETE FROM auth_sessions WHERE profile_id=$1", [
      user.id,
    ]);
    await client.query(
      "UPDATE account_recovery_tokens SET consumed_at=now() WHERE owner_id=$1 AND consumed_at IS NULL",
      [user.id],
    );
  });
}
function wishlistRow(
  user: SessionUser,
  row?: Record<string, unknown>,
): SavedWishlist {
  return {
    viewerId: user.id,
    ownerId: user.id,
    items: Array.isArray(row?.items) ? (row.items as string[]) : [],
    version: Number(row?.version || 1),
    browserImported: row?.browser_imported === true,
  };
}
export async function wishlist(user: SessionUser): Promise<SavedWishlist> {
  return wishlistRow(
    user,
    (
      await query(
        "SELECT items,version,browser_imported FROM account_wishlists WHERE owner_id=$1",
        [user.id],
      )
    ).rows[0],
  );
}
export async function mutateWishlist(
  request: Request,
  user: SessionUser,
  body: Record<string, unknown>,
): Promise<SavedWishlist> {
  const action = body.action;
  if (!["add", "remove", "toggle", "import", "transfer"].includes(String(action)))
    throw new ApiError(400, "invalid_action", "Choose a saved-list action.");
  const ids = action === "import" || action === "transfer" ? body.productIds : [body.productId];
  if (!Array.isArray(ids) || ids.length > 50 || !ids.every(validId))
    throw new ApiError(
      400,
      "invalid_products",
      "Use at most 50 valid product references.",
    );
  const transferId = action === "transfer" ? uuid(body.transferId) : null;
  return transaction(async (client) => {
    await lockAccount(request, client, user);
    await client.query(
      "INSERT INTO account_wishlists(owner_id) VALUES($1) ON CONFLICT DO NOTHING",
      [user.id],
    );
    const row = (
      await client.query(
        "SELECT items,version,browser_imported FROM account_wishlists WHERE owner_id=$1 FOR UPDATE",
        [user.id],
      )
    ).rows[0];
    if (action === "import" && row.browser_imported)
      return wishlistRow(user, row);
    if (transferId) {
      const prior = await client.query("SELECT product_ids FROM account_wishlist_transfers WHERE owner_id=$1 AND request_key=$2", [user.id, transferId]);
      if (prior.rows[0]) {
        if (JSON.stringify(prior.rows[0].product_ids) !== JSON.stringify(ids))
          throw new ApiError(409, "transfer_changed", "These guest selections changed. Reload your saved pieces.");
        return wishlistRow(user, row);
      }
      await client.query("INSERT INTO account_wishlist_transfers(owner_id,request_key,product_ids) VALUES($1,$2,$3)", [user.id, transferId, JSON.stringify(ids)]);
    }
    const current = new Set<string>(row.items);
    if (action === "remove") current.delete(ids[0]);
    else {
      const published = await client.query(
        "SELECT id FROM products p WHERE id=ANY($1::text[]) AND COALESCE(to_jsonb(p)->>'status','published')='published'",
        [ids],
      );
      const approved = new Set<string>(published.rows.map((p) => p.id));
      if (action !== "import" && action !== "transfer" && !approved.has(ids[0]))
        throw new ApiError(
          404,
          "missing_product",
          "This product is no longer available to save.",
        );
      for (const id of ids)
        if (approved.has(id)) {
          if (action === "toggle" && current.has(id)) current.delete(id);
          else current.add(id);
        }
    }
    if (current.size > 50)
      throw new ApiError(
        400,
        "wishlist_limit",
        "Keep at most 50 saved pieces.",
      );
    const result = await client.query(
      "UPDATE account_wishlists SET items=$2,version=version+1,browser_imported=browser_imported OR $3,updated_at=now() WHERE owner_id=$1 RETURNING items,version,browser_imported",
      [user.id, JSON.stringify([...current]), action === "import"],
    );
    return wishlistRow(user, result.rows[0]);
  });
}
