'use client';

/**
 * Asset overflow — the secondary actions that don't belong in the trade
 * path: buyout offers and the report-an-issue flow. One 'more' glyph in
 * the market header opens a small sheet of link rows.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import type { CoOwnAsset } from '@/lib/contracts/coown';

export function AssetActionsMenu({ asset }: { asset: CoOwnAsset }) {
  const [open, setOpen] = useState(false);

  const items: { href: string; icon: AppIconName; label: string; hint: string }[] = [
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
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                className="pressable flex items-center gap-3.5 rounded-lg px-3 py-3 transition-colors hover:bg-row"
              >
                <Icon name={item.icon} size={20} className="shrink-0 text-text-secondary" />
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-semibold text-text-primary">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-meta text-text-muted">{item.hint}</span>
                </span>
                <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
