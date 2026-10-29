"use client";
import { getAuthState, refreshAuthSession, subscribeAuth } from "../authClient";
import { wishlistStore as browserStore } from "../shopping-store";
import { decodeWishlist, shoppingKey, validId } from "../shopping-state";
import type { SavedWishlist } from "./types";

type Snapshot = {
  items: string[];
  status: "loading" | "ready" | "error";
  notice: string;
  accountId: string | null;
};
const initial: Snapshot = {
  items: [],
  status: "loading",
  notice: "",
  accountId: null,
};
let snapshot = initial,
  generation = 0,
  initialized = false;
let controller: AbortController | null = null,
  queue = Promise.resolve();
const listeners = new Set<() => void>();
const publish = (next: Snapshot) => {
  snapshot = next;
  listeners.forEach((listener) => listener());
};
const owner = () => {
  const auth = getAuthState();
  return auth.status === "authenticated"
    ? auth.user?.id
    : auth.status === "guest"
      ? null
      : undefined;
};
async function request(
  body?: unknown,
  signal?: AbortSignal,
): Promise<SavedWishlist> {
  const response = await fetch("/api/account/wishlist", {
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    credentials: "same-origin",
    cache: "no-store",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
      : AbortSignal.timeout(10000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "Saved pieces could not be loaded.",
    );
  if (
    typeof data.ownerId !== "string" ||
    !Array.isArray(data.items) ||
    data.items.length > 50 ||
    !data.items.every(validId)
  )
    throw new Error("Saved pieces could not be verified.");
  return data;
}
async function load() {
  const id = owner(),
    revision = ++generation;
  controller?.abort();
  controller = null;
  if (id === undefined) {
    publish({
      ...initial,
      status: getAuthState().status === "error" ? "error" : "loading",
      notice:
        getAuthState().status === "error"
          ? "Verify your account to load saved pieces."
          : "",
    });
    return;
  }
  if (id === null) {
    const local = browserStore.getSnapshot();
    publish({ ...local, accountId: null });
    return;
  }
  publish({ ...initial, accountId: id });
  const active = new AbortController();
  controller = active;
  try {
    await queue;
    if (revision !== generation || owner() !== id) return;
    let data = await request(undefined, active.signal);
    if (revision !== generation || owner() !== id || data.ownerId !== id)
      return;
    if (!data.browserImported) {
      let items: string[] = [];
      try {
        items = decodeWishlist(
          localStorage.getItem(shoppingKey("wishlist", id)),
        ).items;
      } catch {
        /* Server saving remains available without browser storage. */
      }
      data = await request(
        { action: "import", productIds: items },
        active.signal,
      );
      if (revision !== generation || owner() !== id || data.ownerId !== id)
        return;
    }
    publish({ items: data.items, status: "ready", accountId: id, notice: "" });
  } catch (error) {
    if (revision === generation && owner() === id)
      publish({
        ...initial,
        accountId: id,
        status: "error",
        notice:
          error instanceof Error
            ? error.message
            : "Saved pieces could not be loaded. Retry.",
      });
  }
}
function start() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  browserStore.subscribe(() => {
    if (owner() === null) {
      const local = browserStore.getSnapshot();
      publish({ ...local, accountId: null });
    }
  });
  subscribeAuth(() => {
    void load();
  });
  window.addEventListener("focus", () => {
    if (owner()) void load();
  });
  window.addEventListener("storage", (event) => {
    if (event.key === "wishlyn-server-wishlist-change" && owner()) void load();
  });
  void refreshAuthSession().catch(() => undefined);
  void load();
}
export const savedWishlistStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    start();
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => snapshot,
  getServerSnapshot: () => initial,
  retry: async () => {
    await refreshAuthSession();
    await load();
  },
  mutate(action: "add" | "remove" | "toggle", productId: string) {
    const id = owner(),
      revision = generation;
    if (!validId(productId) || id === undefined || snapshot.status !== "ready")
      return;
    if (id === null) {
      void browserStore.mutate((items) =>
        action === "remove" ||
        (action === "toggle" && items.includes(productId))
          ? items.filter((item) => item !== productId)
          : [...new Set([...items, productId])].slice(0, 50),
      );
      return;
    }
    queue = queue.then(async () => {
      if (owner() !== id || revision !== generation) return;
      try {
        const data = await request({ action, productId });
        if (owner() !== id || revision !== generation || data.ownerId !== id)
          return;
        publish({
          items: data.items,
          status: "ready",
          notice: "",
          accountId: id,
        });
        try {
          localStorage.setItem(
            "wishlyn-server-wishlist-change",
            `${id}:${Date.now()}:${Math.random()}`,
          );
        } catch {
          /* Server persistence is independent of storage. */
        }
      } catch (error) {
        if (owner() === id && revision === generation)
          publish({
            ...snapshot,
            notice:
              error instanceof Error
                ? error.message
                : "This change could not be saved. Retry.",
            status: "error",
          });
      }
    });
  },
};
