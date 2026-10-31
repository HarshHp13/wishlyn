'use client';
import { useEffect } from 'react';
import { refreshAuthSession } from '@/lib/authClient';
export default function AuthBootstrap() {
  useEffect(() => { void refreshAuthSession().catch(() => undefined); }, []);
  return null;
}
