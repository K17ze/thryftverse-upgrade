'use client';

/**
 * SellSuccess — post-publish confirmation. Web port of the mobile
 * ListingSuccessScreen: "Listed" hero with a live-status readout, the
 * published item card, then the onward actions — View listing (the PDP
 * resolves the record straight from MY_LISTINGS), Share listing, Sell
 * another — plus quiet manage/edit links and sell-faster tips.
 * The publish was written into the session's own-listing store, so
 * "View listing" deep-links to the real /item/[id].
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Listing } from '@/lib/contracts/domain';
import { CATEGORIES } from '@/lib/data/fixtures';
import { AppImage } from '@/components/ui/AppImage';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { formatPrice } from '@/lib/utils/format';
import { getListingCoverUri } from '@/lib/utils/media';

interface SellSuccessProps {
  /** The record publish wrote to the session's own-listing store. */
  listing: Listing;
  /** True when publish updated an existing listing rather than creating one. */
  edited?: boolean;
  onListAnother: () => void;
}

const TIPS: { icon: AppIconName; text: string }[] = [
  { icon: 'camera', text: 'Clear photos from a few angles sell faster.' },
  { icon: 'pricetag', text: 'Fair prices move — check what similar items sold for.' },
  { icon: 'chat', text: 'Quick replies to questions turn views into offers.' },
];

export function SellSuccess({ listing, edited, onListAnother }: SellSuccessProps) {
  const router = useRouter();
  const { show } = useToast();
  const categoryName = CATEGORIES.find((c) => c.slug === listing.category)?.name;

  const share = async () => {
    const url = `${window.location.origin}/item/${listing.id}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: `${listing.title} on ThryftVerse`, url });
        return;
      } catch {
        // Dismissed or unsupported — fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      show('Listing link copied', 'success');
    } catch {
      show('Could not copy link', 'error');
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col items-center px-4 py-16 text-center sm:px-6 sm:py-20">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success-subtle text-success-text">
        <Icon name="check" filled size={30} />
      </span>
      <h1 className="mt-6 text-screen-title font-bold text-text-primary">
        {edited ? 'Your changes are live' : 'Listed'}
      </h1>
      <p className="mt-2 max-w-sm text-body text-text-secondary">
        {edited
          ? 'Buyers see the update right away.'
          : 'Your item is now live on ThryftVerse — we’ll let you know when it sells.'}
      </p>

      {/* Status readout — mirrors the mobile status pill + id line. */}
      <div className="mt-5 flex items-center gap-3">
        <Badge variant="success" icon="check">
          {edited ? 'Updated' : 'Live now'}
        </Badge>
        <span className="tnum text-meta text-text-muted">{listing.id}</span>
      </div>

      {/* The published item card — flat summary row, real record data. */}
      <div className="mt-8 flex w-full max-w-[420px] items-center gap-3 rounded-xl border border-border-subtle p-3 text-left">
        <AppImage
          src={getListingCoverUri(listing.images)}
          alt={listing.title}
          width={64}
          height={80}
          sizes="64px"
          fallbackIcon="image"
          className="h-20 w-16 shrink-0 rounded-lg"
        />
        <div className="min-w-0 flex-1">
          <span className="text-meta font-medium uppercase tracking-wide text-text-muted">
            {edited ? 'Updated listing' : 'Published listing'}
          </span>
          <p className="clamp-2 mt-0.5 text-body-emphasis font-semibold text-text-primary">
            {listing.title}
          </p>
          <p className="mt-0.5 text-caption text-text-secondary">
            <span className="tnum font-semibold text-text-primary">
              {formatPrice(listing.price)}
            </span>
            {categoryName ? ` · ${categoryName}` : ''}
          </p>
        </div>
      </div>

      {/* Actions — the mobile success action list, button grammar. */}
      <div className="mt-8 flex w-full max-w-[300px] flex-col gap-3 sm:max-w-none sm:flex-row">
        <Button
          variant="primary"
          size="lg"
          icon="eye"
          onClick={() => router.push(`/item/${listing.id}`)}
        >
          View listing
        </Button>
        <Button variant="secondary" size="lg" icon="share" onClick={share}>
          Share listing
        </Button>
        <Button variant="secondary" size="lg" onClick={onListAnother}>
          Sell another
        </Button>
      </div>

      {/* Quiet onward paths — manage, and edit on the create path. */}
      <div className="mt-5 flex items-center gap-4 text-caption font-medium">
        <Link
          href="/seller-hub/listings"
          className="pressable text-text-muted transition-colors hover:text-text-secondary"
        >
          Manage listings
        </Link>
        {!edited ? (
          <Link
            href={`/sell?edit=${listing.id}`}
            className="pressable text-text-muted transition-colors hover:text-text-secondary"
          >
            Edit listing
          </Link>
        ) : null}
      </div>

      {/* Sell-faster tips — the mobile tips block, flat list. */}
      {!edited ? (
        <div className="mt-12 w-full max-w-[420px] border-t border-border-subtle pt-6 text-left">
          <h2 className="text-body-emphasis font-semibold text-text-primary">
            Tips for a faster sale
          </h2>
          <ul className="mt-3 flex flex-col gap-2.5">
            {TIPS.map((tip) => (
              <li key={tip.icon} className="flex items-start gap-2.5">
                <Icon name={tip.icon} size={15} className="mt-0.5 shrink-0 text-text-muted" />
                <span className="text-caption text-text-secondary">{tip.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
