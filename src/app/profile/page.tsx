'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { refreshAuthSession, clearAuthSession, getAuthState, getServerAuthState, subscribeAuth } from '../../lib/authClient';
import styles from './profile.module.css';

export default function ProfilePage() {
  const router = useRouter();
  const auth = useSyncExternalStore(subscribeAuth, getAuthState, getServerAuthState);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void refreshAuthSession().catch(() => undefined); }, []);
  useEffect(() => { if (auth.status === 'guest') router.replace('/login?redirect=/profile'); }, [auth.status, router]);
  const signOut = async () => {
    setError(null);
    try { await clearAuthSession(); router.replace('/login'); }
    catch { setError('Sign out could not be confirmed. Please retry.'); }
  };
  return <><Header /><main id="main-content" className={styles.profilePage}><div className="container"><div className={styles.profileCard}>
    <h1>My account</h1>
    {auth.status === 'loading' && <p role="status">Loading your account…</p>}
    {(auth.status === 'error' || error) && <><p role="alert">{error || 'Your account could not be loaded. Please retry.'}</p><button onClick={() => { void refreshAuthSession(true).catch(() => undefined); }}>Retry</button>{error && <button onClick={signOut}>Retry sign out</button>}</>}
    {auth.user && <><div className={styles.detailItem}><div className={styles.detailLabel}>Email address</div><div className={styles.detailValue}>{auth.user.email}</div></div><div className={styles.actionRow}>
      <Link href="/" className={styles.btnPrimary}>Continue shopping</Link>
      {auth.user.role === 'admin' && <Link href="/admin" className={styles.btnSecondary}>Admin dashboard</Link>}
      <button onClick={signOut} className={styles.btnDanger}>Sign out</button>
    </div></>}
  </div></div></main><Footer /></>;
}
