'use client';

import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { SettingsRow } from './SettingsRow';
import { formatPrice } from '@/lib/utils/format';
import type { User } from '@/lib/contracts/domain';
import type { WalletData } from '@/components/wallet/useWalletData';

interface SettingsIdentityRowProps {
  user: User | null;
  isGuest: boolean;
  wallet?: WalletData;
  onSignIn: () => void;
}

/**
 * Identity & liquidity overview at settings top:
 * Mirrors the native mobile header with avatar, profile link, and live balance.
 * Guests get a sign-in prompt instead of a fake profile.
 */
export function SettingsIdentityRow({
  user,
  isGuest,
  wallet,
  onSignIn,
}: SettingsIdentityRowProps) {
  if (isGuest || !user) {
    return (
      <div className="mb-8 border-y border-border-subtle">
        <SettingsRow
          icon="profile"
          label="Sign in to ThryftVerse"
          subtitle="Sync your wardrobe, bag and orders"
          onClick={onSignIn}
        />
      </div>
    );
  }

  return (
    <div className="mb-8">
      <Link
        href="/profile"
        className="pressable flex min-h-[64px] w-full items-center gap-3 border-y border-border-subtle px-4 py-3 sm:px-5"
      >
        <Avatar src={user.avatar} name={user.username} size={44} />
        <span className="min-w-0 flex-1">
          <span className="clamp-1 block text-body-emphasis font-semibold text-text-primary">
            {user.username}
          </span>
          <span className="clamp-1 mt-0.5 block text-caption text-text-muted">
            View profile
          </span>
        </span>
        <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
      </Link>
      <SettingsRow
        icon="wallet"
        label="Thryft balance"
        subtitle="Available to spend"
        value={wallet ? formatPrice(wallet.available, wallet.currency) : undefined}
        href="/wallet"
      />
    </div>
  );
}
