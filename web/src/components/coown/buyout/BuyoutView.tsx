'use client';

/**
 * /co-own/[id]/buyout — port of mobile BuyoutScreen. A bidder posts a
 * per-unit offer for the units they don't hold; holders see every open
 * offer and can accept a partial quantity against the target.
 *
 * Fixture mode: offers and acceptances live in the session query cache —
 * they survive navigation, not reloads. Accepting draws units out of the
 * viewer's position so the numbers stay consistent.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { useSignupWall } from '@/components/auth/SignupWall';
import type { CoOwnBuyoutOffer } from '@/lib/contracts/coown';
import {
  useBuyoutActions,
  useBuyoutOffers,
  useCoOwnAsset,
  useCoOwnPositions,
} from '@/lib/hooks/coown-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { AssetThumb } from '../AssetThumb';
import { gbp } from '../format';

const FIELD =
  'h-11 w-full rounded-md border border-border bg-input px-3.5 text-body tnum text-input-text placeholder:text-text-muted transition-colors focus:border-text-muted focus:outline-none';

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between py-2.5 ${
        last ? '' : 'border-b border-border-subtle'
      }`}
    >
      <span className="text-body text-text-secondary">{label}</span>
      <span className="text-body font-semibold text-text-primary tnum">{value}</span>
    </div>
  );
}

function BuyoutSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6 md:pt-10">
      <div className="skeleton h-4 w-24 rounded-sm" aria-hidden="true" />
      <div className="mt-4 skeleton h-9 w-48 rounded-sm" aria-hidden="true" />
      <div className="mt-8 space-y-3" aria-hidden="true">
        <div className="skeleton h-16 rounded-lg" />
        <div className="skeleton h-28 rounded-lg" />
        <div className="skeleton h-40 rounded-lg" />
      </div>
    </div>
  );
}

/** One open offer — breakdown rows plus the holder accept path. */
function OfferCard({
  offer,
  referencePriceGbp,
  viewerUnits,
  accepting,
  onAccept,
}: {
  offer: CoOwnBuyoutOffer;
  referencePriceGbp: number;
  viewerUnits: number;
  accepting: boolean;
  onAccept: (offerId: string, units: number) => void;
}) {
  const [unitsRaw, setUnitsRaw] = useState('');

  const expired = Date.parse(offer.expiresAt) <= Date.now();
  const filled = offer.status === 'filled';
  const live = offer.status === 'open' && !expired;
  const remainingTarget = Math.max(0, offer.targetUnits - offer.acceptedUnits);
  const maxAccept = Math.min(viewerUnits, remainingTarget);
  const canAccept = live && !offer.mine && maxAccept > 0;

  const units = unitsRaw.trim() ? Math.floor(Number(unitsRaw)) : maxAccept;
  const unitsValid = Number.isFinite(units) && units >= 1 && units <= maxAccept;
  const receiveGbp = unitsValid ? offer.offerPriceGbp * units : null;

  const premiumPct =
    referencePriceGbp > 0
      ? ((offer.offerPriceGbp - referencePriceGbp) / referencePriceGbp) * 100
      : null;

  return (
    <li className="rounded-lg border border-border-subtle p-4">
      <div className="flex items-baseline justify-between gap-3 border-b border-border-subtle pb-3">
        <div className="min-w-0">
          <p className="text-body font-semibold text-text-primary tnum">
            {gbp(offer.offerPriceGbp)} per unit
          </p>
          {premiumPct != null ? (
            <p
              className={`mt-0.5 text-meta tnum ${
                premiumPct >= 0 ? 'text-coown-up' : 'text-danger-text'
              }`}
            >
              {premiumPct >= 0 ? '+' : '−'}
              {Math.abs(premiumPct).toFixed(1)}% vs reference
            </p>
          ) : null}
        </div>
        <span
          className={`shrink-0 text-meta font-semibold ${
            live ? 'text-coown-up' : 'text-text-muted'
          }`}
        >
          {filled ? 'Filled' : expired ? 'Expired' : offer.status === 'withdrawn' ? 'Withdrawn' : 'Open'}
        </span>
      </div>

      <div>
        <Row label="Bidder" value={`@${offer.bidderUsername}`} />
        <Row label="Target" value={`${offer.targetUnits.toLocaleString()} units`} />
        <Row
          label="Accepted"
          value={`${offer.acceptedUnits.toLocaleString()} / ${offer.targetUnits.toLocaleString()} units`}
        />
        <Row label="Remaining" value={`${remainingTarget.toLocaleString()} units`} />
        <Row label="Expires" value={dateTime(offer.expiresAt)} last />
      </div>

      {offer.mine ? (
        <p className="mt-3 text-meta text-text-muted">This is your offer.</p>
      ) : canAccept ? (
        <div className="mt-4">
          <label htmlFor={`accept-${offer.id}`} className="text-meta text-text-secondary">
            Units to accept — max {maxAccept.toLocaleString()}
          </label>
          <input
            id={`accept-${offer.id}`}
            type="number"
            inputMode="numeric"
            min={1}
            max={maxAccept}
            step={1}
            value={unitsRaw}
            onChange={(e) => setUnitsRaw(e.target.value)}
            placeholder={String(maxAccept)}
            className={`mt-1.5 ${FIELD}`}
          />
          <p className="mt-1.5 text-meta text-text-muted">
            {receiveGbp != null
              ? `You receive ${gbp(receiveGbp)} for ${units.toLocaleString()} units.`
              : `Enter 1–${maxAccept.toLocaleString()} units, or leave blank for the maximum.`}
          </p>
          <Button
            size="md"
            className="mt-3 w-full"
            disabled={accepting || (unitsRaw.trim() !== '' && !unitsValid)}
            onClick={() => onAccept(offer.id, units)}
          >
            {accepting ? 'Accepting…' : 'Accept offer'}
          </Button>
        </div>
      ) : live ? (
        <p className="mt-3 text-meta text-text-muted">
          {viewerUnits <= 0
            ? 'You hold no units to accept this offer.'
            : 'You cannot accept this offer.'}
        </p>
      ) : null}
    </li>
  );
}

