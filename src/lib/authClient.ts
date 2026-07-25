'use client';

export interface AuthUser {
  id: string;
  email: string;
  role: 'admin' | 'customer';
  firstName?: string;
  lastName?: string;
}

const TOKEN_KEY = 'wishlyn-token';
const USER_KEY = 'wishlyn-user';

export function setAuthSession(token: string, user: AuthUser) {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));

    // Also persist token in browser cookie (30 days)
    const maxAge = 30 * 24 * 60 * 60; // 30 days in seconds
    document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; SameSite=Lax`;
    document.cookie = `${USER_KEY}=${encodeURIComponent(JSON.stringify(user))}; path=/; max-age=${maxAge}; SameSite=Lax`;

    // Dispatch global event for instant UI sync across all tabs/components
    window.dispatchEvent(new CustomEvent('wishlyn-auth-change', { detail: { user, token } }));
  } catch (err) {
    console.error('[AuthClient] Error storing auth session:', err);
  }
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const fromStorage = localStorage.getItem(TOKEN_KEY);
    if (fromStorage) return fromStorage;

    // Cookie fallback
    const match = document.cookie.match(new RegExp('(^| )' + TOKEN_KEY + '=([^;]+)'));
    if (match) return decodeURIComponent(match[2]);
  } catch (err) {
    console.error('[AuthClient] Error reading auth token:', err);
  }

  return null;
}

export function getAuthUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;

  try {
    const fromStorage = localStorage.getItem(USER_KEY);
    if (fromStorage) return JSON.parse(fromStorage);

    // Cookie fallback
    const match = document.cookie.match(new RegExp('(^| )' + USER_KEY + '=([^;]+)'));
    if (match) return JSON.parse(decodeURIComponent(match[2]));
  } catch (err) {
    console.error('[AuthClient] Error reading auth user:', err);
  }

  return null;
}

export function clearAuthSession() {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);

    // Clear cookies
    document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
    document.cookie = `${USER_KEY}=; path=/; max-age=0`;

    // Dispatch global event
    window.dispatchEvent(new CustomEvent('wishlyn-auth-change', { detail: { user: null, token: null } }));
  } catch (err) {
    console.error('[AuthClient] Error clearing auth session:', err);
  }
}
