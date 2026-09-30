'use client';

/**
 * PdpShippingInfo — delivery estimates, dispatch SLA, returns policy,
 * physical authenticity guarantees, and expandable Buyer Protection accordion.
 */

import { useState } from 'react';
import Link from 'next/link';
import type { Listing } from '@/lib/contracts/domain';
import { Icon } from '@/components/ui/Icon';
import { AUTHENTICATION_THRESHOLD_GBP } from '@/lib/data/fixtures-commerce';
import { DISPATCH_SLA_DAYS } from '@/lib/commerce/dispatch';
import { formatPrice } from '@/lib/utils/format';

interface PdpShippingInfoProps {
  listing: Listing;
  sellerLocation?: string | null;
}

function formatEtaDay(iso: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function deliveryCostLine(listing: Listing): string {
  if (listing.shippingPayer === 'seller') {
    return 'Free postage — the seller covers delivery';
  }
  if (typeof listing.shippingPrice === 'number') {
    return listing.shippingPrice > 0
      ? `${formatPrice(listing.shippingPrice)} postage`
      : 'Free postage — the seller covers delivery';
  }
  return 'Postage calculated at checkout';
}

function deliveryEtaLine(listing: Listing): string | null {
  const end = listing.estimatedDeliveryEnd ? formatEtaDay(listing.estimatedDeliveryEnd) : null;
  const start = listing.estimatedDeliveryStart
    ? formatEtaDay(listing.estimatedDeliveryStart)
    : null;
  if (!start && !end) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endMs = listing.estimatedDeliveryEnd
    ? Date.parse(listing.estimatedDeliveryEnd)
    : Date.parse(listing.estimatedDeliveryStart ?? '');
  if (Number.isFinite(endMs) && endMs < today.getTime()) return null;
  if (start && end) return start === end ? `Arrives ${start}` : `Arrives ${start} – ${end}`;
  if (end) return `Arrives by ${end}`;
  return `Arrives from ${start}`;
}

function returnsLine(listing: Listing): string {
  const policy = listing.returnPolicy;
  if (!policy) return 'Return policy confirmed at checkout';
  if (policy.summary) return policy.summary;
  if (policy.accepted === true) {
    return policy.windowDays ? `${policy.windowDays}-day returns` : 'Returns accepted';
  }
  if (policy.accepted === false) return 'No returns';
  return 'Return policy confirmed at checkout';
}

export function PdpShippingInfo({ listing, sellerLocation }: PdpShippingInfoProps) {
  const [protectionOpen, setProtectionOpen] = useState(false);

  return (
    <div className="py-4">
      {/* Postage + location */}
      <div className="flex items-start gap-3">
        <Icon name="box" size={20} className="mt-0.5 shrink-0 text-text-secondary" />
        <div className="min-w-0">
          <p className="text-body font-medium text-text-primary">
            {listing.shippingMethod ?? 'Delivery'}
            {sellerLocation ? ` · from ${sellerLocation}` : ''}
          </p>
          <p className="tnum mt-0.5 text-caption text-text-secondary">
            {deliveryCostLine(listing)}
            {deliveryEtaLine(listing) ? ` · ${deliveryEtaLine(listing)}` : ''}
          </p>
        </div>
      </div>

      {/* Dispatch SLA */}
      <div className="mt-2.5 flex items-start gap-3">
        <Icon name="clock" size={20} className="mt-0.5 shrink-0 text-text-secondary" />
        <p className="text-body font-medium text-text-primary">
          {typeof listing.dispatchSlaDays === 'number' && listing.dispatchSlaDays > 0 ? (
            <>
              Dispatches within{' '}
              <span className="tnum">{Math.round(listing.dispatchSlaDays)}</span>{' '}
              {Math.round(listing.dispatchSlaDays) === 1 ? 'day' : 'days'}
            </>
          ) : (
            <>
              Typically dispatches in{' '}
              <span className="tnum">{DISPATCH_SLA_DAYS}</span> days
            </>
          )}
        </p>
      </div>

      {/* Returns policy */}
      <div className="mt-2.5 flex items-start gap-3">
        <Icon name="repeat" size={20} className="mt-0.5 shrink-0 text-text-secondary" />
        <div className="min-w-0">
          <p className="text-body font-medium text-text-primary">{returnsLine(listing)}</p>
          {listing.returnPolicy?.conditions ? (
            <p className="mt-0.5 text-caption text-text-secondary">
              {listing.returnPolicy.conditions}
            </p>
          ) : null}
        </div>
      </div>

      {/* Physical authentication guarantees */}
      {listing.authenticity?.status === 'verified' ? (
        <div className="mt-2.5 flex items-start gap-3">
          <Icon name="verified" size={20} className="mt-0.5 shrink-0 text-commerce-trust" />
          <div className="min-w-0">
            <p className="text-body font-medium text-text-primary">
              {listing.authenticity.label ?? 'Authenticated'}
            </p>
            <p className="mt-0.5 text-caption text-text-secondary">
              This item has passed ThryftVerse authentication.
            </p>
          </div>
        </div>
      ) : listing.authenticity?.status === 'in_progress' ? (
        <div className="mt-2.5 flex items-start gap-3">
          <Icon name="clock" size={20} className="mt-0.5 shrink-0 text-text-secondary" />
          <div className="min-w-0">
            <p className="text-body font-medium text-text-primary">
              Authentication in progress
            </p>
            <p className="mt-0.5 text-caption text-text-secondary">
              Our verification team is checking this item.
            </p>
          </div>
        </div>
      ) : listing.price >= AUTHENTICATION_THRESHOLD_GBP ? (
        <div className="mt-2.5 flex items-start gap-3">
          <Icon name="verified" size={20} className="mt-0.5 shrink-0 text-commerce-trust" />
          <div className="min-w-0">
            <p className="text-body font-medium text-text-primary">
              Physical authentication included
            </p>
            <p className="mt-0.5 text-caption text-text-secondary">
              Orders over{' '}
              <span className="tnum">{formatPrice(AUTHENTICATION_THRESHOLD_GBP)}</span> are
              checked by our verification team before they reach you.
            </p>
          </div>
        </div>
      ) : null}

      {/* Buyer Protection disclosure */}
      <button
        type="button"
        aria-expanded={protectionOpen}
        onClick={() => setProtectionOpen((v) => !v)}
        className="pressable mt-2 flex w-full items-center gap-3 rounded-md py-1.5 text-left"
      >
        <Icon name="shieldCheck" size={20} className="shrink-0 text-commerce-trust" />
        <span className="text-body font-medium text-text-primary">
          Buyer Protection covers every order
        </span>
        <Icon
          name={protectionOpen ? 'chevronUp' : 'chevronDown'}
          size={14}
          className="ml-auto shrink-0 text-text-muted"
        />
      </button>

      {protectionOpen ? (
        <div className="mt-2 flex flex-col gap-2 rounded-lg bg-surface-alt p-3.5 text-caption text-text-secondary">
          <p>
            Your payment is held in escrow until you receive your order and confirm it matches the listing.
          </p>
          <ul className="flex flex-col gap-1 list-disc pl-4 text-text-muted">
            <li>Full refund if the item does not arrive</li>
            <li>48-hour return window if the item is significantly not as described</li>
            <li>Dispute resolution team on standby for every transaction</li>
          </ul>
          <Link
            href="/buyer-protection"
            className="pressable mt-1 self-start font-semibold text-brand hover:underline"
          >
            Learn more about Buyer Protection
          </Link>
        </div>
      ) : null}
    </div>
  );
}
