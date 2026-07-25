'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('[Root Error Boundary]:', error);
  }, [error]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--alabaster)',
      fontFamily: 'var(--font-sans)',
      padding: '24px',
      textAlign: 'center'
    }}>
      <span style={{
        fontSize: '48px',
        marginBottom: '24px'
      }}>
        ✨
      </span>
      <h1 style={{
        fontSize: '28px',
        fontWeight: 'normal',
        fontFamily: 'var(--font-serif)',
        color: 'var(--charcoal)',
        marginBottom: '16px'
      }}>
        Something went wrong
      </h1>
      <p style={{
        color: 'var(--muted-text)',
        fontSize: '15px',
        maxWidth: '480px',
        lineHeight: '1.6',
        marginBottom: '32px'
      }}>
        We encountered an error processing your request. Please try again or navigate back to the main collections.
      </p>
      <div style={{
        display: 'flex',
        gap: '16px'
      }}>
        <button
          onClick={() => reset()}
          style={{
            padding: '12px 24px',
            backgroundColor: 'var(--charcoal)',
            color: 'var(--pure-white)',
            fontSize: '14px',
            fontWeight: '600',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer'
          }}
        >
          Try Again
        </button>
        <Link
          href="/"
          style={{
            padding: '12px 24px',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            fontSize: '14px',
            fontWeight: '500',
            borderRadius: 'var(--radius-md)',
            display: 'inline-block'
          }}
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
