import { randomUUID } from "node:crypto";
import { query, transaction } from "../database";
import { ApiError } from "../api";
import type { SessionUser } from "../session";
import {
  CheckoutValidationError,
  validateOrderId,
} from "../commerce/validation";
import { lockAccount } from "./request";
import { boundedText, uuid, version } from "./validation";
import type { SupportRequest, SupportStatus } from "./types";

function mapped(row: Record<string, unknown>): SupportRequest {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    orderId: String(row.order_id),
    kind: row.kind as SupportRequest["kind"],
    subject: String(row.subject),
    status: row.status as SupportStatus,
    version: Number(row.version),
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}
export async function supportList(
  user: SessionUser,
  admin: boolean,
  offset: number,
  status?: string,
) {
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 100000 ||
    (status && !["open", "in_progress", "resolved"].includes(status))
  )
    throw new ApiError(
      400,
      "invalid_filter",
      "Choose a valid request page and status.",
    );
  const rows = (
    await query(
      "SELECT * FROM support_requests WHERE ($1::boolean OR owner_id=$2) AND ($3::text IS NULL OR status=$3) ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET $4",
      [admin, user.id, status || null, offset],
    )
  ).rows;
  return {
    viewerId: user.id,
    ownerId: user.id,
    requests: rows.slice(0, 20).map(mapped),
    nextOffset: rows.length > 20 ? offset + 20 : null,
  };
}
export async function supportDetail(
  user: SessionUser,
  admin: boolean,
  input: unknown,
): Promise<SupportRequest> {
  const id = uuid(input);
  return transaction(async (client) => {
    await client.query(
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    const row = (
      await client.query(
        "SELECT * FROM support_requests WHERE id=$1 AND ($2::boolean OR owner_id=$3)",
        [id, admin, user.id],
      )
    ).rows[0];
    if (!row)
      throw new ApiError(
        404,
        "missing_request",
        "This request is unavailable.",
      );
    const events = (
      await client.query(
        "SELECT id,actor_role,message,status,created_at FROM support_request_events WHERE request_id=$1 ORDER BY id LIMIT 200",
        [id],
      )
    ).rows;
    return {
      ...mapped(row),
      events: events.map((e) => ({
        id: String(e.id),
        actorRole: e.actor_role,
        message: e.message,
        status: e.status,
        createdAt: new Date(e.created_at).toISOString(),
      })),
    };
  });
}
export async function createSupport(
  request: Request,
  user: SessionUser,
  body: Record<string, unknown>,
): Promise<SupportRequest> {
  let orderId: string;
  try {
    orderId = validateOrderId(body.orderId);
  } catch (error) {
    if (error instanceof CheckoutValidationError)
      throw new ApiError(
        400,
        "invalid_order",
        "Enter a valid saved order reference.",
      );
    throw error;
  }
  const requestKey = uuid(body.requestKey),
    subject = boundedText(body.subject, "subject", 3, 160),
    message = boundedText(body.message, "request details", 10, 3000);
  if (!["help", "return", "cancellation"].includes(String(body.kind)))
    throw new ApiError(400, "invalid_kind", "Choose a support request type.");
  const id = await transaction(async (client) => {
    await lockAccount(request, client, user);
    const order = (
      await client.query(
        "SELECT id FROM commerce_orders WHERE id=$1 AND owner_id=$2",
        [orderId, user.id],
      )
    ).rows[0];
    if (!order)
      throw new ApiError(404, "missing_order", "This order is unavailable.");
    const previous = (
      await client.query(
        "SELECT id,order_id,kind,subject FROM support_requests WHERE owner_id=$1 AND request_key=$2",
        [user.id, requestKey],
      )
    ).rows[0];
    if (previous) {
      const initial = (
        await client.query(
          "SELECT message FROM support_request_events WHERE request_id=$1 ORDER BY id LIMIT 1",
          [previous.id],
        )
      ).rows[0];
      if (
        previous.order_id !== orderId ||
        previous.kind !== body.kind ||
        previous.subject !== subject ||
        initial?.message !== message
      )
        throw new ApiError(
          409,
          "request_key_reused",
          "This request key belongs to different details. Start a new request.",
        );
      return previous.id as string;
    }
    const recent = (
      await client.query(
        "SELECT COUNT(*)::int AS count FROM support_requests WHERE owner_id=$1 AND created_at > now()-interval '1 day'",
        [user.id],
      )
    ).rows[0].count;
    if (recent >= 20)
      throw new ApiError(
        429,
        "request_limit",
        "You have submitted many requests today. Reply to an existing request instead.",
        { "Retry-After": "3600" },
      );
    const id = randomUUID();
    await client.query(
      "INSERT INTO support_requests(id,owner_id,order_id,kind,subject,request_key) VALUES($1,$2,$3,$4,$5,$6)",
      [id, user.id, orderId, body.kind, subject, requestKey],
    );
    await client.query(
      "INSERT INTO support_request_events(request_id,actor_id,actor_role,message,status) VALUES($1,$2,'customer',$3,'open')",
      [id, user.id, message],
    );
    return id;
  });
  return supportDetail(user, false, id);
}
export async function replySupport(
  request: Request,
  user: SessionUser,
  admin: boolean,
  idInput: unknown,
  body: Record<string, unknown>,
): Promise<SupportRequest> {
  const id = uuid(idInput),
    expected = version(body.version),
    message = boundedText(body.message, "reply", 1, 3000);
  if (
    admin &&
    !["open", "in_progress", "resolved"].includes(String(body.status))
  )
    throw new ApiError(400, "invalid_status", "Choose a valid request status.");
  if (!admin && body.status !== undefined)
    throw new ApiError(
      403,
      "forbidden_status",
      "Staff manage the request status. Your reply can reopen a resolved request.",
    );
  await transaction(async (client) => {
    await lockAccount(request, client, user);
    const row = (
      await client.query(
        "SELECT * FROM support_requests WHERE id=$1 AND ($2::boolean OR owner_id=$3) FOR UPDATE",
        [id, admin, user.id],
      )
    ).rows[0];
    if (!row)
      throw new ApiError(
        404,
        "missing_request",
        "This request is unavailable.",
      );
    if (row.version !== expected)
      throw new ApiError(
        409,
        "stale_record",
        "A new reply arrived. Reload the conversation before replying.",
      );
    const count = (
      await client.query(
        "SELECT COUNT(*)::int AS count FROM support_request_events WHERE request_id=$1",
        [id],
      )
    ).rows[0].count;
    if (count >= 200)
      throw new ApiError(
        400,
        "conversation_limit",
        "This conversation is full. Open a new order-linked request.",
      );
    const status = admin
      ? body.status
      : row.status === "resolved"
        ? "open"
        : row.status;
    await client.query(
      "UPDATE support_requests SET status=$2,version=version+1,updated_at=now() WHERE id=$1",
      [id, status],
    );
    await client.query(
      "INSERT INTO support_request_events(request_id,actor_id,actor_role,message,status) VALUES($1,$2,$3,$4,$5)",
      [id, user.id, admin ? "admin" : "customer", message, status],
    );
  });
  return supportDetail(user, admin, id);
}
