"use client";
import { getAuthState, refreshAuthSession, subscribeAuth } from "../authClient";
import { wishlistStore as browserStore } from "../shopping-store";
import { validId } from "../shopping-state";
import { accountRequest } from "./client";
import type { SavedWishlist } from "./types";

type Snapshot = {
  items: string[];
  status: "loading" | "ready" | "error";
  notice: string;
  accountId: string | null;
};
type Intent = { ownerId: string; epoch: number; action: "add" | "remove"; productId: string };
const initial: Snapshot = { items: [], status: "loading", notice: "", accountId: null };
let snapshot = initial, generation = 0, ownerEpoch = 0, initialized = false;
let lastOwner: string | null | undefined;
let controller: AbortController | null = null;
let intents: Intent[] = [], draining: Promise<void> | null = null;
const listeners = new Set<() => void>();
const publish = (next: Snapshot) => {
  snapshot = next;
  listeners.forEach(listener => listener());
};
const owner = () => {
  const auth = getAuthState();
  return auth.status === "authenticated" ? auth.user?.id : auth.status === "guest" ? null : undefined;
};
function observeOwner() {
  const id = owner();
  // Verification refreshes hide private data, but do not invalidate same-owner intent.
  if (id !== undefined && id !== lastOwner) {
    lastOwner = id;
    ownerEpoch++;
    intents = [];
  }
}
function verified(id: string, epoch: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const signal = AbortSignal.timeout(15000);
    const cleanup = () => { unsubscribe(); signal.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); reject(new Error("Verify your account and retry your saved-piece change.")); };
    const check = () => {
      const current = owner();
      if (epoch !== ownerEpoch || (current !== undefined && current !== id)) { cleanup(); resolve(false); }
      else if (current === id) { cleanup(); resolve(true); }
    };
    const unsubscribe = subscribeAuth(check);
    signal.addEventListener("abort", abort, { once: true });
    check();
  });
}
async function request(id: string, body?: unknown, signal?: AbortSignal): Promise<SavedWishlist> {
  const data = await accountRequest<SavedWishlist>("/api/account/wishlist", id, body, signal);
  if (!Array.isArray(data.items) || data.items.length > 50 || !data.items.every(validId))
    throw new Error("Saved pieces could not be verified.");
  return data;
}
function announce(id: string) {
  try { localStorage.setItem("wishlyn-server-wishlist-change", `${id}:${Date.now()}:${Math.random()}`); }
  catch { /* Server persistence is independent of storage. */ }
}
function drain(): Promise<void> {
  if (draining) return draining;
  const run = async () => {
    while (intents.length) {
      const intent = intents[0], { ownerId: id, epoch } = intent;
      try {
        if (!(await verified(id, epoch))) {
          if (intents[0] === intent) intents.shift();
          continue;
        }
        const data = await request(id, { action: intent.action, productId: intent.productId });
        if (epoch !== ownerEpoch || owner() !== id) continue;
        if (intents[0] === intent) intents.shift();
        // A refresh read waits for the whole queue and keeps controls hidden
        // until its final authoritative snapshot, avoiding read/write races.
        if (snapshot.status !== "loading")
          publish({ items: data.items, status: "ready", notice: "", accountId: id });
        announce(id);
      } catch (error) {
        if (epoch !== ownerEpoch) continue;
        if (owner() === undefined) {
          // The outcome may be ambiguous. Replaying add/remove is safe; toggles
          // were resolved to a deterministic desired state when accepted.
          try { if (await verified(id, epoch)) continue; } catch { /* Expose retry below. */ }
        }
        if (epoch === ownerEpoch && (owner() === id || owner() === undefined))
          publish({ ...initial, ...(owner() === id ? { items: snapshot.items, accountId: id } : {}), status: "error", notice: error instanceof Error ? error.message : "This change could not be saved. Retry." });
        break;
      }
    }
  };
  draining = run().finally(() => { draining = null; });
  return draining;
}
async function load() {
  observeOwner();
  const id = owner(), revision = ++generation, epoch = ownerEpoch;
  controller?.abort();
  controller = null;
  if (id === undefined) {
    publish({ ...initial, status: getAuthState().status === "error" ? "error" : "loading", notice: getAuthState().status === "error" ? "Verify your account to load saved pieces." : "" });
    return;
  }
  if (id === null) {
    publish({ ...browserStore.getSnapshot(), accountId: null });
    return;
  }
  publish({ ...initial, accountId: id });
  const active = new AbortController();
  controller = active;
  const current = () => revision === generation && epoch === ownerEpoch && owner() === id;
  try {
    // Browser migration owns the Web Lock. Never consume an empty legacy list
    // while that migration is still waiting to move explicit guest selections.
    const browser = await browserStore.ready(id, AbortSignal.any([active.signal, AbortSignal.timeout(15000)]));
    await drain();
    if (!current()) return;
    if (intents.length) throw new Error(snapshot.notice || "Your saved-piece change is pending. Retry.");
    let data = await request(id, undefined, active.signal);
    if (!current()) return;
    if (!data.browserImported) {
      data = await request(id, { action: "import", productIds: browser.items }, active.signal);
      if (!current()) return;
    }
    for (const transfer of browser.guestTransfers || []) {
      data = await request(id, { action: "transfer", transferId: transfer.id, productIds: transfer.items }, active.signal);
      if (!current()) return;
      await browserStore.acknowledgeGuestTransfer(id, transfer.id);
      if (!current()) return;
      announce(id);
    }
    publish({ items: data.items, status: "ready", accountId: id, notice: "" });
  } catch (error) {
    if (current()) publish({ ...initial, accountId: id, status: "error", notice: error instanceof Error ? error.message : "Saved pieces could not be loaded. Retry." });
  }
}
function start() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  browserStore.subscribe(() => {
    if (owner() === null) publish({ ...browserStore.getSnapshot(), accountId: null });
  });
  subscribeAuth(() => { void load(); });
  window.addEventListener("focus", () => { if (owner()) void load(); });
  window.addEventListener("storage", event => { if (event.key === "wishlyn-server-wishlist-change" && owner()) void load(); });
  void refreshAuthSession().catch(() => undefined);
  void load();
}
export const savedWishlistStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    start();
    return () => { listeners.delete(listener); };
  },
  getSnapshot: () => snapshot,
  getServerSnapshot: () => initial,
  retry: async () => { await refreshAuthSession(); await load(); },
  mutate(action: "add" | "remove" | "toggle", productId: string) {
    const id = owner();
    if (!validId(productId) || id === undefined || snapshot.status !== "ready") return;
    if (id === null) {
      void browserStore.mutate(items => action === "remove" || (action === "toggle" && items.includes(productId)) ? items.filter(item => item !== productId) : [...new Set([...items, productId])].slice(0, 50));
      return;
    }
    const projected = new Set(snapshot.items);
    for (const intent of intents) if (intent.epoch === ownerEpoch && intent.ownerId === id) {
      if (intent.action === "remove") projected.delete(intent.productId); else projected.add(intent.productId);
    }
    intents.push({ ownerId: id, epoch: ownerEpoch, productId, action: action === "toggle" ? projected.has(productId) ? "remove" : "add" : action });
    void drain();
  },
};
