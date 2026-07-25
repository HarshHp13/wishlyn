import { NextResponse } from 'next/server';
import { dbInsertSubscriber, sql } from '@/lib/neon';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Please provide a valid email address' }, { status: 400 });
    }

    if (sql) {
      await dbInsertSubscriber(email);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Newsletter API Error]:', message);
    return NextResponse.json({ error: 'Failed to process subscription' }, { status: 500 });
  }
}
