'use client';

/**
 * MyBidRow — one activity row: edge media, honest outcome state derived
 * from the bid ledger, your bid vs top, time anchor. The whole row is a
 * stretched link to the auction; outbid rows carry a separate "Bid again"
 * action that deep-links to the live composer.
 */

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import type { MyBidStatus } from '@/lib/contracts/auction';
import { countdownLabel } from '@/lib/data/fixtures-auctions';
import type { MyBidRow } from '@/lib/data/fixtures-auctions';
import { formatPrice } from '@/lib/utils/format';

const STATUS: Record<MyBidStatus, { label: string; icon: 'close' | 'check'; tone: string }> = {
  outbid: { label: 'Outbid', icon: 'close', tone: 'text-danger-text' },
  winning: { label: 'Leading', icon: 'check', tone: 'text-success-text' },
  won: { label: 'Won', icon: 'check', tone: 'text-success-text' },
  lost: { label: 'Lost', icon: 'close', tone: 'text-text-muted' },
};

export function MyBidRow({ row }: { row: MyBidRow }) {
  const { auction, myBid, status } = row;
  const info = STATUS[status];
  const settled = auction.lifecycle === 'ended';

  return (
    <li className="relative">
      <div className="flex items-center gap-3 py-3.5 text-left">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-surface-alt">
          <AppImage
            src={auction.image}
            alt={auction.title}
            fill
            sizes="64px"
            className="h-full w-full"
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="clamp-1 text-body-emphasis text-text-primary">{auction.title}</p>
          <p className={`mt-0.5 flex items-center gap-1 text-caption font-semibold ${info.tone}`}>
            <Icon name={info.icon} size={13} />
            {info.label}
          </p>
          <p className="tnum mt-0.5 text-meta text-text-secondary">
            Your bid {formatPrice(myBid)}
            {status === 'outbid' || status === 'lost'
              ? ` · Top ${formatPrice(auction.currentBid)}`
              : ''}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="tnum text-caption text-text-secondary">
            {settled ? 'Ended' : countdownLabel(auction)}
          </span>
          {status === 'outbid' ? (
            <Link
              href={`/auctions/${auction.id}#bid`}
              className="pressable relative z-[2] -mx-1 -my-0.5 rounded px-1 py-0.5 text-caption font-semibold text-brand hover:bg-brand-subtle"
            >
              Bid again
            </Link>
          ) : (
            <Icon name="forward" size={14} className="text-text-muted" />
          )}
        </div>
      </div>

      <Link
        href={`/auctions/${auction.id}`}
        className="absolute inset-0 z-[1]"
        aria-label={`${auction.title}, ${info.label}, your bid ${formatPrice(myBid)}`}
      />
    </li>
  );
}
