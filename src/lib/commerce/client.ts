'use client';

export class CommerceRequestError extends Error {
  constructor(message: string, public status: number, public fields?: Record<string, string>) { super(message); }
}
export async function commerceRequest<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store', credentials: 'same-origin', signal: signal || AbortSignal.timeout(25_000),
  });
  const data = await response.json();
  if (!response.ok) throw new CommerceRequestError(typeof data?.error === 'string' ? data.error : 'This request could not be completed. Please retry.', response.status, data?.fields);
  return data as T;
}
