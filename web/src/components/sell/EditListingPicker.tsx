'use client';

/**
 * EditListingPicker — the quiet entry point into the edit flow. One muted
 * disclosure line under the header; expanding lists the seller's active
 * listings, each row linking to /sell?edit=<id>.
 */

import { useState } from 'react';
import Link from 'next/link';
import type { Listing } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';
import { getListingCoverUri } from '@/lib/utils/media';

interface EditListingPickerProps {
  listings: Listing[];
}

export function EditListingPicker({ listings }: EditListingPickerProps) {
  const [open, setOpen] = useState(false);
  if (!listings.length) return null;

  return (
    <div className="pb-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="pressable flex items-center gap-1.5 text-caption text-text-muted transition-colors hover:text-text-secondary"
      >
        <Icon name="edit" size={13} />
        <span>Editing something you&apos;ve already listed?</span>
        <Icon
          name="chevronDown"
          size={12}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <ul className="mt-3 divide-y divide-border-subtle border-t border-b border-border-subtle">
          {listings.map((listing) => (
            <li key={listing.id}>
              <Link
                href={`/sell?edit=${listing.id}`}
                className="pressable group flex items-center gap-3 py-2"
              >
                <AppImage
                  src={getListingCoverUri(listing.images)}
                  alt=""
                  width={36}
                  height={45}
                  sizes="36px"
                  className="h-[45px] w-9 shrink-0 rounded-md"
                />
                <span className="min-w-0 flex-1">
                  <span className="clamp-1 block text-body text-text-primary">
                    {listing.title}
                  </span>
                  <span className="tnum block text-caption text-text-muted">
                    {formatPrice(listing.price)}
                  </span>
                </span>
                <span className="flex items-center gap-1 text-caption font-medium text-text-secondary transition-colors group-hover:text-text-primary">
                  Edit
                  <Icon name="forward" size={12} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
