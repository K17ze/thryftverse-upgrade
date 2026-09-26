'use client';

/**
 * SellPreview — the "how buyers see it" surface before publish. Web port of
 * the mobile ListingPreviewScreen: the draft rendered through the real PDP
 * gallery and the PDP's information grammar (identity → facts → seller →
 * description → shipping & payment), plus the feed tile it will sit as.
 * Nothing here is live — the surface is marked and the footer returns to
 * the editor or commits.
 */

import type { User } from '@/lib/contracts/domain';
import { CATEGORIES } from '@/lib/data/fixtures';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { PdpGallery } from '@/components/pdp/PdpGallery';
import { formatCount, formatPrice } from '@/lib/utils/format';
import {
  draftToPreviewListing,
  isSizelessCategory,
  parsePriceInput,
  type SellDraft,
} from './constants';
import { SellPreviewCard } from './SellPreviewCard';

interface SellPreviewProps {
  draft: SellDraft;
  seller: User;
  publishing: boolean;
  /** True on the ?edit=<id> path — the commit action saves over the listing. */
  editing?: boolean;
  onBack: () => void;
  onPublish: () => void;
}

/** Shipping & payment ledger — mirrors the mobile preview's honest
 *  fallbacks: unset choices read "Confirmed at checkout", never invented. */
function shippingSpecs(draft: SellDraft): [string, string][] {
  const method =
    draft.shippingMethod === 'express'
      ? 'Express'
      : draft.shippingMethod === 'standard'
        ? 'Standard'
        : 'Confirmed at checkout';
  const cost =
    draft.shippingPayer === 'seller'
      ? 'Free shipping — you cover postage'
      : draft.shippingPayer === 'buyer'
        ? 'Buyer pays'
        : 'Confirmed at checkout';
  return [
    ['Shipping method', method],
    ['Shipping cost', cost],
    ['Payment', 'Through ThryftVerse checkout'],
  ];
}

