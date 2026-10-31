import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { apiError } from '@/lib/api';
export async function GET(request: Request) {
  try { return NextResponse.json({ user: await requireSession(request) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return apiError(error); }
}
