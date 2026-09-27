'use client';

/**
 * BundleTray — the builder's selection ledger: count, per-item remove,
 * and the parcel totals (subtotal / postage / protection / bundle
 * discount). Every number derives from checkoutTotals + the shared
 * BUNDLE_RULE reading (bundleProgressFor) — the same functions /bag and
 * /checkout call — so the figure shown here is the figure they charge,
 * never a parallel estimate.
 */

import type { Listing } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { BUNDLE_RULE, BUNDLE_RULE_LABEL } from '@/lib/data/fixtures';
import { bundleProgressFor } from '@/lib/data/fixtures-commerce';
import { checkoutTotals } from '@/lib/commerce/postage';
import { formatPrice } from '@/lib/utils/format';
import { getCategoryFocalPoint, getListingCoverUri } from '@/lib/utils/media';
import { BUNDLE_MIN_ITEMS } from './bundleRules';

const pctLabel = `${Math.round(BUNDLE_RULE.discountPct * 100)}%`;

interface BundleTrayProps {
  username: string;
  /** The bundle as it stands — staged picks + this seller's bagged items. */
  items: Listing[];
  baggedIds: ReadonlySet<string>;
  /** Per-item remove — the same toggle the grid tiles drive. */
  onRemove: (listing: Listing) => void;
  onSubmit: () => void;
}

export function BundleTray({ username, items, baggedIds, onRemove, onSubmit }: BundleTrayProps) {
  const progress = bundleProgressFor(items);
  const totals = checkoutTotals(items);
  const payable = Math.round((totals.total - progress.discount) * 100) / 100;
  const freshCount = items.filter((l) => !baggedIds.has(l.id)).length;
  const canSubmit = progress.count >= BUNDLE_MIN_ITEMS;

  // One honest line covering both thresholds — the 2-item parcel first,
  // then the BUNDLE_RULE tier. No copy once the discount applies; the
  // ledger says it.
  const hint =
    progress.count === 0
      ? null
      : !canSubmit
        ? `Select ${BUNDLE_MIN_ITEMS - progress.count} more — items from @${username} post together`
        : !progress.qualifies
          ? `Posts as one parcel — add ${progress.missing} more for ${pctLabel} off`
          : null;

  const ctaLabel = !canSubmit
    ? `Select ${BUNDLE_MIN_ITEMS}+ items`
    : freshCount === 0
      ? 'View bag'
      : `Add ${freshCount} ${freshCount === 1 ? 'item' : 'items'} to bag`;

  return (
    <aside className="lg:sticky lg:top-20 lg:self-start" aria-label="Bundle summary">
      <p className="text-body-emphasis text-text-primary" aria-live="polite">
        {progress.count} selected
      </p>

      {/* Selected thumbs — per-item remove, 44px hit around a small chip. */}
      {progress.count > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2.5" aria-label="Selected items">
          {items.map((l) => (
            <li key={l.id} className="relative">
              <AppImage
                src={getListingCoverUri(l.images)}
                alt={l.title}
                aspectRatio={0.8}
                focalPoint={getCategoryFocalPoint(l.category)}
                sizes="48px"
                className="w-12 rounded-md"
              />
              <button
                type="button"
                onClick={() => onRemove(l)}
                aria-label={`Remove ${l.title} from bundle`}
                className="pressable absolute -right-2 -top-2 flex h-9 w-9 items-start justify-end"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface-elevated text-text-secondary">
                  <Icon name="close" size={11} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {progress.count > 0 ? (
        <dl className="mt-4 flex flex-col gap-2.5 border-y border-border-subtle py-4">
          <div className="flex justify-between text-body text-text-secondary">
            <dt>
              Subtotal · <span className="tnum">{progress.count}</span>{' '}
              {progress.count === 1 ? 'item' : 'items'}
            </dt>
            <dd className="tnum text-text-primary">{formatPrice(totals.items)}</dd>
          </div>
          <div className="flex justify-between text-body text-text-secondary">
            <dt>Postage · 1 parcel</dt>
            <dd className="tnum text-text-primary">
              {totals.shippingFee > 0 ? formatPrice(totals.shippingFee) : 'Free'}
            </dd>
          </div>
          <div className="flex justify-between text-body text-text-secondary">
            <dt>Buyer Protection fee</dt>
            <dd className="tnum text-text-primary">{formatPrice(totals.protectionFee)}</dd>
          </div>
          {progress.discount > 0 ? (
            <div className="flex justify-between text-body text-text-secondary">
              <dt className="flex items-center gap-1.5">
                <Icon name="pricetag" size={15} className="text-success-text" />
                Bundle discount ({BUNDLE_RULE_LABEL})
              </dt>
              <dd className="tnum font-semibold text-success-text">
                −{formatPrice(progress.discount)}
              </dd>
            </div>
          ) : null}
          <div className="mt-1 flex justify-between border-t border-border-subtle pt-3 text-body-emphasis text-text-primary">
            <dt className="font-semibold">Total</dt>
            <dd className="tnum text-price-list font-bold">{formatPrice(payable)}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-body text-text-secondary">
          Pick {BUNDLE_MIN_ITEMS}+ items — everything from @{username} posts together
          in one parcel, and {BUNDLE_RULE_LABEL} applies automatically.
        </p>
      )}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        icon="bag"
        disabled={!canSubmit}
        onClick={onSubmit}
        className="mt-4"
      >
        {ctaLabel}
      </Button>
      {hint ? <p className="mt-2 text-caption text-text-muted">{hint}</p> : null}
    </aside>
  );
}