export function SellPreview({ draft, seller, publishing, editing, onBack, onPublish }: SellPreviewProps) {
  const listing = draftToPreviewListing(draft, seller);
  const price = parsePriceInput(draft.price);
  const hasTitle = draft.title.trim().length > 0;
  const categoryName = CATEGORIES.find((c) => c.slug === draft.category)?.name;

  const facts: [string, string][] = [
    ['Condition', draft.condition || '—'],
    ['Size', draft.size || (isSizelessCategory(draft.category) ? 'One size' : '—')],
    ['Category', draft.subcategory || categoryName || '—'],
  ];

  const details: [string, string][] = [];
  if (draft.brand.trim()) details.push(['Brand', draft.brand.trim()]);
  details.push(['Size', draft.size || 'One size']);
  if (draft.condition) details.push(['Condition', draft.condition]);
  if (categoryName) details.push(['Category', draft.subcategory ? `${categoryName} — ${draft.subcategory}` : categoryName]);

  const shipping = shippingSpecs(draft);
  const methodKnown = draft.shippingMethod !== '';
  const freeShipping = draft.shippingPayer === 'seller';

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 pb-16 sm:px-6">
      <header className="flex items-center justify-between gap-4 pb-6 pt-8">
        <div className="flex min-w-0 items-center gap-3">
          <IconButton name="back" aria-label="Back to editing" onClick={onBack} className="-ml-2" />
          <h1 className="clamp-1 text-screen-title font-bold text-text-primary">
            How buyers see it
          </h1>
        </div>
        <Badge variant="neutral" icon="eye" className="shrink-0 uppercase">
          Preview
        </Badge>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12">
        {/* Media stage — the real PDP gallery, lightbox included. */}
        <div className="min-w-0">
          <PdpGallery listing={listing} />
          {!draft.photos.length ? (
            <p className="mt-2 text-caption text-text-muted">
              No photos yet — this is what the frame looks like without them.
            </p>
          ) : null}
        </div>

        {/* Info column — BuyPanel's grammar minus the commerce actions. */}
        <div className="flex min-w-0 flex-col">
          {draft.brand.trim() ? (
            <span className="text-label font-semibold uppercase tracking-wide text-text-secondary">
              {draft.brand.trim()}
            </span>
          ) : null}
          <h2
            className={`mt-0.5 text-item-title font-semibold sm:text-screen-title ${
              hasTitle ? 'text-text-primary' : 'text-text-muted'
            }`}
          >
            {hasTitle ? draft.title.trim() : 'Untitled listing'}
          </h2>
          {!hasTitle ? (
            <p className="mt-1 text-meta italic text-text-muted">
              Add a title before publishing.
            </p>
          ) : null}

          <div className="mt-3">
            {price != null ? (
              <span className="tnum text-price-hero font-bold text-text-primary">
                {formatPrice(price)}
              </span>
            ) : (
              <span className="text-price-hero font-bold text-text-muted">—</span>
            )}
            {listing.priceWithProtection != null ? (
              <p className="mt-1.5 flex items-center gap-1.5 text-body text-text-secondary">
                <Icon name="shieldCheck" size={16} className="shrink-0 text-commerce-trust" />
                <span>
                  <span className="tnum font-semibold text-text-primary">
                    {formatPrice(listing.priceWithProtection)}
                  </span>{' '}
                  incl. Buyer Protection
                </span>
              </p>
            ) : null}
          </div>

          {/* Facts — the PDP's 3-up scan row. */}
          <dl className="mt-5 grid grid-cols-3 gap-3 border-y border-border-subtle py-4">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-meta text-text-muted">{label}</dt>
                <dd className="clamp-1 mt-0.5 text-body font-medium capitalize text-text-primary">
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          {/* Seller — the PDP's identity row. */}
          <div className="flex items-center gap-3 border-b border-border-subtle py-4">
            <Avatar src={seller.avatar} name={seller.username} size={44} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 text-body-emphasis text-text-primary">
                <span className="clamp-1">@{seller.username}</span>
                {seller.isVerified ? (
                  <Icon name="verified" size={13} className="shrink-0 text-success-text" />
                ) : null}
              </p>
              <p className="mt-0.5 flex items-center gap-1 text-meta text-text-secondary">
                <Icon name="star" filled size={12} className="text-rating-star" />
                <span className="tnum">{seller.rating.toFixed(1)}</span>
                {seller.reviewCount ? <span>· {formatCount(seller.reviewCount)} reviews</span> : null}
                {seller.location ? <span className="clamp-1">· {seller.location}</span> : null}
              </p>
            </div>
          </div>

          {/* Description — the seller's own words, honest empty state. */}
          <div className="border-b border-border-subtle py-4">
            {listing.description ? (
              <p className="whitespace-pre-line text-pretty text-body leading-relaxed text-text-primary">
                {listing.description}
              </p>
            ) : (
              <p className="text-body italic text-text-muted">No description added yet.</p>
            )}
          </div>

          {/* Details ledger — same hairline rows as the PDP. */}
          {details.length ? (
            <section className="border-b border-border-subtle py-4" aria-label="Item details">
              <h3 className="mb-1 text-body-emphasis font-semibold text-text-primary">
                Item details
              </h3>
              <dl>
                {details.map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-2.5 last:border-0"
                  >
                    <dt className="text-body text-text-secondary">{label}</dt>
                    <dd className="clamp-1 text-right text-body font-medium capitalize text-text-primary">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {/* Shipping & payment — the PDP's shipping strip, expanded. */}
          <section className="py-4" aria-label="Shipping and payment">
            <div className="flex items-start gap-3">
              <Icon name="box" size={20} className="mt-0.5 shrink-0 text-text-secondary" />
              <div className="min-w-0">
                <p className="text-body font-medium text-text-primary">
                  {methodKnown ? `${shipping[0][1]} delivery` : 'Delivery'}
                  {seller.location ? ` · from ${seller.location}` : ''}
                </p>
                <p className="mt-0.5 text-caption text-text-secondary">
                  {freeShipping ? 'Free delivery — the seller covers postage' : 'Delivery calculated at checkout'}
                </p>
              </div>
            </div>
            <dl className="mt-3">
              {shipping.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-2.5 last:border-0"
                >
                  <dt className="text-body text-text-secondary">{label}</dt>
                  <dd className="text-right text-body font-medium text-text-primary">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>

      {/* Feed context — the tile it sits as in discovery. */}
      <section className="mt-12 border-t border-border-subtle pt-8">
        <h2 className="text-section-title font-semibold text-text-primary">In the feed</h2>
        <p className="mt-0.5 text-caption text-text-muted">
          How it sits in discovery, next to everything else.
        </p>
        <div className="mt-4 max-w-[220px]">
          <SellPreviewCard draft={draft} seller={seller} />
        </div>
      </section>

      {/* Commit row — the mobile preview footer's job: back to the editor,
          or publish. */}
      <div className="mt-10 flex flex-col-reverse gap-3 border-t border-border-subtle pt-6 sm:flex-row sm:justify-end">
        <Button variant="secondary" size="lg" icon="back" onClick={onBack}>
          Keep editing
        </Button>
        <Button variant="primary" size="lg" onClick={onPublish} disabled={publishing}>
          {publishing
            ? editing
              ? 'Saving changes'
              : 'Listing your item'
            : editing
              ? 'Save changes'
              : 'List item'}
        </Button>
      </div>
    </div>
  );
}
