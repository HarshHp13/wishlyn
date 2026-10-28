'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { getAuthUser, getAuthToken, setAuthSession, clearAuthSession, AuthUser } from '../../lib/authClient';
import styles from './profile.module.css';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const storedUser = getAuthUser();
    const token = getAuthToken();

    if (storedUser) {
      setUser(storedUser);
      setLoading(false);
      return;
    }

    if (token) {
      (async () => {
        try {
          const res = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${token}` }
          });
          const data = await res.json();
          if (res.ok && data.user) {
            setUser(data.user);
            setAuthSession(token, data.user);
          } else {
            router.push('/login?redirect=/profile');
          }
        } catch (e) {
          router.push('/login?redirect=/profile');
        } finally {
          setLoading(false);
        }
      })();
    } else {
      router.push('/login?redirect=/profile');
    }
  }, [router]);

  const handleSignOut = () => {
    clearAuthSession();
    router.push('/login');
  };

  if (loading) {
    return (
      <>
        <Header />
        <main id="main-content" className={styles.profilePage}>
          <div className="container" style={{ textAlign: 'center', padding: '100px 0' }}>
            <p style={{ color: 'var(--text-secondary)' }}>Loading your profile details...</p>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (!user) return null;

  const initial = user.email.charAt(0).toUpperCase();

  return (
    <>
      <Header />
      <main id="main-content" className={styles.profilePage}>
        <div className="container">
          <div className={styles.profileCard}>
            <div className={styles.headerRow}>
              <div className={styles.avatarBadge}>{initial}</div>
              <div className={styles.userInfo}>
                <h1>My Account</h1>
                <span className={styles.roleBadge}>{user.role} Account</span>
              </div>
            </div>

            <h2 className={styles.sectionTitle}>Profile Details</h2>
            <div className={styles.detailGrid}>
              <div className={styles.detailItem}>
                <div className={styles.detailLabel}>Email Address</div>
                <div className={styles.detailValue}>{user.email}</div>
              </div>
              <div className={styles.detailItem}>
                <div className={styles.detailLabel}>Account Role</div>
                <div className={styles.detailValue} style={{ textTransform: 'capitalize' }}>
                  {user.role}
                </div>
              </div>
              <div className={styles.detailItem}>
                <div className={styles.detailLabel}>Member Status</div>
                <div className={styles.detailValue}>Wishlyn Privilege Member</div>
              </div>
            </div>

            <div className={styles.actionRow}>
              <Link href="/" className={styles.btnPrimary}>
                Continue Shopping
              </Link>
              {user.role === 'admin' && (
                <Link href="/admin" className={styles.btnSecondary}>
                  Admin Dashboard
                </Link>
              )}
              <button onClick={handleSignOut} className={styles.btnDanger}>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
