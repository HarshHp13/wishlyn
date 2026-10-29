'use client';

import { getAuthState, refreshAuthSession, subscribeAuth } from './authClient';
import { addCartLine, decodeCart, decodeWishlist, encodeShopping, shoppingKey, type CartItem } from './shopping-state';

type GuestTransfer<T> = { id: string; items: T[] };
type Snapshot<T> = { items: T[]; status: 'loading' | 'ready' | 'error'; notice: string; accountId: string | null; guestTransfers?: GuestTransfer<T>[] };

function createStore<T>(kind: string, decode: (raw: string | null) => { items: T[]; recovered: boolean }, merge: (a: T[], b: T[]) => T[]) {
  const initial: Snapshot<T> = { items: [], status: 'loading', notice: '', accountId: null };
  let snapshot = initial;
  let scope: string | null = null;
  let started = false;
  let lastVerifiedAccount: string | null | undefined;
  let memoryOnly = false;
  let guestMemory: T[] = [];
  const pendingGuests = new Map<string, GuestTransfer<T>[]>();
  const guestAssignments = new Map<string, string>();
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
  const transferKey = (accountId: string) => `${shoppingKey(kind, accountId)}-guest-transfers`;
  function readTransfers(accountId: string): GuestTransfer<T>[] {
    const raw: unknown = JSON.parse(localStorage.getItem(transferKey(accountId)) || '[]');
    if (!Array.isArray(raw) || raw.length > 1000) throw new Error('Invalid guest transfer record');
    return raw.flatMap(value => {
      if (!value || typeof value.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.id) || !Array.isArray(value.items)) return [];
      return [{ id: value.id, items: decode(encodeShopping(value.items)).items }];
    });
  }
  function captureGuest(accountId: string, items: T[]) {
    if (kind !== 'wishlist' || !items.length) return;
    const pending = pendingGuests.get(accountId) || [];
    const id = crypto.randomUUID();
    pendingGuests.set(accountId, [...pending, { id, items }]);
    return id;
  }

  function load() {
    if (lastVerifiedAccount === null && snapshot.accountId === null && snapshot.status === 'ready') guestMemory = snapshot.items;
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
      if (accountId && previous === null && kind === 'wishlist') {
        const id = captureGuest(accountId, guestMemory);
        if (id) guestAssignments.set(accountId, id);
      }
      memoryOnly = false;
      scope = key;
      publish({ ...initial, accountId });
      queue = queue.then(() => lock(() => {
        if (identity() !== accountId || scope !== key) return;
        let guestCaptured = !!(accountId && guestAssignments.has(accountId));
        try {
          // Universal legacy keys have no reliable owner and are never imported.
          localStorage.removeItem(`wishlyn-${kind}`);
          if (previous && accountId === null) localStorage.removeItem(shoppingKey(kind, null));
          let current = decode(localStorage.getItem(key));
          if (kind === 'wishlist' && accountId) {
            const combined = new Map(readTransfers(accountId).map(transfer => [transfer.id, transfer]));
            for (const transfer of pendingGuests.get(accountId) || []) combined.set(transfer.id, transfer);
            pendingGuests.set(accountId, [...combined.values()]);
          }
          if (accountId && (previous === null || guestAssignments.has(accountId))) {
            const guestKey = shoppingKey(kind, null);
            const guest = decode(localStorage.getItem(guestKey));
            const assigned = pendingGuests.get(accountId)?.find(transfer => transfer.id === guestAssignments.get(accountId));
            const picks = merge(merge(guest.items, guestMemory), assigned?.items || []);
            if (picks.length) {
              if (assigned) assigned.items = picks;
              else captureGuest(accountId, picks);
              guestCaptured = true;
              // Keep explicit guest intent separate from the once-only legacy list.
              if (kind === 'wishlist') localStorage.setItem(transferKey(accountId), JSON.stringify(pendingGuests.get(accountId) || []));
              current = { items: merge(current.items, picks), recovered: current.recovered || guest.recovered };
              localStorage.setItem(key, encodeShopping(current.items));
              localStorage.removeItem(guestKey);
            }
            guestMemory = [];
            guestAssignments.delete(accountId);
          }
          if (accountId && previous === undefined) localStorage.removeItem(shoppingKey(kind, null));
          if (current.recovered) localStorage.setItem(key, encodeShopping(current.items));
          publish({ items: current.items, status: 'ready', accountId, guestTransfers: accountId ? pendingGuests.get(accountId) : undefined, notice: current.recovered ? 'Some saved shopping items were incompatible and have been removed. Please check your selection.' : '' });
        } catch {
          memoryOnly = true;
          if (accountId && previous === null && !guestCaptured) captureGuest(accountId, guestMemory);
          const items = previous === null && accountId ? guestMemory : [];
          if (accountId) { guestMemory = []; guestAssignments.delete(accountId); }
          publish({ items, status: 'ready', accountId, guestTransfers: accountId ? pendingGuests.get(accountId) : undefined, notice: 'Browser storage is unavailable. Your shopping items will last only for this visit.' });
        }
      })).catch(() => notify('Your saved shopping items could not be loaded. Please retry.'));
      return;
    }
    if (memoryOnly) return;
    try {
      const decoded = decode(localStorage.getItem(key));
      if (kind === 'wishlist' && accountId) pendingGuests.set(accountId, readTransfers(accountId));
      publish({ ...snapshot, items: decoded.items, guestTransfers: accountId ? pendingGuests.get(accountId) : undefined, status: 'ready', notice: decoded.recovered ? 'Some saved shopping items were incompatible and have been removed.' : snapshot.notice });
    } catch { notify('Browser storage is unavailable. Your shopping items will last only for this visit.'); }
  }

  function start() {
    if (started || typeof window === 'undefined') return;
    started = true;
    subscribeAuth(load);
    window.addEventListener('storage', event => { if (event.key === scope || event.key === `${scope}-guest-transfers` || event.key === null) load(); });
    void refreshAuthSession().catch(() => undefined);
    load();
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    subscribe: (listener: () => void) => { listeners.add(listener); start(); return () => { listeners.delete(listener); }; },
    notify,
    retry: async () => { await refreshAuthSession(); load(); },
    ready: (expected: string, signal?: AbortSignal): Promise<Snapshot<T>> => {
      start();
      return new Promise((resolve, reject) => {
        const cleanup = () => { listeners.delete(check); signal?.removeEventListener('abort', abort); };
        const abort = () => { cleanup(); reject(new Error('Saved-item migration was cancelled.')); };
        const check = () => {
          if (signal?.aborted) return abort();
          const current = identity();
          if (current !== undefined && current !== expected) { cleanup(); reject(new Error('Your account changed.')); }
          else if (snapshot.accountId === expected && snapshot.status === 'ready') { cleanup(); resolve(snapshot); }
        };
        listeners.add(check);
        signal?.addEventListener('abort', abort, { once: true });
        check();
      });
    },
    acknowledgeGuestTransfer: (expected: string, id: string) => {
      queue = queue.then(() => lock(() => {
        if (identity() !== expected || scope !== shoppingKey(kind, expected)) return;
        let pending = pendingGuests.get(expected) || [];
        try {
          const combined = new Map(readTransfers(expected).map(transfer => [transfer.id, transfer]));
          for (const transfer of pending) combined.set(transfer.id, transfer);
          pending = [...combined.values()];
        } catch { /* Memory retains guest intent when storage is blocked. */ }
        pending = pending.filter(transfer => transfer.id !== id);
        pendingGuests.set(expected, pending);
        try { localStorage.setItem(transferKey(expected), JSON.stringify(pending)); } catch { /* Replayed transfer IDs are idempotent on the server. */ }
        publish({ ...snapshot, guestTransfers: pending });
      }));
      return queue;
    },
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
        publish({ ...snapshot, items: next, accountId: expected, status: 'ready', notice });
      })).catch(() => notify('Your shopping change could not be saved. Please retry.'));
      return queue;
    },
  };
}

export const cartStore = createStore<CartItem>('cart', decodeCart, (current, guest) => guest.reduce((items, line) => addCartLine(items, line), current));
export const wishlistStore = createStore<string>('wishlist', decodeWishlist, (current, guest) => [...new Set([...current, ...guest])].slice(0, 50));
