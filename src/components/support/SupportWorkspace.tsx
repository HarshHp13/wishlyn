"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MerchantNav from "@/components/admin/MerchantNav";
import {
  getAuthState,
  getServerAuthState,
  subscribeAuth,
  refreshAuthSession,
} from "@/lib/authClient";
import { accountRequest } from "@/lib/account/client";
import type { SupportRequest, SupportStatus } from "@/lib/account/types";
import styles from "@/components/account/account.module.css";
export default function SupportWorkspace({
  admin = false,
  id,
  orderId,
  policy,
}: {
  admin?: boolean;
  id?: string;
  orderId?: string;
  policy?: {
    approved: boolean;
    email: string | null;
    shipping: string | null;
    returns: string | null;
    cancellation: string | null;
    warranty: string | null;
  };
}) {
  const auth = useSyncExternalStore(
    subscribeAuth,
    getAuthState,
    getServerAuthState,
  );
  const [knownOwner, setKnownOwner] = useState<string | null>(null);
  if (
    auth.status === "authenticated" &&
    auth.user &&
    auth.user.id !== knownOwner
  )
    setKnownOwner(auth.user.id);
  useEffect(() => {
    void refreshAuthSession().catch(() => undefined);
  }, []);
  return (
    <>
      <Header />
      <SupportContent
        key={`${auth.user?.id || knownOwner || "unverified"}:${id || "list"}:${admin}`}
        admin={admin}
        id={id}
        orderId={orderId}
        policy={policy}
      />
      <Footer />
    </>
  );
}
function SupportContent({
  admin = false,
  id,
  orderId,
  policy,
}: {
  admin?: boolean;
  id?: string;
  orderId?: string;
  policy?: {
    approved: boolean;
    email: string | null;
    shipping: string | null;
    returns: string | null;
    cancellation: string | null;
    warranty: string | null;
  };
}) {
  const router = useRouter();
  const auth = useSyncExternalStore(
      subscribeAuth,
      getAuthState,
      getServerAuthState,
    ),
    owner = auth.status === "authenticated" ? auth.user?.id : null;
  const [requests, setRequests] = useState<SupportRequest[]>([]),
    [detail, setDetail] = useState<SupportRequest | null>(null),
    [loadedKey, setLoadedKey] = useState(""),
    [offset, setOffset] = useState(0),
    [nextOffset, setNextOffset] = useState<number | null>(null),
    [filter, setFilter] = useState(""),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reply, setReply] = useState(""),
    [status, setStatus] = useState<SupportStatus>("in_progress"),
    [form, setForm] = useState({
      orderId: orderId || "",
      kind: "help",
      subject: "",
      message: "",
    }),
    [requestKey, setRequestKey] = useState("");
  const endpoint = `/api${admin ? "/admin" : ""}/support${id ? `/${encodeURIComponent(id)}` : `?offset=${offset}${filter ? `&status=${filter}` : ""}`}`,
    key = owner ? `${owner}:${endpoint}` : "";
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    accountRequest<{
      request?: SupportRequest;
      requests?: SupportRequest[];
      nextOffset?: number | null;
    }>(endpoint, owner || null, undefined, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setDetail(data.request || null);
        setRequests(data.requests || []);
        setNextOffset(data.nextOffset ?? null);
        setLoadedKey(key);
        setError("");
        if (data.request) setStatus(data.request.status);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setDetail(null);
          setRequests([]);
          setLoadedKey(key);
          setError(e.message);
        }
      });
    return () => controller.abort();
  }, [key, endpoint, owner, revision]);
  const current = () =>
    getAuthState().status === "authenticated" &&
    getAuthState().user?.id === owner;
  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (detail) {
        const data = await accountRequest<{ request: SupportRequest }>(
          endpoint,
          owner || null,
          {
            message: reply,
            version: detail.version,
            ...(admin ? { status } : {}),
          },
        );
        if (current()) {
          setDetail(data.request);
          setReply("");
        }
      } else {
        const token = requestKey || crypto.randomUUID();
        setRequestKey(token);
        const data = await accountRequest<{ request: SupportRequest }>(
          "/api/support",
          owner || null,
          { ...form, requestKey: token },
        );
        if (current()) router.push(`/support/${data.request.id}`);
      }
    } catch (e) {
      if (current())
        setError(
          e instanceof Error ? e.message : "This request could not be saved.",
        );
    } finally {
      if (current()) setBusy(false);
    }
  }
  const base = admin ? "/admin/support" : "/support";
  return (
    <>
      <main id="main-content" className={styles.page}>
        <div className="container">
          {!admin && <nav className={styles.nav} aria-label="Support navigation">
            <Link href={admin ? "/admin" : "/profile"}>
              {admin ? "Administration" : "My account"}
            </Link>
            <Link href={admin ? "/admin/orders" : "/orders"}>Orders</Link>
            {id && <Link href={base}>All requests</Link>}
            <Link href="/">Shop</Link>
          </nav>}
          {admin && <p className={styles.eyebrow}>STORE MANAGEMENT</p>}
          {admin && id && <Link className={styles.backLink} href={base}>← All requests</Link>}
          <h1>
            {admin
              ? "Customer support queue"
              : id
                ? "Your support request"
                : "Help and service information"}
          </h1>
          {admin && !id && <p className={styles.intro}>A thoughtful response makes all the difference. Follow up on orders, returns and customer questions here.</p>}
          {admin && <MerchantNav active="support" />}
          {!admin && !id && (
            <>
              <p className={styles.intro}>
                Open a request for a saved order and follow replies here. A
                return or cancellation request is reviewed by staff; submitting
                one does not cancel a confirmed purchase or confirm a refund.
              </p>
              {policy && (
                <section className={styles.panel}>
                  <h2>Service information</h2>
                  {policy.email && (
                    <p>
                      Support email:{" "}
                      <a href={`mailto:${policy.email}`}>{policy.email}</a>
                    </p>
                  )}
                  {(
                    ["shipping", "returns", "cancellation", "warranty"] as const
                  ).map((k) => (
                    <div key={k}>
                      <h3>{k[0].toUpperCase() + k.slice(1)}</h3>
                      <p>
                        {policy[k] ||
                          "Approved details are not published yet. Ask about your order using the request form below."}
                      </p>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
          {auth.status === "loading" ? (
            <p role="status">Verifying your account…</p>
          ) : auth.status === "error" ? (
            <div role="alert" className={styles.error}>
              Your account could not be verified.{" "}
              <button
                onClick={() => {
                  void refreshAuthSession(true).catch(() => undefined);
                }}
              >
                Retry account check
              </button>
            </div>
          ) : auth.status === "guest" ? (
            <p>
              <Link
                href={`/login?redirect=${encodeURIComponent(id ? `${base}/${id}` : base)}`}
              >
                Sign in to view and submit order requests
              </Link>
            </p>
          ) : admin && auth.user?.role !== "admin" ? (
            <p role="alert">Administrator access is required.</p>
          ) : loadedKey !== key ? (
            <p role="status">Loading requests…</p>
          ) : (
            <>
              {error && (
                <div role="alert" className={styles.error}>
                  {error}{" "}
                  <button onClick={() => { void refreshAuthSession(true).then(() => setRevision(v => v + 1)).catch(() => undefined); }}>
                    Reload requests
                  </button>
                </div>
              )}
              {detail ? (
                <section className={styles.panel}>
                  <h2>{detail.subject}</h2>
                  <p className={styles.meta}>
                    Reference {detail.id} · {detail.kind} ·{" "}
                    {detail.status.replaceAll("_", " ")}
                  </p>
                  <p>
                    <Link
                      href={`${admin ? "/admin" : ""}/orders/${detail.orderId}`}
                    >
                      Order {detail.orderId}
                    </Link>
                  </p>
                  <ol className={styles.conversation}>
                    {detail.events?.map((e) => (
                      <li key={e.id}>
                        <time dateTime={e.createdAt}>
                          {new Date(e.createdAt).toLocaleString("en-IN")} ·{" "}
                          {e.actorRole === "admin" ? "Store team" : "Customer"}{" "}
                          · {e.status.replaceAll("_", " ")}
                        </time>
                        <p>{e.message}</p>
                      </li>
                    ))}
                  </ol>
                  <form
                    className={styles.form}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submit();
                    }}
                  >
                    <label className={styles.field} htmlFor="support-reply">
                      {admin ? "Reply to customer" : "Add a reply"}
                      <textarea
                        id="support-reply"
                        required
                        maxLength={3000}
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                      />
                    </label>
                    {admin && (
                      <label className={styles.field} htmlFor="support-status">
                        Request status
                        <select
                          id="support-status"
                          value={status}
                          onChange={(e) =>
                            setStatus(e.target.value as SupportStatus)
                          }
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In progress</option>
                          <option value="resolved">Resolved</option>
                        </select>
                      </label>
                    )}
                    <p className={styles.meta}>
                      Check this conversation for replies. Refunds and
                      cancellations require staff confirmation.
                    </p>
                    <button disabled={busy}>
                      {busy ? "Saving reply…" : "Save reply"}
                    </button>
                  </form>
                </section>
              ) : (
                !id && (
                  <>
                    {admin && (
                      <label className={`${styles.field} ${styles.filter}`} htmlFor="support-filter">
                        Queue status
                        <select
                          id="support-filter"
                          value={filter}
                          onChange={(e) => {
                            setFilter(e.target.value);
                            setOffset(0);
                          }}
                        >
                          <option value="">All requests</option>
                          <option value="open">Open</option>
                          <option value="in_progress">In progress</option>
                          <option value="resolved">Resolved</option>
                        </select>
                      </label>
                    )}
                    <section className={styles.panel}>
                      <h2>{admin ? "Requests" : "Your requests"}</h2>
                      {!requests.length && !error && (
                        <p>No requests in this view.</p>
                      )}
                      <ul className={styles.list}>
                        {requests.map((r) => (
                          <li className={styles.item} key={r.id}>
                            <Link href={`${base}/${r.id}`}>{r.subject}</Link>
                            <p>
                              {r.kind} · {r.status.replaceAll("_", " ")} · Order{" "}
                              {r.orderId}
                            </p>
                          </li>
                        ))}
                      </ul>
                      <nav
                        className={styles.actions}
                        aria-label="Request pages"
                      >
                        {offset > 0 && (
                          <button
                            onClick={() => setOffset(Math.max(0, offset - 20))}
                          >
                            Previous requests
                          </button>
                        )}
                        {nextOffset !== null && (
                          <button onClick={() => setOffset(nextOffset)}>
                            More requests
                          </button>
                        )}
                      </nav>
                    </section>
                    {!admin && (
                      <section className={styles.panel}>
                        <h2>Open an order request</h2>
                        <form
                          className={styles.form}
                          onSubmit={(e) => {
                            e.preventDefault();
                            void submit();
                          }}
                        >
                          <label
                            className={styles.field}
                            htmlFor="request-order"
                          >
                            Order reference
                            <input
                              id="request-order"
                              required
                              maxLength={37}
                              placeholder="WISH-…"
                              value={form.orderId}
                              onChange={(e) => {
                                setForm({ ...form, orderId: e.target.value });
                                setRequestKey("");
                              }}
                            />
                          </label>
                          <p className={styles.meta}>
                            Copy a reference from{" "}
                            <Link href="/orders">your orders</Link>, or choose
                            “Request help” on the order page.
                          </p>
                          <label
                            className={styles.field}
                            htmlFor="request-kind"
                          >
                            Request type
                            <select
                              id="request-kind"
                              value={form.kind}
                              onChange={(e) => {
                                setForm({ ...form, kind: e.target.value });
                                setRequestKey("");
                              }}
                            >
                              <option value="help">Help with an order</option>
                              <option value="return">
                                Request a return review
                              </option>
                              <option value="cancellation">
                                Request a cancellation review
                              </option>
                            </select>
                          </label>
                          <label
                            className={styles.field}
                            htmlFor="request-subject"
                          >
                            Subject
                            <input
                              id="request-subject"
                              required
                              minLength={3}
                              maxLength={160}
                              value={form.subject}
                              onChange={(e) => {
                                setForm({ ...form, subject: e.target.value });
                                setRequestKey("");
                              }}
                            />
                          </label>
                          <label
                            className={styles.field}
                            htmlFor="request-message"
                          >
                            Request details
                            <textarea
                              id="request-message"
                              required
                              minLength={10}
                              maxLength={3000}
                              value={form.message}
                              onChange={(e) => {
                                setForm({ ...form, message: e.target.value });
                                setRequestKey("");
                              }}
                            />
                          </label>
                          <button disabled={busy}>
                            {busy ? "Saving request…" : "Submit request"}
                          </button>
                        </form>
                      </section>
                    )}
                  </>
                )
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
