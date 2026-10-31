import { NextResponse } from 'next/server';
import { revokeSession, clearSessionCookie } from '@/lib/session';
import { assertSameOrigin, apiError } from '@/lib/api';
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await revokeSession(request);
    const response = NextResponse.json({ success: true });
    clearSessionCookie(response);
    return response;
  } catch (error) { return apiError(error); }
}
