'use client';

/**
 * SellerNote — owner disclosure on active auction room (sellers can't bid on own lot).
 */

import Link from 'next/link';

export function SellerNote() {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border-subtle bg-surface-alt p-4">
      <p className="text-body-emphasis font-semibold text-text-primary">Your auction</p>
      <p className="text-caption text-text-secondary">
        You&apos;re the seller of record — you can&apos;t bid on your own lot. Track it from the seller board.
      </p>
      <Link
        href="/seller-hub/auctions"
        className="pressable mt-1 self-start text-caption font-semibold text-brand hover:underline"
      >
        Open seller board
      </Link>
    </div>
  );
}
