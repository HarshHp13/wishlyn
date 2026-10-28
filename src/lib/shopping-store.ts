'use client';

import { getAuthState, refreshAuthSession, subscribeAuth } from './authClient';
import { addCartLine, decodeCart, decodeWishlist, encodeShopping, shoppingKey, type CartItem } from './shopping-state';

type Snapshot<T> = { items: T[]; status: 'loading' | 'ready' | 'error'; notice: string; accountId: string | null };

function createStore<T>(kind: string, decode: (raw: string | null) => { items: T[]; recovered: boolean }, merge: (a: T[], b: T[]) => T[]) {
  const initial: Snapshot<T> = { items: [], status: 'loading', notice: '', accountId: null };
  let snapshot = initial;
  let scope: string | null = null;
  let started = false;
  let lastVerifiedAccount: string | null | undefined;
  let memoryOnly = false;
  let queue: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();
  const publish = (next: Snapshot<T>) => {
    if (JSON.stringify(snapshot) === JSON.stringify(next)) return;
    snapshot = next;
    listeners.forEach(listener => listener());
  };
  const notify = (notice: string) => publish({ ...snapshot, notice });
  const lock = async (action: () => void | Promise<void>) => {
    if (navigator.locks) await navigator.locks.request(`wishlyn-${kind}`, action);
    else await action(); // Synchronous read-modify-write; older browsers use last committed update.
  };
  const identity = () => {
    const auth = getAuthState();
    return auth.status === 'authenticated' && auth.user ? auth.user.id : auth.status === 'guest' ? null : undefined;
  };

  function load() {
    const accountId = identity();
    if (accountId === undefined) {
      scope = null;
      const error = getAuthState().status === 'error';
      publish({ ...initial, status: error ? 'error' : 'loading', notice: error ? 'We could not verify your session. Retry to load your saved shopping items.' : '' });
      return;
    }
    const key = shoppingKey(kind, accountId);
    if (key !== scope) {
      const previous = lastVerifiedAccount;
      lastVerifiedAccount = accountId;
      memoryOnly = false;
      scope = key;
      publish({ ...initial, accountId });
      queue = queue.then(() => lock(() => {
        if (identity() !== accountId || scope !== key) return;
        try {
          // Universal legacy keys have no reliable owner and are never imported.
          localStorage.removeItem(`wishlyn-${kind}`);
          if (previous && accountId === null) localStorage.removeItem(shoppingKey(kind, null));
          let current = decode(localStorage.getItem(key));
          if (accountId && previous === null) {
            const guestKey = shoppingKey(kind, null);
            const guest = decode(localStorage.getItem(guestKey));
            if (guest.items.length) {
              current = { items: merge(current.items, guest.items), recovered: current.recovered || guest.recovered };
              localStorage.setItem(key, encodeShopping(current.items));
              localStorage.removeItem(guestKey);
            }
          }
          if (accountId && previous === undefined) localStorage.removeItem(shoppingKey(kind, null));
          if (current.recovered) localStorage.setItem(key, encodeShopping(current.items));
          publish({ items: current.items, status: 'ready', accountId, notice: current.recovered ? 'Some saved shopping items were incompatible and have been removed. Please check your selection.' : '' });
        } catch {
          memoryOnly = true;
          publish({ items: [], status: 'ready', accountId, notice: 'Browser storage is unavailable. Your shopping items will last only for this visit.' });
        }
      })).catch(() => notify('Your saved shopping items could not be loaded. Please retry.'));
      return;
    }
    if (memoryOnly) return;
    try {
      const decoded = decode(localStorage.getItem(key));
      publish({ ...snapshot, items: decoded.items, status: 'ready', notice: decoded.recovered ? 'Some saved shopping items were incompatible and have been removed.' : snapshot.notice });
    } catch { notify('Browser storage is unavailable. Your shopping items will last only for this visit.'); }
  }

  function start() {
    if (started || typeof window === 'undefined') return;
    started = true;
    subscribeAuth(load);
    window.addEventListener('storage', event => { if (event.key === scope || event.key === null) load(); });
    void refreshAuthSession().catch(() => undefined);
    load();
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    subscribe: (listener: () => void) => { listeners.add(listener); start(); return () => { listeners.delete(listener); }; },
    notify,
    retry: async () => { await refreshAuthSession(); load(); },
    mutate: (update: (items: T[]) => T[]) => {
      const expected = identity();
      const key = scope;
      if (expected === undefined || !key || snapshot.status !== 'ready') return Promise.resolve();
      queue = queue.then(() => lock(() => {
        if (identity() !== expected || scope !== key) return;
        let items = snapshot.items;
        try { if (!memoryOnly) items = decode(localStorage.getItem(key)).items; } catch { /* In-memory fallback remains usable. */ }
        const next = update(items);
        let notice = snapshot.notice;
        try { localStorage.setItem(key, encodeShopping(next)); }
        catch { memoryOnly = true; notice = 'Browser storage is unavailable. Your shopping items will last only for this visit.'; }
        publish({ items: next, accountId: expected, status: 'ready', notice });
      })).catch(() => notify('Your shopping change could not be saved. Please retry.'));
      return queue;
    },
  };
}

export const cartStore = createStore<CartItem>('cart', decodeCart, (current, guest) => guest.reduce((items, line) => addCartLine(items, line), current));
export const wishlistStore = createStore<string>('wishlist', decodeWishlist, (current, guest) => [...new Set([...current, ...guest])].slice(0, 50));
