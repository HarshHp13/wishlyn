'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { commerceRequest } from '@/lib/commerce/client';
import { getAuthState } from '@/lib/authClient';
import { validateShipping } from '@/lib/commerce/validation';
import type { ShippingAddress } from '@/lib/commerce/types';
import styles from '@/app/checkout/checkout.module.css';

interface SavedAddress extends ShippingAddress { id: string; version: number; label: string }
export default function SavedAddresses({ ownerId, onSelect }: { ownerId: string; onSelect: (address: ShippingAddress) => void }) {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    commerceRequest<{ ownerId: string; addresses: SavedAddress[] }>('/api/account/addresses', ownerId, undefined, controller.signal)
      .then(data => {
        const auth = getAuthState();
        if (controller.signal.aborted || auth.status !== 'authenticated' || auth.user?.id !== ownerId) return;
        if (data.ownerId !== ownerId || !Array.isArray(data.addresses) || data.addresses.length > 20) throw new Error('Invalid address list');
        for (const address of data.addresses) {
          validateShipping(address);
          if (typeof address.id !== 'string' || typeof address.label !== 'string' || !Number.isSafeInteger(address.version)) throw new Error('Invalid saved address');
        }
        setAddresses(data.addresses); setLoading(false); setError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) { setAddresses([]); setLoading(false); setError(true); }
      });
    return () => controller.abort();
  }, [ownerId, retry]);
  return <fieldset className={styles.savedAddressesSection}><legend className={styles.savedAddressTitle}>Saved delivery addresses</legend>
    {loading ? <p role="status">Loading saved addresses…</p> : error ? <><p role="status">Saved addresses could not be loaded. You can enter delivery details below.</p><button type="button" onClick={() => { setLoading(true); setRetry(value => value + 1); }}>Retry saved addresses</button></> : addresses.length ? <>
      <label className={styles.label} htmlFor="saved-address">Choose an address</label><select id="saved-address" className={styles.input} value={selected} onChange={event => {
        const auth = getAuthState();
        if (auth.status !== 'authenticated' || auth.user?.id !== ownerId) return;
        setSelected(event.target.value);
        const address = addresses.find(item => item.id === event.target.value);
        if (address) onSelect(validateShipping(address));
      }}><option value="">Enter delivery details below</option>{addresses.map(address => <option key={address.id} value={address.id}>{address.label} · {address.city} {address.zipCode}</option>)}</select>
    </> : <p>No saved addresses yet. Enter delivery details below.</p>}
    <p className={styles.note}><Link href="/profile">Manage saved addresses</Link>. Review the selected details before creating your order.</p>
  </fieldset>;
}
