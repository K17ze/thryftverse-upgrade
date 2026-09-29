'use client';

/**
 * Asset overflow — the secondary actions that don't belong in the trade
 * path: sharing the market, the public tape, buyout offers and the
 * report-an-issue flow. One 'more' glyph in the market header opens a
 * small sheet of rows — every row does something real.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { useShare } from '@/components/profile/useShare';
import type { CoOwnAsset } from '@/lib/contracts/coown';

type MenuItem = {
  icon: AppIconName;
  label: string;
  hint: string;
} & ({ href: string } | { onSelect: () => void });

export function AssetActionsMenu({ asset }: { asset: CoOwnAsset }) {
  const [open, setOpen] = useState(false);
  const share = useShare();

  const items: MenuItem[] = [
    {
      onSelect: () =>
        void share({
          url:
            typeof window !== 'undefined'
              ? `${window.location.origin}/co-own/${asset.id}`
              : `/co-own/${asset.id}`,
          title: `${asset.title} on ThryftVerse`,
          copiedLabel: 'Market link copied',
        }),
      icon: 'share',
      label: 'Share market',
      hint: 'Send the link, or copy it to your clipboard',
    },
    {
      href: '/co-own/orders',
      icon: 'receipt',
      label: 'Order history',
      hint: 'Your orders on this and every Co-Own market',
    },
    {
      href: '/co-own/ledger',
      icon: 'trending',
      label: 'Market tape',
      hint: 'The public tape of settled Co-Own trades',
    },
    {
      href: `/co-own/${asset.id}/buyout`,
      icon: 'offer',
      label: 'Make a buyout offer',
      hint: 'Offer to acquire the remaining units from current holders',
    },
    {
      href: `/co-own/${asset.id}/issue`,
      icon: 'flag',
      label: 'Report an issue',
      hint: 'Flag a dispute, technical problem or fraud',
    },
  ];

  const rowClass =
    'pressable flex w-full items-center gap-3.5 rounded-lg px-3 py-3 text-left transition-colors hover:bg-row';

  return (
    <>
      <IconButton
        name="more"
        size={20}
        onClick={() => setOpen(true)}
        aria-label="More actions"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="-mr-2"
      />
      <Sheet open={open} onClose={() => setOpen(false)} title={asset.title} maxWidth={420}>
        <ul className="p-2">
          {items.map((item) => (
            <li key={item.label}>
              {'href' in item ? (
                <Link href={item.href} onClick={() => setOpen(false)} className={rowClass}>
                  <Icon name={item.icon} size={20} className="shrink-0 text-text-secondary" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-semibold text-text-primary">
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-meta text-text-muted">{item.hint}</span>
                  </span>
                  <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                  className={rowClass}
                >
                  <Icon name={item.icon} size={20} className="shrink-0 text-text-secondary" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-semibold text-text-primary">
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-meta text-text-muted">{item.hint}</span>
                  </span>
                  <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
