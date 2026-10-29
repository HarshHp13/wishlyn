'use client';

import { getAuthState, refreshAuthSession, subscribeAuth } from './authClient';
import { addCartLine, decodeCart, decodeWishlist, encodeShopping, shoppingKey, type CartItem } from './shopping-state';

type GuestTransfer<T> = { id: string; items: T[] };
type Snapshot<T> = { items: T[]; status: 'loading' | 'ready' | 'error'; notice: string; accountId: string | null; guestTransfers?: GuestTransfer<T>[] };

function createStore<T>(kind: string, decode: (raw: string | null) => { items: T[]; recovered: boolean }, merge: (a: T[], b: T[]) => T[]) {
  const initial: Snapshot<T> = { items: [], status: 'loading', notice: '', accountId: null };
  let snapshot = initial, scope: string | null = null, started = false;
  let lastVerifiedAccount: string | null | undefined;
  let memoryOnly = false, guestMemoryOnly = false;
  let guestMemory: T[] = [], guestSelections: GuestTransfer<T>[] = [];
  const pendingGuests = new Map<string, GuestTransfer<T>[]>();
  const guestAssignments = new Map<string, GuestTransfer<T>[]>();
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
    else await action();
  };
  const identity = () => {
    const auth = getAuthState();
    return auth.status === 'authenticated' && auth.user ? auth.user.id : auth.status === 'guest' ? null : undefined;
  };
  const transferKey = (accountId: string) => `${shoppingKey(kind, accountId)}-guest-transfers`;
  const selectionKey = `${shoppingKey(kind, null)}-selections`;
  const claimKey = (id: string) => `${shoppingKey(kind, null)}-claim-${id}`;
  function readRecords(key: string): GuestTransfer<T>[] {
    const raw: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(raw) || raw.length > 1000) throw new Error('Invalid guest selection record');
    return raw.flatMap(value => {
      if (!value || typeof value.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.id) || !Array.isArray(value.items)) return [];
      return [{ id: value.id, items: decode(encodeShopping(value.items)).items }];
    });
  }
  const combine = (...groups: GuestTransfer<T>[][]) => [...new Map(groups.flat().map(record => [record.id, record])).values()];
  function persistRecords(key: string, records: GuestTransfer<T>[]) {
    const encoded = JSON.stringify(records);
    if (localStorage.getItem(key) !== encoded) localStorage.setItem(key, encoded);
  }
  // Each selected product keeps its key when other guest products change.
  // Creation and persistence happen under the same Web Lock as guest writes.
  function selections(items: T[], prior: GuestTransfer<T>[]): GuestTransfer<T>[] {
    return items.map(item => prior.find(record => record.items.length === 1 && record.items[0] === item) || { id: crypto.randomUUID(), items: [item] });
  }
  function captureGuest(accountId: string) {
    const captured = guestSelections.filter(record => record.items.some(item => guestMemory.includes(item)));
    pendingGuests.set(accountId, combine(pendingGuests.get(accountId) || [], captured));
    if (captured.length) guestAssignments.set(accountId, captured);
  }
  function guestRecords(items: T[]) {
    guestSelections = selections(items, readRecords(selectionKey));
    persistRecords(selectionKey, guestSelections);
    return guestSelections;
  }
  function load() {
    if (lastVerifiedAccount === null && snapshot.accountId === null && snapshot.status === 'ready') {
      guestMemory = snapshot.items;
      guestMemoryOnly = memoryOnly;
    }
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
      if (accountId && previous === null && kind === 'wishlist') captureGuest(accountId);
      memoryOnly = false;
      scope = key;
      publish({ ...initial, accountId });
      queue = queue.then(() => lock(() => {
        if (identity() !== accountId || scope !== key) return;
        let migratedItems: T[] | undefined;
        try {
          localStorage.removeItem(`wishlyn-${kind}`);
          if (previous && accountId === null) localStorage.removeItem(shoppingKey(kind, null));
          let current = decode(localStorage.getItem(key));
          if (kind === 'wishlist' && accountId) pendingGuests.set(accountId, combine(readRecords(transferKey(accountId)), pendingGuests.get(accountId) || []));
          if (accountId && (previous === null || guestAssignments.has(accountId))) {
            const guestKey = shoppingKey(kind, null);
            const guest = decode(localStorage.getItem(guestKey));
            let picks: T[];
            if (kind === 'wishlist') {
              const stored = readRecords(selectionKey).filter(record => record.items.some(item => guest.items.includes(item)));
              const candidates = combine(guestAssignments.get(accountId) || [], stored);
              const allowed = candidates.filter(record => {
                const claim = localStorage.getItem(claimKey(record.id));
                return !claim || claim === accountId;
              });
              for (const record of allowed) {
                if (!localStorage.getItem(claimKey(record.id))) localStorage.setItem(claimKey(record.id), accountId);
              }
              const pending = combine(pendingGuests.get(accountId) || [], allowed).filter(record => {
                const claim = localStorage.getItem(claimKey(record.id));
                return !claim || claim === accountId;
              });
              pendingGuests.set(accountId, pending);
              picks = merge([], allowed.flatMap(record => record.items));
              migratedItems = merge(current.items, picks);
              persistRecords(transferKey(accountId), pending);
            } else {
              // Cart merge adds quantities: choose one guest copy, never both.
              picks = guestMemoryOnly ? guestMemory : guest.items;
            }
            current = { items: merge(current.items, picks), recovered: current.recovered || guest.recovered };
            migratedItems = current.items;
            if (picks.length) localStorage.setItem(key, encodeShopping(current.items));
            localStorage.removeItem(guestKey);
            guestMemory = []; guestSelections = []; guestAssignments.delete(accountId);
          }
          if (accountId && previous === undefined) localStorage.removeItem(shoppingKey(kind, null));
          if (current.recovered) localStorage.setItem(key, encodeShopping(current.items));
          const records = kind === 'wishlist' && accountId === null ? guestRecords(current.items) : accountId ? pendingGuests.get(accountId) : undefined;
          publish({ items: current.items, status: 'ready', accountId, guestTransfers: records, notice: current.recovered ? 'Some saved shopping items were incompatible and have been removed. Please check your selection.' : '' });
        } catch {
          memoryOnly = true;
          const items = previous === null && accountId ? migratedItems || guestMemory : [];
          if (accountId) { guestMemory = []; guestSelections = []; guestAssignments.delete(accountId); }
          publish({ items, status: 'ready', accountId, guestTransfers: accountId ? pendingGuests.get(accountId) : guestSelections, notice: 'Browser storage is unavailable. Your shopping items will last only for this visit.' });
        }
      })).catch(() => notify('Your saved shopping items could not be loaded. Please retry.'));
      return;
    }
    if (memoryOnly) return;
    if (kind === 'wishlist' && accountId === null) {
      queue = queue.then(() => lock(() => {
        if (identity() !== null || scope !== key) return;
        const current = decode(localStorage.getItem(key));
        publish({ ...snapshot, items: current.items, guestTransfers: guestRecords(current.items), status: 'ready' });
      })).catch(() => notify('Your guest selections could not be loaded. Please retry.'));
      return;
    }
    try {
      const decoded = decode(localStorage.getItem(key));
      if (kind === 'wishlist' && accountId) pendingGuests.set(accountId, readRecords(transferKey(accountId)));
      publish({ ...snapshot, items: decoded.items, guestTransfers: accountId ? pendingGuests.get(accountId) : undefined, status: 'ready', notice: decoded.recovered ? 'Some saved shopping items were incompatible and have been removed.' : snapshot.notice });
    } catch { notify('Browser storage is unavailable. Your shopping items will last only for this visit.'); }
  }
  function start() {
    if (started || typeof window === 'undefined') return;
    started = true;
    subscribeAuth(load);
    window.addEventListener('storage', event => { if (event.key === scope || event.key === `${scope}-guest-transfers` || (scope === shoppingKey(kind, null) && event.key === selectionKey) || event.key === null) load(); });
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
        listeners.add(check); signal?.addEventListener('abort', abort, { once: true }); check();
      });
    },
    acknowledgeGuestTransfer: (expected: string, id: string) => {
      queue = queue.then(() => lock(() => {
        if (identity() !== expected || scope !== shoppingKey(kind, expected)) return;
        let pending = pendingGuests.get(expected) || [];
        try { pending = combine(readRecords(transferKey(expected)), pending); } catch { /* Storage is optional. */ }
        pending = pending.filter(transfer => transfer.id !== id);
        pendingGuests.set(expected, pending);
        try { persistRecords(transferKey(expected), pending); } catch { /* Server consumes replayed IDs once. */ }
        publish({ ...snapshot, guestTransfers: pending });
      }));
      return queue;
    },
    mutate: (update: (items: T[]) => T[]) => {
      const expected = identity(), key = scope;
      if (expected === undefined || !key || snapshot.status !== 'ready') return Promise.resolve();
      queue = queue.then(() => lock(() => {
        if (identity() !== expected || scope !== key) return;
        let items = snapshot.items;
        try { if (!memoryOnly) items = decode(localStorage.getItem(key)).items; } catch { /* In-memory fallback. */ }
        const next = update(items);
        let notice = snapshot.notice;
        if (kind === 'wishlist' && expected === null) {
          let prior = guestSelections;
          try { prior = readRecords(selectionKey).filter(record => record.items.some(item => items.includes(item))); } catch { /* In-memory keys remain stable when storage is blocked. */ }
          guestSelections = selections(next, prior);
        }
        try {
          if (kind === 'wishlist' && expected === null) persistRecords(selectionKey, guestSelections);
          localStorage.setItem(key, encodeShopping(next));
        } catch { memoryOnly = true; notice = 'Browser storage is unavailable. Your shopping items will last only for this visit.'; }
        publish({ ...snapshot, items: next, accountId: expected, guestTransfers: expected === null && kind === 'wishlist' ? guestSelections : snapshot.guestTransfers, status: 'ready', notice });
      })).catch(() => notify('Your shopping change could not be saved. Please retry.'));
      return queue;
    },
  };
}
export const cartStore = createStore<CartItem>('cart', decodeCart, (current, guest) => guest.reduce((items, line) => addCartLine(items, line), current));
export const wishlistStore = createStore<string>('wishlist', decodeWishlist, (current, guest) => [...new Set([...current, ...guest])].slice(0, 50));