export function BuyoutView({ id }: { id: string }) {
  const router = useRouter();
  const { user } = useSession();
  const { requireAuth, wall } = useSignupWall();
  const { show } = useToast();
  const assetQ = useCoOwnAsset(id);
  const positionsQ = useCoOwnPositions();
  const offersQ = useBuyoutOffers(id);
  const { createOffer, acceptOffer } = useBuyoutActions();

  const [priceRaw, setPriceRaw] = useState('');
  const [unitsRaw, setUnitsRaw] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const asset = assetQ.data ?? null;
  const viewerUnits = useMemo(
    () => positionsQ.data?.find((p) => p.assetId === id)?.units ?? 0,
    [positionsQ.data, id],
  );

  const offers = useMemo(
    () =>
      [...(offersQ.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [offersQ.data],
  );

  if (assetQ.isLoading || positionsQ.isLoading || offersQ.isLoading) return <BuyoutSkeleton />;

  if (assetQ.isError || !asset) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <EmptyState
          icon="alert"
          title="Asset not found"
          subtitle="This Co-Own item may have been delisted."
          actionLabel="Back to markets"
          onAction={() => router.push('/co-own')}
        />
      </div>
    );
  }

  const ownsAll = asset.totalUnits > 0 && viewerUnits >= asset.totalUnits;
  const remainingUnits = Math.max(0, asset.totalUnits - viewerUnits);
  const ownershipPct = asset.totalUnits > 0 ? (viewerUnits / asset.totalUnits) * 100 : null;

  // Form math — mirrors mobile: blank target = all remaining units,
  // +24h expiry, GBP settlement.
  const priceNum = Number.parseFloat(priceRaw);
  const priceValid = Number.isFinite(priceNum) && priceNum > 0;
  const unitsParsed = unitsRaw.trim() ? Math.floor(Number(unitsRaw)) : null;
  const unitsProvidedValid =
    unitsParsed == null || (Number.isFinite(unitsParsed) && unitsParsed >= 1);
  const effectiveUnits = unitsParsed ?? remainingUnits;
  const totalGbp = priceValid && effectiveUnits > 0 ? priceNum * effectiveUnits : null;
  const expiresAt = new Date(Date.now() + 24 * 3_600_000);

  const canSubmit = priceValid && unitsProvidedValid && effectiveUnits > 0;

  const submitOffer = () => {
    if (!canSubmit || !user) return;
    createOffer(id, {
      bidderUsername: user.username,
      offerPriceGbp: priceNum,
      targetUnits: effectiveUnits,
    });
    setConfirmOpen(false);
    setPriceRaw('');
    setUnitsRaw('');
    show('Buyout offer submitted', 'success');
  };

  const handleAccept = (offerId: string, units: number) => {
    if (!requireAuth('purchase') || !user) return;
    setAcceptingId(offerId);
    const ok = acceptOffer(offerId, id, units);
    setAcceptingId(null);
    if (ok) {
      const offer = offers.find((o) => o.id === offerId);
      show(
        `Accepted ${units} ${units === 1 ? 'unit' : 'units'} at ${gbp(offer?.offerPriceGbp)} per unit`,
        'success',
      );
    } else {
      show('Could not accept this offer', 'error');
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6 md:pt-10">
      <Link
        href={`/co-own/${asset.id}`}
        className="pressable inline-flex items-center gap-1.5 text-body font-medium text-text-secondary hover:text-text-primary"
      >
        <Icon name="back" size={16} />
        {asset.title}
      </Link>

      <header className="mt-4">
        <h1 className="text-editorial-display text-text-primary">Buyout</h1>
        <p className="mt-2 text-meta text-text-secondary">
          Offer to acquire the remaining units from current holders.
        </p>
      </header>

      {/* Asset context */}
      <div className="mt-6 flex items-center gap-3.5 border-b border-border-subtle pb-5">
        <AssetThumb src={asset.imageUrl} alt={asset.title} className="w-14" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold text-text-primary">{asset.title}</p>
          <p className="mt-0.5 text-meta text-text-muted tnum">
            {gbp(asset.unitPriceGbp)} / unit · {asset.totalUnits.toLocaleString()} units
          </p>
        </div>
      </div>

      {/* Position summary — flat hairline rows */}
      <section aria-label="Your position" className="mt-4">
        <Row
          label="Your units"
          value={`${viewerUnits.toLocaleString()} / ${asset.totalUnits.toLocaleString()}`}
        />
        <Row label="Ownership" value={ownershipPct != null ? `${ownershipPct.toFixed(1)}%` : '—'} />
        <Row label="Remaining" value={`${remainingUnits.toLocaleString()} units`} last />
      </section>

      {ownsAll ? (
        <section className="mt-6 border-t border-border-subtle pt-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-subtle text-coown-up">
            <Icon name="check" size={24} />
          </span>
          <h2 className="mt-4 text-section-title font-semibold text-text-primary">
            You own 100% of this item
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-body text-text-secondary">
            You already hold all units in this Co-Own. No buyout is needed.
          </p>
          <Button
            variant="secondary"
            size="md"
            icon="back"
            className="mt-6"
            onClick={() => router.push(`/co-own/${asset.id}`)}
          >
            Back to item
          </Button>
        </section>
      ) : (
        <>
          {/* Offer form */}
          <section aria-labelledby="buyout-form" className="mt-8 border-t border-border-subtle pt-6">
            <h2
              id="buyout-form"
              className="text-micro font-semibold uppercase tracking-[0.08em] text-text-muted"
            >
              Make a buyout offer
            </h2>
            <p className="mt-2 text-body text-text-secondary">
              Submit an offer for the remaining {remainingUnits.toLocaleString()} units. Holders are
              notified and can accept or decline.
            </p>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="buyout-price"
                  className="text-label font-semibold uppercase tracking-wider text-text-muted"
                >
                  Offer price (GBP)
                </label>
                <input
                  id="buyout-price"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={priceRaw}
                  onChange={(e) => setPriceRaw(e.target.value)}
                  placeholder={`e.g. ${asset.unitPriceGbp.toFixed(2)}`}
                  className={`mt-2 ${FIELD}`}
                />
              </div>
              <div>
                <label
                  htmlFor="buyout-units"
                  className="text-label font-semibold uppercase tracking-wider text-text-muted"
                >
                  Target units
                </label>
                <input
                  id="buyout-units"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={unitsRaw}
                  onChange={(e) => setUnitsRaw(e.target.value)}
                  placeholder={`All remaining (${remainingUnits.toLocaleString()})`}
                  className={`mt-2 ${FIELD}`}
                />
                <p className="mt-1.5 text-meta text-text-muted">
                  Leave blank to offer on all remaining units.
                </p>
              </div>
            </div>

            {totalGbp != null ? (
              <div className="mt-5 border-t border-border-subtle pt-4">
                <p className="text-body font-semibold text-text-primary tnum">
                  {gbp(priceNum)} per unit × {effectiveUnits.toLocaleString()} units ={' '}
                  {gbp(totalGbp)} commitment
                </p>
                <div className="mt-1">
                  <Row label="Target" value={`${effectiveUnits.toLocaleString()} units`} />
                  <Row label="Expires" value={dateTime(expiresAt.toISOString())} />
                  <Row label="Settlement" value="GBP" last />
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-meta text-text-muted">
                Demo build — offers are stored on this device only.
              </p>
              <Button
                size="lg"
                disabled={!canSubmit}
                onClick={() => {
                  if (requireAuth('purchase')) setConfirmOpen(true);
                }}
              >
                Submit offer
              </Button>
            </div>
          </section>

          {/* Holder review — every open offer on this asset */}
          <section aria-labelledby="buyout-offers" className="mt-10 border-t border-border-subtle pt-6">
            <h2
              id="buyout-offers"
              className="flex items-baseline justify-between text-micro font-semibold uppercase tracking-[0.08em] text-text-muted"
            >
              Active buyout offers
              <span className="tnum normal-case tracking-normal">{offers.length}</span>
            </h2>
            {offers.length === 0 ? (
              <p className="mt-4 text-body text-text-secondary">
                No active buyout offers for this asset.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {offers.map((offer) => (
                  <OfferCard
                    key={offer.id}
                    offer={offer}
                    referencePriceGbp={asset.unitPriceGbp}
                    viewerUnits={viewerUnits}
                    accepting={acceptingId === offer.id}
                    onAccept={handleAccept}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <Sheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Submit buyout offer?"
        maxWidth={440}
      >
        <div className="p-5">
          {totalGbp != null ? (
            <p className="text-body font-semibold text-text-primary tnum">
              {gbp(priceNum)} per unit × {effectiveUnits.toLocaleString()} units = {gbp(totalGbp)}{' '}
              commitment
            </p>
          ) : null}
          <div className="mt-3">
            <Row label="Target" value={`${effectiveUnits.toLocaleString()} units`} />
            <Row label="Expires" value={dateTime(expiresAt.toISOString())} />
            <Row label="Settlement" value="GBP" last />
          </div>
          <p className="mt-4 text-meta text-text-muted">
            Holders are notified and can accept or decline. The offer lapses after 24 hours.
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" size="md" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button size="md" onClick={submitOffer}>
              Submit offer
            </Button>
          </div>
        </div>
      </Sheet>

      {wall}
    </div>
  );
}
