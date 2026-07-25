import React from 'react';
import Link from 'next/link';
import Header from '../components/Header';
import Footer from '../components/Footer';

export default function NotFound() {
  return (
    <>
      <Header />
      <main style={{
        minHeight: '75vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '40px 24px',
        backgroundColor: 'var(--alabaster)'
      }}>
        <span style={{
          fontSize: '64px',
          color: 'var(--rose-gold-dark)',
          marginBottom: '24px'
        }}>
          💎
        </span>
        <h1 style={{
          fontSize: '36px',
          fontWeight: 400,
          fontFamily: 'var(--font-serif)',
          color: 'var(--charcoal)',
          marginBottom: '16px'
        }}>
          Piece Not Found
        </h1>
        <p style={{
          fontSize: '16px',
          color: 'var(--muted-text)',
          maxWidth: '440px',
          lineHeight: '1.6',
          marginBottom: '32px'
        }}>
          The requested page or jewellery collection could not be found. Explore our hand-crafted sterling silver, gold, and fine diamonds.
        </p>
        <Link
          href="/"
          style={{
            padding: '14px 32px',
            backgroundColor: 'var(--charcoal)',
            color: 'var(--pure-white)',
            fontSize: '14px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            borderRadius: 'var(--radius-md)',
            display: 'inline-block'
          }}
        >
          Explore Collections
        </Link>
      </main>
      <Footer />
    </>
  );
}
