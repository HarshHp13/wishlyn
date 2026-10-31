import Link from 'next/link';
import { ArrowUpRight, Gem, LifeBuoy, Package, UserRound } from 'lucide-react';
import styles from './MerchantNav.module.css';

const destinations = [
  { id: 'catalogue', href: '/admin', label: 'Catalogue', icon: Gem },
  { id: 'orders', href: '/admin/orders', label: 'Orders', icon: Package },
  { id: 'support', href: '/admin/support', label: 'Support requests', icon: LifeBuoy },
] as const;

export default function MerchantNav({ active }: { active: typeof destinations[number]['id'] }) {
  return (
    <nav className={styles.navigation} aria-label="Merchant navigation">
      <div className={styles.sections}>
        {destinations.map(({ id, href, label, icon: Icon }) => (
          <Link className={styles.link} key={id} href={href} aria-current={active === id ? 'page' : undefined}>
            <Icon size={17} strokeWidth={1.5} aria-hidden="true" />
            {label}
          </Link>
        ))}
      </div>
      <div className={styles.destinations}>
        <Link className={styles.link} href="/profile"><UserRound size={16} strokeWidth={1.5} aria-hidden="true" />My account</Link>
        <Link className={styles.link} href="/">Storefront<ArrowUpRight size={16} strokeWidth={1.5} aria-hidden="true" /></Link>
      </div>
    </nav>
  );
}
