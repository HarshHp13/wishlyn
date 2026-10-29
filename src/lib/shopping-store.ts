'use client';

import { getAuthState, refreshAuthSession, subscribeAuth } from './authClient';
import { addCartLine, decodeCart, decodeWishlist, encodeShopping, shoppingKey, type CartItem } from './shopping-state';

type GuestTransfer<T> = { id: string; items: T[] };
type Snapshot<T> = { items: T[]; status: 'loading' | 'ready' | 'error'; notice: string; accountId: string | null; guestTransfers?: GuestTransfer<T>[] };

function createStore<T>(kind: string, decode: (raw: string | null) => { items: T[]; recovered: boolean }, merge: (a: T[], b: T[]) => T[], localChanges: (before: T[], after: T[], local: T[]) => T[], sameSelection: (a: T, b: T) => boolean) {
  const initial: Snapshot<T> = { items: [], status: 'loading', notice: '', accountId: null };
  let snapshot = initial, scope: string | null = null, started = false;
  let lastVerifiedAccount: string | null | undefined;
  let memoryOnly = false;
  let guestMemory: T[] = [], guestSelections: GuestTransfer<T>[] = [];
  // A storage failure does not make a shared snapshot local intent. Track only
  // actions that this tab could not persist, including cart quantity deltas.
  let guestLocalItems: T[] = [], guestLocalOwner: string | null = null;
  const localSelectionIds = new Set<string>();
  const pendingGuests = new Map<string, GuestTransfer<T>[]>();
  const guestAssignments = new Map<string, GuestTransfer<T>[]>();
  const memory = new Map<string, T[]>();
  let queue: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();
  const publish = (next: Snapshot<T>) => {
    if (kind === 'cart' && memoryOnly && scope && next.status === 'ready') memory.set(scope, next.items);
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
    return items.map(item => {
      const previous = prior.find(record => record.items.length === 1 && sameSelection(record.items[0], item));
      return { id: previous?.id || crypto.randomUUID(), items: [item] };
    });
  }
  function captureGuest(accountId: string) {
    const captured = guestSelections.filter(record => record.items.some(item => guestMemory.includes(item)));
    if (guestLocalOwner === null) guestLocalOwner = accountId;
    // Capture is a retry candidate, never permission to send a shared record.
    guestAssignments.set(accountId, captured);
  }
  function eligibleGuestMemory(accountId: string): T[] {
    return identity() === accountId && (guestLocalOwner === null || guestLocalOwner === accountId) ? guestLocalItems : [];
  }
  function localRecords(accountId: string) {
    return eligibleGuestMemory(accountId).length ? guestSelections.filter(record => localSelectionIds.has(record.id)) : [];
  }
  function consumeLocalGuest(accountId: string) {
    if (guestLocalOwner !== null && guestLocalOwner !== accountId) return;
    guestLocalItems = []; localSelectionIds.clear();
  }
  function guestRecords(items: T[]) {
    guestSelections = selections(items, readRecords(selectionKey));
    persistRecords(selectionKey, guestSelections);
    return guestSelections;
  }
  // Call under the shopping Web Lock, after reading the live persisted cart.
  // A durable claim must precede account publication, including quota fallback.
  // Already claimed IDs are spent: cached same-owner carts must not add twice.
  function claimLiveCartGuest(accountId: string, items: T[]): { items: T[]; complete: boolean } {
    const claimed: T[] = [];
    try {
      const records = selections(items, readRecords(selectionKey));
      persistRecords(selectionKey, records);
      for (const record of records) {
        if (localStorage.getItem(claimKey(record.id))) continue;
        localStorage.setItem(claimKey(record.id), accountId);
        claimed.push(...record.items);
      }
      return { items: claimed, complete: true };
    } catch { return { items: claimed, complete: false }; }
  }
  function unclaimedGuestCart(items: T[]): T[] {
    return selections(items, readRecords(selectionKey)).filter(record => !localStorage.getItem(claimKey(record.id))).flatMap(record => record.items);
  }
  function load() {
    if (lastVerifiedAccount === null && snapshot.accountId === null && snapshot.status === 'ready') {
      guestMemory = snapshot.items;
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
      if (accountId && previous === null) captureGuest(accountId);
      if (kind === 'cart' && previous && accountId === null) memory.delete(key);
      memoryOnly = kind === 'cart' && memory.has(key);
      scope = key;
      publish({ ...initial, accountId });
      queue = queue.then(() => lock(() => {
        if (identity() !== accountId || scope !== key) return;
        if (kind === 'cart' && memory.has(key)) {
          let items = memory.get(key) || [];
          let retained = false;
          if (accountId && (previous === null || guestAssignments.has(accountId))) {
            let shared: T[] = [];
            try {
              const claimed = claimLiveCartGuest(accountId, decode(localStorage.getItem(shoppingKey(kind, null))).items);
              shared = claimed.items; retained = !claimed.complete;
            } catch { retained = true; }
            items = merge(items, merge(shared, eligibleGuestMemory(accountId)));
            consumeLocalGuest(accountId);
            memory.delete(shoppingKey(kind, null));
            if (!retained) { guestAssignments.delete(accountId); guestMemory = []; guestSelections = []; }
          }
          publish({ items, status: 'ready', accountId, notice: retained ? 'Browser storage is unavailable. Some guest selections are retained for verification; retry when storage is available.' : 'Browser storage is unavailable. Your shopping items will last only for this visit.' });
          return;
        }
        let migratedItems: T[] | undefined, accountItems: T[] | undefined;
        let verifiedGuest = false;
        try {
          localStorage.removeItem(`wishlyn-${kind}`);
          if (previous && accountId === null) localStorage.removeItem(shoppingKey(kind, null));
          let current = decode(localStorage.getItem(key));
          accountItems = current.items;
          if (kind === 'cart' && accountId === null) {
            const live = unclaimedGuestCart(current.items);
            accountItems = live;
            if (live.length !== current.items.length) localStorage.setItem(key, encodeShopping(live));
            current = { ...current, items: live };
          }
          if (accountId && (previous === null || guestAssignments.has(accountId))) {
            const guestKey = shoppingKey(kind, null);
            const guest = decode(localStorage.getItem(guestKey));
            let picks: T[];
            if (kind === 'wishlist') {
              const stored = selections(guest.items, readRecords(selectionKey));
              persistRecords(selectionKey, stored);
              const live = new Set(stored.map(record => record.id));
              const local = new Set(localRecords(accountId).map(record => record.id));
              const accepted = new Set((pendingGuests.get(accountId) || []).map(record => record.id));
              const permitted = (record: GuestTransfer<T>) => {
                const claim = localStorage.getItem(claimKey(record.id));
                // A missing claim is permission only for a current live pick
                // or a fresh local action, never for a canceled cached pick.
                return claim === accountId || (!claim && (live.has(record.id) || local.has(record.id) || accepted.has(record.id)));
              };
              const candidates = combine(guestAssignments.get(accountId) || [], stored, localRecords(accountId));
              const allowed = candidates.filter(permitted);
              const pending = combine(readRecords(transferKey(accountId)), pendingGuests.get(accountId) || [], allowed).filter(permitted);
              pendingGuests.set(accountId, pending);
              picks = merge([], allowed.flatMap(record => record.items));
              migratedItems = merge(current.items, picks);
              verifiedGuest = true;
              consumeLocalGuest(accountId);
              for (const record of allowed) {
                if (!localStorage.getItem(claimKey(record.id))) localStorage.setItem(claimKey(record.id), accountId);
              }
              persistRecords(transferKey(accountId), pending);
            } else {
              // Persisted live intent is authoritative. Only unpersisted local
              // additions can supplement it; a cached shared copy cannot.
              const claimed = claimLiveCartGuest(accountId, guest.items);
              picks = merge(claimed.items, eligibleGuestMemory(accountId));
              verifiedGuest = claimed.complete;
            }
            current = { items: merge(current.items, picks), recovered: current.recovered || guest.recovered };
            migratedItems = current.items;
            consumeLocalGuest(accountId);
            if (verifiedGuest) guestAssignments.delete(accountId);
            if (picks.length) localStorage.setItem(key, encodeShopping(current.items));
            if (verifiedGuest) {
              localStorage.removeItem(guestKey);
              if (kind === 'cart') memory.delete(guestKey);
              guestMemory = []; guestSelections = [];
            }
          }
          if (kind === 'wishlist' && accountId && !verifiedGuest) pendingGuests.set(accountId, readRecords(transferKey(accountId)));
          if (accountId && previous === undefined) localStorage.removeItem(shoppingKey(kind, null));
          if (current.recovered) localStorage.setItem(key, encodeShopping(current.items));
          if (accountId === null) guestRecords(current.items);
          const records = kind === 'wishlist' ? accountId ? pendingGuests.get(accountId) : guestSelections : undefined;
          const retained = !!accountId && !verifiedGuest && guestAssignments.has(accountId) && guestMemory.length > 0;
          publish({ items: current.items, status: 'ready', accountId, guestTransfers: records, notice: retained ? 'Browser storage is unavailable. Some guest selections are retained for verification; retry when storage is available.' : current.recovered ? 'Some saved shopping items were incompatible and have been removed. Please check your selection.' : '' });
        } catch {
          memoryOnly = true;
          let items = accountId ? migratedItems || merge(accountItems || [], eligibleGuestMemory(accountId)) : accountItems || guestMemory;
          if (accountId && kind === 'wishlist') {
            const pending = combine(pendingGuests.get(accountId) || [], localRecords(accountId));
            pendingGuests.set(accountId, pending);
            items = migratedItems || merge(items, pending.flatMap(record => record.items));
          }
          const retained = !!accountId && !verifiedGuest && guestAssignments.has(accountId) && guestMemory.length > 0;
          if (accountId) {
            consumeLocalGuest(accountId);
            if (verifiedGuest) { guestMemory = []; guestSelections = []; guestAssignments.delete(accountId); }
          }
          publish({ items, status: 'ready', accountId, guestTransfers: accountId ? pendingGuests.get(accountId) : guestSelections, notice: retained ? 'Browser storage is unavailable. Some guest selections are retained for verification; retry when storage is available.' : 'Browser storage is unavailable. Your shopping items will last only for this visit.' });
        }
      })).catch(() => notify('Your saved shopping items could not be loaded. Please retry.'));
      return;
    }
    if (memoryOnly) return;
    if (accountId === null) {
      queue = queue.then(() => lock(() => {
        if (identity() !== null || scope !== key) return;
        let items = snapshot.items;
        try {
          const current = decode(localStorage.getItem(key));
          items = kind === 'cart' ? unclaimedGuestCart(current.items) : current.items;
          if (items.length !== current.items.length) localStorage.setItem(key, encodeShopping(items));
          const records = guestRecords(items);
          publish({ ...snapshot, items, guestTransfers: kind === 'wishlist' ? records : undefined, status: 'ready' });
        } catch {
          memoryOnly = true;
          publish({ ...snapshot, items, notice: 'Browser storage is unavailable. Your shopping items will last only for this visit.', status: 'ready' });
        }
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
    retry: async () => { await refreshAuthSession(); const accountId = identity(); if (accountId && guestAssignments.has(accountId)) scope = null; load(); },
    // Integration code recovering a cached account cart must call this when
    // guest storage cannot be read. The shared guest snapshot is ineligible.
    getEligibleGuestRecovery: eligibleGuestMemory,
    consumeGuestRecovery: (expected: string) => { if (identity() === expected) consumeLocalGuest(expected); },
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
        if (expected === null && kind === 'cart' && !memoryOnly) {
          try { items = unclaimedGuestCart(items); } catch { /* Shared cached quantities never become local additions. */ }
        }
        const next = update(items);
        const local = expected === null ? localChanges(items, next, guestLocalItems) : [];
        let notice = snapshot.notice;
        let storedRecords: GuestTransfer<T>[] = [];
        if (expected === null) {
          let prior = guestSelections;
          try { storedRecords = readRecords(selectionKey); prior = storedRecords.filter(record => record.items.some(item => items.some(current => sameSelection(item, current)))); } catch { /* In-memory keys remain stable when storage is blocked. */ }
          guestSelections = selections(next, prior);
        }
        try {
          // Keep old claim metadata until the corresponding guest payload is
          // replaced. A quota failure cannot erase ownership of the old copy.
          if (expected === null) persistRecords(selectionKey, combine(storedRecords, guestSelections));
          localStorage.setItem(key, encodeShopping(next));
          if (expected === null) { try { persistRecords(selectionKey, guestSelections); } catch { /* Extra old records are harmless; only live payloads may claim unspent IDs. */ } }
          if (expected === null) { guestLocalItems = []; guestLocalOwner = null; localSelectionIds.clear(); }
        } catch {
          memoryOnly = true; notice = 'Browser storage is unavailable. Your shopping items will last only for this visit.';
          if (expected === null) {
            guestLocalItems = local; guestLocalOwner = null;
            localSelectionIds.clear();
            for (const record of guestSelections) if (record.items.some(item => local.includes(item))) localSelectionIds.add(record.id);
          }
        }
        publish({ ...snapshot, items: next, accountId: expected, guestTransfers: expected === null && kind === 'wishlist' ? guestSelections : snapshot.guestTransfers, status: 'ready', notice });
      })).catch(() => notify('Your shopping change could not be saved. Please retry.'));
      return queue;
    },
  };
}
export const cartStore = createStore<CartItem>('cart', decodeCart, (current, guest) => guest.reduce((items, line) => addCartLine(items, line), current), (before, after, local) => after.flatMap(item => {
  const quantity = Math.min(item.quantity, Math.max(0, (local.find(line => line.id === item.id)?.quantity || 0) + item.quantity - (before.find(line => line.id === item.id)?.quantity || 0)));
  return quantity ? [{ ...item, quantity }] : [];
}), (a, b) => a.id === b.id && a.quantity === b.quantity);
export const wishlistStore = createStore<string>('wishlist', decodeWishlist, (current, guest) => [...new Set([...current, ...guest])].slice(0, 50), (before, after, local) => after.filter(item => local.includes(item) || !before.includes(item)), (a, b) => a === b);
