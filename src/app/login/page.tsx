'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { setAuthSession, refreshAuthSession } from '../../lib/authClient';
import styles from './login.module.css';
import { safeInternalRedirect } from '@/lib/safeRedirect';

function destination(): string {
  return safeInternalRedirect(new URLSearchParams(window.location.search).get('redirect'), window.location.origin);
}
export default function LoginPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void refreshAuthSession().then(user => { if (active && user) router.replace(destination()); }).catch(() => undefined);
    return () => { active = false; };
  }, [router]);
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setErrorMsg(null); setSuccessMsg(null);
    try {
      const response = await fetch(`/api/auth/${activeTab}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok || !data.user) throw new Error(data.error || 'Your account could not be verified. Please try again.');
      setAuthSession(data.user);
      setSuccessMsg(activeTab === 'login' ? 'Signed in. Opening your account…' : 'Account created. Opening your account…');
      router.replace(destination());
    } catch (error) { setErrorMsg(error instanceof Error ? error.message : 'Please try again.'); }
    finally { setLoading(false); }
  };
  return <><Header /><main id="main-content" className={styles.loginPage}><div className={styles.card}>
    <h1>{activeTab === 'login' ? 'Sign in' : 'Create an account'}</h1>
    <div className={styles.tabs} aria-label="Account access">
      {(['login', 'signup'] as const).map(tab => <button key={tab} type="button" aria-pressed={activeTab === tab} disabled={loading} onClick={() => { setActiveTab(tab); setErrorMsg(null); setSuccessMsg(null); }} className={`${styles.tab} ${activeTab === tab ? styles.activeTab : ''}`}>{tab === 'login' ? 'Sign In' : 'Register'}</button>)}
    </div>
    {errorMsg && <p id="auth-error" role="alert" className={styles.errorMsg}>{errorMsg}</p>}
    {successMsg && <p role="status" className={styles.successMsg}>{successMsg}</p>}
    <form onSubmit={handleSubmit} className={styles.form} aria-describedby={errorMsg ? 'auth-error' : undefined}>
      <div className={styles.field}><label htmlFor="auth-email" className={styles.label}>Email address</label><input id="auth-email" name="email" autoComplete="email" type="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} className={styles.input} /></div>
      <div className={styles.field}><label htmlFor="auth-password" className={styles.label}>Password</label><input id="auth-password" name="password" autoComplete={activeTab === 'login' ? 'current-password' : 'new-password'} type="password" required minLength={activeTab === 'signup' ? 8 : 1} maxLength={activeTab === 'signup' ? 72 : 1024} value={password} onChange={event => setPassword(event.target.value)} className={styles.input} aria-describedby={activeTab === 'signup' ? 'password-help' : undefined} />{activeTab === 'signup' && <p id="password-help">Use at least 8 characters. Longer passphrases are welcome.</p>}</div>
      <button type="submit" disabled={loading} className={styles.submitBtn}>{loading ? 'Please wait…' : activeTab === 'login' ? 'Sign in' : 'Create account'}</button>
    </form>
  </div></main><Footer /></>;
}
