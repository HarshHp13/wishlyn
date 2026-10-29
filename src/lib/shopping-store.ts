'use client';

import { getAuthState, refreshAuthSession, subscribeAuth } from './authClient';
import { addCartLine, decodeCart, decodeWishlist, encodeShopping, shoppingKey, type CartItem } from './shopping-state';

type GuestTransfer<T> = { id: string; items: T[] };
type GuestEdit<T> = { update: (items: T[]) => T[]; sharedIds: Set<string> };
type Snapshot<T> = { items: T[]; status: 'loading' | 'ready' | 'error'; notice: string; accountId: string | null; guestTransfers?: GuestTransfer<T>[] };
type CartMemory<T> = { items: T[]; baselineKnown: boolean; edits: ((items: T[]) => T[])[] };

function createStore<T>(kind: string, decode: (raw: string | null) => { items: T[]; recovered: boolean }, merge: (a: T[], b: T[]) => T[], localChanges: (before: T[], after: T[], local: T[]) => T[], sameSelection: (a: T, b: T) => boolean, sameLine: (a: T, b: T) => boolean, sharedChanges: (before: T[], after: T[]) => T[]) {
  const initial: Snapshot<T> = { items: [], status: 'loading', notice: '', accountId: null };
  let snapshot = initial, scope: string | null = null, started = false;
  let lastVerifiedAccount: string | null | undefined;
  let memoryOnly = false;
  let guestMemory: T[] = [], guestSelections: GuestTransfer<T>[] = [];
  let guestSharedRecords: GuestTransfer<T>[] = [];
  // A storage failure does not make a shared snapshot local intent. Track only
  // actions that this tab could not persist, including cart quantity deltas.
  let guestLocalItems: T[] = [], guestLocalOwner: string | null = null;
  let guestLocalRecords: GuestTransfer<T>[] = [];
  let guestEdits: GuestEdit<T>[] = [];
  const canceledGuestIds = new Set<string>();
  const assignedLocalGuests = new Map<string, { items: T[]; records: GuestTransfer<T>[]; edits: GuestEdit<T>[] }>();
  const pendingGuests = new Map<string, GuestTransfer<T>[]>();
  const guestAssignments = new Map<string, GuestTransfer<T>[]>();
  const memory = new Map<string, CartMemory<T>>();
  let queue: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();
  const publish = (next: Snapshot<T>) => {
    if (kind === 'cart' && memoryOnly && scope && next.status === 'ready') {
      const prior = memory.get(scope);
      memory.set(scope, { items: next.items, baselineKnown: prior?.baselineKnown ?? false, edits: prior?.edits || [] });
    }
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
    const encoded = JSON.stringify(records.map(record => ({ id: record.id, items: decode(encodeShopping(record.items)).items })));
    if (localStorage.getItem(key) !== encoded) localStorage.setItem(key, encoded);
  }
  // Each selected product keeps its key when other guest products change.
  // Creation and persistence happen under the same Web Lock as guest writes.
  function selections(items: T[], prior: GuestTransfer<T>[]): GuestTransfer<T>[] {
    return items.map(item => {
      const previous = [...prior].reverse().find(record => record.items.length === 1 && sameSelection(record.items[0], item));
      return { id: previous?.id || crypto.randomUUID(), items: [item] };
    });
  }
  function storedGuestSelections(items: T[]): GuestTransfer<T>[] {
    const prior = readRecords(selectionKey);
    const raw = localStorage.getItem(shoppingKey(kind, null));
    const value = raw ? JSON.parse(raw) : null;
    if (value?.guestSelectionIds !== undefined) {
      if (!Array.isArray(value.guestSelectionIds) || value.guestSelectionIds.length > 50 || !value.guestSelectionIds.every((id: unknown) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id))) throw new Error('Invalid guest selection identity');
      const ids = new Set<string>(value.guestSelectionIds);
      return items.map(item => {
        const record = prior.find(record => ids.has(record.id) && record.items.length === 1 && sameSelection(record.items[0], item));
        if (!record) throw new Error('Guest selection identity could not be verified.');
        return { id: record.id, items: [item] };
      });
    }
    // Legacy payloads lack IDs. Preserve their oldest matching record while
    // failed replacement metadata may already contain a newer local action.
    return selections(items, [...prior].reverse());
  }
  function encodeGuest(items: T[], records: GuestTransfer<T>[]) {
    // Item data and identity change in one Storage write. Extra selection
    // records left by a failed cleanup cannot re-key an old raw payload.
    return JSON.stringify({ ...JSON.parse(encodeShopping(items)), guestSelectionIds: records.map(record => record.id) });
  }
  function captureGuest(accountId: string) {
    const captured = guestSelections.filter(record => record.items.some(item => guestMemory.includes(item)));
    if (guestLocalOwner === null) guestLocalOwner = accountId;
    // Capture is a retry candidate, never permission to send a shared record.
    guestAssignments.set(accountId, captured);
  }
  function eligibleGuestMemory(accountId: string): T[] {
    if (identity() !== accountId) return [];
    return merge(assignedLocalGuests.get(accountId)?.items || [], guestLocalOwner === null || guestLocalOwner === accountId ? guestLocalItems : []);
  }
  function localRecords(accountId: string) {
    if (identity() !== accountId) return [];
    return combine(assignedLocalGuests.get(accountId)?.records || [], guestLocalOwner === null || guestLocalOwner === accountId ? guestLocalRecords : []);
  }
  function consumeLocalGuest(accountId: string, sharedComplete: boolean) {
    const prior = assignedLocalGuests.get(accountId);
    const edits = [...(prior?.edits || []), ...(guestLocalOwner === null || guestLocalOwner === accountId ? guestEdits : [])];
    if (!sharedComplete && edits.length) assignedLocalGuests.set(accountId, { items: [], records: [], edits });
    else assignedLocalGuests.delete(accountId);
    if (guestLocalOwner !== null && guestLocalOwner !== accountId) return;
    guestLocalItems = []; guestLocalRecords = []; guestEdits = [];
  }
  function freshGuestItems() { return guestLocalOwner === null ? guestLocalItems : []; }
  function freshGuestRecords() {
    return guestLocalOwner === null ? guestLocalRecords : [];
  }
  function startFreshGuest() {
    // A migration may still be queued. Keep its fresh local actions bound to
    // that owner, but never display them or a retained shared snapshot as guest.
    if (guestLocalOwner && (guestLocalItems.length || guestEdits.length)) {
      const prior = assignedLocalGuests.get(guestLocalOwner);
      assignedLocalGuests.set(guestLocalOwner, {
        items: merge(prior?.items || [], guestLocalItems),
        records: combine(prior?.records || [], guestLocalRecords),
        edits: [...(prior?.edits || []), ...guestEdits],
      });
    }
    guestMemory = []; guestSelections = []; guestLocalItems = []; guestLocalOwner = null;
    guestSharedRecords = []; guestLocalRecords = []; guestEdits = []; memory.delete(shoppingKey(kind, null));
  }
  function selectedGuestRecords(items: T[], prior: GuestTransfer<T>[], local: GuestTransfer<T>[]) {
    return items.map(item => {
      const fresh = local.find(record => record.items.some(local => sameLine(item, local)));
      return fresh ? { id: fresh.id, items: [item] } : selections([item], prior)[0];
    });
  }
  function guestRecords(items: T[]) {
    const prior = readRecords(selectionKey);
    const unclaimed = prior.filter(record => !canceledGuestIds.has(record.id) && !localStorage.getItem(claimKey(record.id)));
    guestSelections = selectedGuestRecords(items, unclaimed, freshGuestRecords());
    const key = shoppingKey(kind, null), encoded = encodeGuest(items, guestSelections);
    const replaced = localStorage.getItem(key) !== encoded;
    if (replaced) {
      persistRecords(selectionKey, combine(prior, guestSelections));
      localStorage.setItem(key, encoded);
    }
    guestLocalItems = []; guestLocalRecords = []; guestLocalOwner = null; guestEdits = [];
    guestSharedRecords = guestSelections;
    // An unchanged reader must not prune another tab's pending replacement.
    if (replaced) try { persistRecords(selectionKey, guestSelections); } catch { /* Old claims remain until their raw payload has been replaced. */ }
    return guestSelections;
  }
  function persistGuestCancellations() {
    for (const id of canceledGuestIds) if (!localStorage.getItem(claimKey(id))) localStorage.setItem(claimKey(id), 'cancelled');
  }
  function sharedGuestIntent(accountId: string | null, records: GuestTransfer<T>[], persist = true) {
    const edits = [...(accountId ? assignedLocalGuests.get(accountId)?.edits || [] : []), ...(guestLocalOwner === null || guestLocalOwner === accountId ? guestEdits : [])];
    let current = records;
    for (const edit of edits) {
      const affected = current.filter(record => edit.sharedIds.has(record.id)).flatMap(record => record.items);
      const desired = sharedChanges(affected, edit.update(affected));
      current = current.map(record => edit.sharedIds.has(record.id) ? { ...record, items: desired.filter(item => record.items.some(previous => sameLine(item, previous))) } : record);
    }
    for (const record of current) if (!record.items.length) canceledGuestIds.add(record.id);
    if (persist) persistGuestCancellations();
    return current.flatMap(record => record.items);
  }
  // Call under the shopping Web Lock, after reading the live persisted cart.
  // A durable claim must precede account publication, including quota fallback.
  // Already claimed IDs are spent: cached same-owner carts must not add twice.
  function claimLiveCartGuest(accountId: string, items: T[]): { items: T[]; complete: boolean } {
    const claimed: T[] = [];
    try {
      persistGuestCancellations();
      const records = storedGuestSelections(items);
      const desired = sharedGuestIntent(accountId, records);
      persistRecords(selectionKey, records);
      for (const record of records) {
        if (canceledGuestIds.has(record.id)) continue;
        if (localStorage.getItem(claimKey(record.id))) continue;
        localStorage.setItem(claimKey(record.id), accountId);
        claimed.push(...desired.filter(item => record.items.some(current => sameLine(item, current))));
      }
      return { items: claimed, complete: true };
    } catch { return { items: claimed, complete: false }; }
  }
  function currentGuestItems(items: T[]): T[] {
    const records = storedGuestSelections(items).filter(record => !canceledGuestIds.has(record.id) && !localStorage.getItem(claimKey(record.id)));
    guestSharedRecords = records;
    return merge(sharedGuestIntent(null, records, false), freshGuestItems());
  }
  // An empty fallback does not prove that the owner's durable bag was empty.
  // Replay accepted owner-local edits only after that unread baseline returns.
  // Once read, keep the resulting full snapshot if writing still fails.
  function restoreCartMemory(key: string): T[] {
    const prior = memory.get(key);
    if (!prior) return [];
    try {
      let items = prior.items;
      if (!prior.baselineKnown) {
        const current = decode(localStorage.getItem(key));
        items = prior.edits.reduce((current, edit) => edit(current), current.items);
        memory.set(key, { items, baselineKnown: true, edits: [] });
      }
      localStorage.setItem(key, encodeShopping(items));
      memory.delete(key); memoryOnly = false;
      return items;
    } catch {
      memoryOnly = true;
      return memory.get(key)?.items || prior.items;
    }
  }
  function rememberCartAddition(key: string, items: T[], picks: T[]) {
    const prior = memory.get(key);
    memory.set(key, {
      items, baselineKnown: prior?.baselineKnown ?? true,
      edits: prior && !prior.baselineKnown ? [...prior.edits, current => merge(current, picks)] : [],
    });
    memoryOnly = true;
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
      if (previous && accountId === null) startFreshGuest();
      memoryOnly = kind === 'cart' && memory.has(key);
      scope = key;
      publish({ ...initial, accountId });
      queue = queue.then(() => lock(() => {
        if (identity() !== accountId || scope !== key) return;
        if (kind === 'cart' && accountId && memory.has(key)) {
          let items = restoreCartMemory(key);
          let retained = false;
          if (accountId && (previous === null || guestAssignments.has(accountId))) {
            let shared: T[] = [];
            try {
              const claimed = claimLiveCartGuest(accountId, decode(localStorage.getItem(shoppingKey(kind, null))).items);
              shared = claimed.items; retained = !claimed.complete;
            } catch { retained = true; }
            const picks = merge(shared, eligibleGuestMemory(accountId));
            items = merge(items, picks);
            if (picks.length) { rememberCartAddition(key, items, picks); items = restoreCartMemory(key); }
            consumeLocalGuest(accountId, !retained);
            memory.delete(shoppingKey(kind, null));
            if (!retained) { guestAssignments.delete(accountId); guestMemory = []; guestSelections = []; }
          }
          publish({ items, status: 'ready', accountId, notice: retained ? 'Browser storage is unavailable. Some guest selections are retained for verification; retry when storage is available.' : memoryOnly ? 'Browser storage is unavailable. Your shopping items will last only for this visit.' : '' });
          return;
        }
        let migratedItems: T[] | undefined, accountItems: T[] | undefined, verifiedGuestItems: T[] | undefined;
        let verifiedGuest = false;
        try {
          persistGuestCancellations();
          localStorage.removeItem(`wishlyn-${kind}`);
          if (previous && accountId === null) localStorage.removeItem(shoppingKey(kind, null));
          let current = decode(localStorage.getItem(key));
          accountItems = current.items;
          if (accountId === null) {
            verifiedGuestItems = currentGuestItems(current.items);
            current = { ...current, items: verifiedGuestItems };
          }
          if (accountId && (previous === null || guestAssignments.has(accountId))) {
            const guestKey = shoppingKey(kind, null);
            const guest = decode(localStorage.getItem(guestKey));
            let picks: T[];
            if (kind === 'wishlist') {
              const stored = storedGuestSelections(guest.items);
              sharedGuestIntent(accountId, stored);
              persistRecords(selectionKey, stored);
              const live = new Set(stored.map(record => record.id));
              const local = new Set(localRecords(accountId).map(record => record.id));
              const accepted = new Set((pendingGuests.get(accountId) || []).map(record => record.id));
              const permitted = (record: GuestTransfer<T>) => {
                if (canceledGuestIds.has(record.id)) return false;
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
              consumeLocalGuest(accountId, true);
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
            consumeLocalGuest(accountId, verifiedGuest);
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
          let items = accountId ? migratedItems || merge(accountItems || [], eligibleGuestMemory(accountId)) : verifiedGuestItems || freshGuestItems();
          if (accountId && kind === 'wishlist') {
            const pending = combine(pendingGuests.get(accountId) || [], localRecords(accountId));
            pendingGuests.set(accountId, pending);
            items = migratedItems || merge(items, pending.flatMap(record => record.items));
          }
          if (kind === 'cart' && accountId) memory.set(key, {
            items, baselineKnown: accountItems !== undefined,
            edits: accountItems === undefined && items.length ? [current => merge(current, items)] : [],
          });
          const retained = !!accountId && !verifiedGuest && guestAssignments.has(accountId) && guestMemory.length > 0;
          if (accountId) {
            consumeLocalGuest(accountId, verifiedGuest);
            if (verifiedGuest) { guestMemory = []; guestSelections = []; guestAssignments.delete(accountId); }
          }
          publish({ items, status: 'ready', accountId, guestTransfers: accountId ? pendingGuests.get(accountId) : kind === 'wishlist' ? freshGuestRecords() : undefined, notice: retained ? 'Browser storage is unavailable. Some guest selections are retained for verification; retry when storage is available.' : 'Browser storage is unavailable. Your shopping items will last only for this visit.' });
        }
      })).catch(() => notify('Your saved shopping items could not be loaded. Please retry.'));
      return;
    }
    if (accountId === null) {
      queue = queue.then(() => lock(() => {
        if (identity() !== null || scope !== key) return;
        let items: T[] | undefined;
        try {
          const current = decode(localStorage.getItem(key));
          items = currentGuestItems(current.items);
          const records = guestRecords(items);
          publish({ ...snapshot, items, guestTransfers: kind === 'wishlist' ? records : undefined, status: 'ready' });
        } catch {
          memoryOnly = true;
          publish({ ...snapshot, items: items || freshGuestItems(), guestTransfers: kind === 'wishlist' ? freshGuestRecords() : undefined, notice: 'Browser storage is unavailable. Your shopping items will last only for this visit.', status: 'ready' });
        }
      })).catch(() => notify('Your guest selections could not be loaded. Please retry.'));
      return;
    }
    if (memoryOnly) return;
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
    window.addEventListener('storage', event => { if (event.key === scope || event.key === `${scope}-guest-transfers` || (scope === shoppingKey(kind, null) && (event.key === selectionKey || event.key?.startsWith(`${shoppingKey(kind, null)}-claim-`))) || event.key === null) load(); });
    void refreshAuthSession().catch(() => undefined);
    load();
  }
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    subscribe: (listener: () => void) => { listeners.add(listener); start(); return () => { listeners.delete(listener); }; },
    notify,
    retry: async () => { await refreshAuthSession(); const accountId = identity(); if (accountId === null || (accountId && (guestAssignments.has(accountId) || (kind === 'cart' && memory.has(shoppingKey(kind, accountId)))))) scope = null; load(); },
    // Integration code recovering a cached account cart must call this when
    // guest storage cannot be read. The shared guest snapshot is ineligible.
    getEligibleGuestRecovery: eligibleGuestMemory,
    consumeGuestRecovery: (expected: string) => { if (identity() === expected) consumeLocalGuest(expected, false); },
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
        let guestVerified = false;
        if (kind === 'cart' && expected && memory.has(key)) items = restoreCartMemory(key);
        if (expected === null) {
          try { items = currentGuestItems(decode(localStorage.getItem(key)).items); guestVerified = true; }
          catch { /* Visible cached intent can be removed, but only fresh local deltas may be published. */ }
        } else { try { if (!memoryOnly) items = decode(localStorage.getItem(key)).items; } catch { /* In-memory fallback. */ } }
        const next = update(items);
        const local = expected === null ? localChanges(items, next, guestLocalItems) : [];
        let notice = snapshot.notice;
        let storedRecords: GuestTransfer<T>[] = [];
        if (expected === null) {
          let prior = guestSelections;
          try { storedRecords = readRecords(selectionKey); prior = storedRecords.filter(record => record.items.some(item => items.some(current => sameSelection(item, current)))); } catch { /* In-memory keys remain stable when storage is blocked. */ }
          const previousLocal = guestLocalRecords;
          const nextLocal = local.map(item => ({ id: previousLocal.find(record => record.items.some(current => sameLine(item, current)))?.id || crypto.randomUUID(), items: [item] }));
          for (const record of combine(storedRecords, guestSelections)) if (record.items.some(item => items.some(current => sameLine(item, current))) && !record.items.some(item => next.some(current => sameLine(item, current)))) canceledGuestIds.add(record.id);
          for (const record of previousLocal) if (!record.items.some(item => local.some(current => sameLine(item, current)))) canceledGuestIds.add(record.id);
          guestLocalRecords = nextLocal;
          guestSelections = selectedGuestRecords(next, prior.filter(record => !canceledGuestIds.has(record.id)), nextLocal);
        }
        try {
          if (expected === null && !guestVerified) throw new Error('Guest ownership could not be verified.');
          if (expected === null) persistGuestCancellations();
          const prior = kind === 'cart' && expected ? memory.get(key) : undefined;
          if (prior && !prior.baselineKnown) {
            memory.set(key, { ...prior, items: next, edits: [...prior.edits, update] });
            throw new Error('The saved account bag has not been read.');
          }
          // Keep old claim metadata until the corresponding guest payload is
          // replaced. A quota failure cannot erase ownership of the old copy.
          if (expected === null) persistRecords(selectionKey, combine(storedRecords, guestSelections));
          const encoded = expected === null ? encodeGuest(next, guestSelections) : encodeShopping(next);
          const replaced = expected !== null || localStorage.getItem(key) !== encoded;
          if (replaced) localStorage.setItem(key, encoded);
          if (kind === 'cart' && expected) { memory.delete(key); memoryOnly = false; }
          if (expected === null && replaced) { try { persistRecords(selectionKey, guestSelections); } catch { /* Extra old records are harmless; only live payloads may claim unspent IDs. */ } }
          if (expected === null) { guestSharedRecords = guestSelections; guestLocalItems = []; guestLocalRecords = []; guestLocalOwner = null; guestEdits = []; }
        } catch {
          memoryOnly = true; notice = 'Browser storage is unavailable. Your shopping items will last only for this visit.';
          if (kind === 'cart' && expected && !memory.has(key)) memory.set(key, { items: next, baselineKnown: true, edits: [] });
          if (expected === null) {
            guestLocalItems = local; guestLocalOwner = null;
            guestEdits.push({ update, sharedIds: new Set(guestSharedRecords.map(record => record.id)) });
          }
        }
        publish({ ...snapshot, items: expected === null && !guestVerified ? local : next, accountId: expected, guestTransfers: expected === null && kind === 'wishlist' ? guestVerified ? guestSelections : freshGuestRecords() : snapshot.guestTransfers, status: 'ready', notice });
      })).catch(() => notify('Your shopping change could not be saved. Please retry.'));
      return queue;
    },
  };
}
export const cartStore = createStore<CartItem>('cart', decodeCart, (current, guest) => guest.reduce((items, line) => addCartLine(items, line), current), (before, after, local) => after.flatMap(item => {
  const quantity = Math.min(item.quantity, Math.max(0, (local.find(line => line.id === item.id)?.quantity || 0) + item.quantity - (before.find(line => line.id === item.id)?.quantity || 0)));
  return quantity ? [{ ...item, quantity }] : [];
}), (a, b) => a.id === b.id && a.quantity === b.quantity, (a, b) => a.id === b.id, (before, after) => after.flatMap(item => {
  const previous = before.find(current => current.id === item.id);
  return previous ? [{ ...item, quantity: Math.min(previous.quantity, item.quantity) }] : [];
}));
export const wishlistStore = createStore<string>('wishlist', decodeWishlist, (current, guest) => [...new Set([...current, ...guest])].slice(0, 50), (before, after, local) => after.filter(item => local.includes(item) || !before.includes(item)), (a, b) => a === b, (a, b) => a === b, (before, after) => after.filter(item => before.includes(item)));
