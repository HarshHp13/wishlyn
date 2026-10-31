'use client';

import { getAuthState, subscribeAuth } from '../authClient';

export class CommerceRequestError extends Error {
  constructor(message: string, public status: number, public fields?: Record<string, string>) { super(message); }
}
export function assertCurrentAccount(intendedAccountId: string): void {
  const auth = getAuthState();
  if (auth.status !== 'authenticated' || auth.user?.id !== intendedAccountId) throw new CommerceRequestError('Your account changed. Verify your account before continuing.', 409);
}
export function assertPurchaseOwner(order: { ownerId: string }, intendedAccountId: string): void {
  if (order.ownerId !== intendedAccountId) throw new CommerceRequestError('This purchase could not be verified for your account. Please reload.', 409);
}
export async function commerceRequest<T>(url: string, intendedAccountId: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  assertCurrentAccount(intendedAccountId);
  let invalidated = false;
  const unsubscribe = subscribeAuth(() => {
    const auth = getAuthState();
    if (auth.status === 'guest' || (auth.status === 'authenticated' && auth.user?.id !== intendedAccountId)) invalidated = true;
  });
  try {
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'X-Wishlyn-Account-ID': intendedAccountId, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store', credentials: 'same-origin', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000),
    });
    const data = await response.json();
    if (!response.ok) throw new CommerceRequestError(typeof data?.error === 'string' ? data.error : 'This request could not be completed. Please retry.', response.status, data?.fields);
    if (invalidated) throw new CommerceRequestError('Your account changed. Verify your account before continuing.', 409);
    assertCurrentAccount(intendedAccountId);
    if (data?.viewerId !== intendedAccountId) throw new CommerceRequestError('This response could not be verified for your account. Please reload.', 409);
    return data as T;
  } finally { unsubscribe(); }
}
