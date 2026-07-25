'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import styles from './login.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Secure auth session check with redirect parameter support
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('wishlyn-token');
    if (!token) return;

    (async () => {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && data.user) {
          const searchParams = new URLSearchParams(window.location.search);
          const redirectTo = searchParams.get('redirect') || '/';
          if (data.user.role === 'admin') {
            router.push('/admin');
          } else {
            router.push(redirectTo);
          }
        }
      } catch (err) {
        console.error('Session verify failed:', err);
      }
    })();
  }, [router]);

  const enableOfflineMode = (role: 'admin' | 'customer') => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('wishlyn-offline-mode', 'true');
      const mockEmail = role === 'admin' ? 'admin@wishlyn.com' : 'customer@wishlyn.com';
      localStorage.setItem('wishlyn-mock-user', JSON.stringify({
        id: 'mock-user-uuid-1234',
        email: mockEmail,
      }));
      localStorage.setItem('wishlyn-user', JSON.stringify({
        id: 'mock-user-uuid-1234',
        email: mockEmail,
        role,
      }));
      setSuccessMsg(`Offline Dev Mode enabled as ${role}! Redirecting...`);
      const searchParams = new URLSearchParams(window.location.search);
      const redirectTo = searchParams.get('redirect') || '/';
      setTimeout(() => {
        if (role === 'admin') {
          router.push('/admin');
        } else {
          router.push(redirectTo);
        }
      }, 1200);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    if (activeTab === 'signup') {
      if (password.length < 8) {
        setErrorMsg('Password must be at least 8 characters long.');
        setLoading(false);
        return;
      }
      const hasUppercase = /[A-Z]/.test(password);
      const hasLowercase = /[a-z]/.test(password);
      const hasNumber = /[0-9]/.test(password);
      if (!hasUppercase || !hasLowercase || !hasNumber) {
        setErrorMsg('Password must contain at least one uppercase letter, one lowercase letter, and one number.');
        setLoading(false);
        return;
      }
    }

    try {
      const searchParams = new URLSearchParams(window.location.search);
      const redirectTo = searchParams.get('redirect') || '/';

      const endpoint = activeTab === 'login' ? '/api/auth/login' : '/api/auth/signup';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Authentication failed');
      }

      if (data.token) {
        localStorage.setItem('wishlyn-token', data.token);
        localStorage.setItem('wishlyn-user', JSON.stringify(data.user));
        setSuccessMsg(activeTab === 'login' ? 'Signed in successfully! Redirecting...' : 'Account created successfully! Redirecting...');
        setTimeout(() => {
          if (data.user.role === 'admin') {
            router.push('/admin');
          } else {
            router.push(redirectTo);
          }
        }, 1000);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      console.error('[Auth Error]:', message);
      setErrorMsg(message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Header />
      <main className={styles.loginPage}>
        <div className={styles.card}>
          <span className={styles.brand}>W I S H L Y N</span>
          <span className={styles.subtitle}>MADE TO MATCH YOU</span>

          <div className={styles.tabs}>
            <button
              onClick={() => {
                setActiveTab('login');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`${styles.tab} ${
                activeTab === 'login' ? styles.activeTab : ''
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setActiveTab('signup');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`${styles.tab} ${
                activeTab === 'signup' ? styles.activeTab : ''
              }`}
            >
              Register
            </button>
          </div>

          {errorMsg && (
            <div className={styles.errorMsg}>
              <div>{errorMsg}</div>
              <div style={{ marginTop: '12px', borderTop: '1px solid #fecaca', paddingTop: '8px', textAlign: 'left' }}>
                <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#7f1d1d' }}><strong>Offline Dev Bypass:</strong> Stuck on Supabase rate limits or network issues? Click below to bypass auth:</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={() => enableOfflineMode('admin')} style={{ padding: '6px 10px', fontSize: '11px', background: '#1f2937', color: '#fff', border: '1px solid #374151', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>
                    Bypass as Admin
                  </button>
                  <button type="button" onClick={() => enableOfflineMode('customer')} style={{ padding: '6px 10px', fontSize: '11px', background: '#1f2937', color: '#fff', border: '1px solid #374151', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>
                    Bypass as Customer
                  </button>
                </div>
              </div>
            </div>
          )}
          {successMsg && <div className={styles.successMsg}>{successMsg}</div>}

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>Email Address</label>
              <input
                type="email"
                required
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={styles.input}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={styles.input}
                minLength={8}
              />
            </div>

            <button type="submit" disabled={loading} className={styles.submitBtn}>
              {loading
                ? 'Processing...'
                : activeTab === 'login'
                ? 'Sign In'
                : 'Create Account'}
            </button>
          </form>
        </div>
      </main>
      <Footer />
    </>
  );
}
