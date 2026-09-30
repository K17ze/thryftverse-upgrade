'use client';

import Link from 'next/link';
import { Icon, type AppIconName } from '@/components/ui/Icon';

export const QUICK_ACTIONS: { href: string; icon: AppIconName; label: string }[] = [
  { href: '/sell', icon: 'plus', label: 'List an item' },
  { href: '/seller-hub/import', icon: 'download', label: 'Import catalog' },
  { href: '/seller-hub/listings', icon: 'inventory', label: 'My listings' },
  { href: '/seller-hub/quick-replies', icon: 'zap', label: 'Quick replies' },
  { href: '/wallet', icon: 'wallet', label: 'Wallet' },
  { href: '/orders', icon: 'box', label: 'Orders' },
  { href: '/live', icon: 'videocam', label: 'Go live' },
];

export function SellerQuickActionsRail({ className = '' }: { className?: string }) {
  return (
    <nav
      aria-label="Seller actions"
      className={`no-scrollbar -mx-4 mt-10 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 ${className}`}
    >
      {QUICK_ACTIONS.map((a) => (
        <Link
          key={a.label}
          href={a.href}
          className="pressable inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-surface-alt px-4 text-body font-semibold text-text-primary hover:bg-surface-raised"
        >
          <Icon name={a.icon} size={16} />
          {a.label}
        </Link>
      ))}
    </nav>
  );
}
