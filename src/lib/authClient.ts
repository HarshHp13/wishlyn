'use client';

export interface AuthUser { id: string; email: string; role: 'admin' | 'customer'; firstName?: string; lastName?: string }
export interface AuthState { status: 'loading' | 'authenticated' | 'guest' | 'error'; user: AuthUser | null; error?: string }
const SERVER_STATE: AuthState = { status: 'loading', user: null };
let state: AuthState = SERVER_STATE;
let generation = 0;
let pending: Promise<AuthUser | null> | undefined;
let initialized = false;
let intent = 0;
let logoutOperation: { intent: number; task: Promise<void> } | undefined;
const listeners = new Set<() => void>();
const INVALIDATION_KEY = 'wishlyn-auth-invalidation';

function publish(next: AuthState): void {
  state = next;
  listeners.forEach(listener => listener());
  window.dispatchEvent(new CustomEvent('wishlyn-auth-change', { detail: { user: next.user, status: next.status } }));
}
function initialize(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  try { localStorage.removeItem('wishlyn-token'); localStorage.removeItem('wishlyn-user'); } catch { /* Storage is optional. */ }
  for (const key of ['wishlyn-token', 'wishlyn-user']) document.cookie = `${key}=; path=/; max-age=0; SameSite=Lax`;
  window.addEventListener('storage', event => {
    if (event.key === INVALIDATION_KEY) void refreshAuthSession(true).catch(() => undefined);
  });
  window.addEventListener('focus', () => { void refreshAuthSession(true).catch(() => undefined); });
}
function broadcast(): void {
  try { localStorage.setItem(INVALIDATION_KEY, `${Date.now()}:${Math.random()}`); } catch { /* Cookies still work without storage. */ }
}
export function getAuthState(): AuthState { return typeof window === 'undefined' ? SERVER_STATE : state; }
export function getServerAuthState(): AuthState { return SERVER_STATE; }
export function getAuthUser(): AuthUser | null { return getAuthState().user; }
export function subscribeAuth(listener: () => void): () => void {
  initialize(); listeners.add(listener); return () => { listeners.delete(listener); };
}
function isUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false;
  const user = value as Partial<AuthUser>;
  return typeof user.id === 'string' && typeof user.email === 'string' && (user.role === 'customer' || user.role === 'admin');
}
export function setAuthSession(user: AuthUser): void {
  if (!isUser(user)) throw new Error('The server returned an invalid account.');
  initialize(); intent++; generation++; pending = undefined;
  publish({ status: 'authenticated', user }); broadcast();
}
export function refreshAuthSession(force = false): Promise<AuthUser | null> {
  initialize();
  // Background verification cannot race a pending logout. A newer explicit
  // sign-in has its own intent and is not overwritten by the older logout.
  if (logoutOperation) {
    const operation = logoutOperation;
    return operation.task.then(() => state.user, error => {
      if (operation.intent !== intent) return state.user;
      throw error;
    });
  }
  if (pending && !force) return pending;
  const current = ++generation;
  publish({ status: 'loading', user: null });
  const task = (async () => {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (response.status === 401) {
        if (current !== generation) return state.user;
        publish({ status: 'guest', user: null });
        return null;
      }
      const data = await response.json();
      if (!response.ok || !isUser(data.user)) throw new Error('Your account could not be loaded. Please try again.');
      if (current !== generation) return state.user;
      publish({ status: 'authenticated', user: data.user }); return data.user as AuthUser;
    } catch (error) {
      if (current !== generation) return state.user;
      const message = error instanceof Error ? error.message : 'Your account could not be loaded.';
      publish({ status: 'error', user: null, error: message }); throw new Error(message);
    } finally { if (current === generation) pending = undefined; }
  })();
  pending = task;
  return task;
}
export const refreshAuthUser = refreshAuthSession;
export function clearAuthSession(): Promise<void> {
  initialize();
  if (logoutOperation?.intent === intent) return logoutOperation.task;
  const operation = { intent: ++intent, task: Promise.resolve() };
  logoutOperation = operation;
  generation++; pending = undefined;
  operation.task = Promise.resolve().then(async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Sign out could not be confirmed. Please retry.');
      if (operation.intent === intent) {
        generation++; pending = undefined;
        publish({ status: 'guest', user: null });
      }
      broadcast();
    } catch (error) {
      if (operation.intent === intent) {
        generation++; pending = undefined;
        publish({ status: 'error', user: null, error: 'Sign out could not be confirmed. Please retry.' });
      }
      throw error;
    } finally { if (logoutOperation === operation) logoutOperation = undefined; }
  });
  publish({ status: 'loading', user: null });
  return operation.task;
}
