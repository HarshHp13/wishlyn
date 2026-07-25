import { NextResponse } from 'next/server';
import { dbGetProfileByEmail, dbCreateProfile } from '@/lib/neon';
import { hashPassword, signToken } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email address is required' }, { status: 400 });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long' }, { status: 400 });
    }

    const existingUser = await dbGetProfileByEmail(email);
    if (existingUser) {
      return NextResponse.json({ error: 'An account with this email address already exists' }, { status: 409 });
    }

    const password_hash = await hashPassword(password);
    const userId = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const role = email.toLowerCase().includes('admin') ? 'admin' : 'customer';

    const newUser = await dbCreateProfile({
      id: userId,
      email,
      password_hash,
      role,
    });

    if (!newUser) {
      return NextResponse.json({ error: 'Failed to create user account' }, { status: 500 });
    }

    const token = signToken({
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
    });

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Signup API Route Error]:', message);
    return NextResponse.json({ error: 'An internal server error occurred during signup' }, { status: 500 });
  }
}
