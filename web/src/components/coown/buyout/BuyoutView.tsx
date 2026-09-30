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

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { coOwnMarkGbp } from '@/lib/contracts/coown';
import { BuyoutSkeleton } from './BuyoutPrimitives';
import { BuyoutPositionRail } from './BuyoutPositionRail';
import { BuyoutFormSection } from './BuyoutFormSection';
import { BuyoutOfferCard } from './BuyoutOfferCard';
import { useBuyoutWorkflow } from './useBuyoutWorkflow';

export function BuyoutView({ id }: { id: string }) {
  const w = useBuyoutWorkflow(id);

  if (w.assetQ.isLoading || w.positionsQ.isLoading || w.offersQ.isLoading) {
    return <BuyoutSkeleton />;
  }

  if (w.assetQ.isError || !w.asset) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <EmptyState
          icon="alert"
          title="Asset not found"
          subtitle="This Co-Own item may have been delisted."
          actionLabel="Back to markets"
          onAction={() => w.router.push('/co-own')}
        />
      </div>
    );
  }

  const asset = w.asset;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6 md:pt-10 lg:max-w-[1440px]">
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

      {/* Desktop grammar: context + position rail on the right, the offer
          form and open offers in the main column — checkout grammar. DOM
          order keeps mobile's context → position → form stacking; explicit
          column placement puts the rail right at lg. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-x-16">
        <BuyoutPositionRail
          asset={asset}
          viewerUnits={w.viewerUnits}
          ownershipPct={w.ownershipPct}
          remainingUnits={w.remainingUnits}
        />

        <div className="min-w-0 lg:order-1 lg:col-start-1 lg:row-start-1">
          {w.ownsAll ? (
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
                onClick={() => w.router.push(`/co-own/${asset.id}`)}
              >
                Back to item
              </Button>
            </section>
          ) : (
            <>
              {/* Offer form & Confirmation */}
              <BuyoutFormSection
                asset={asset}
                remainingUnits={w.remainingUnits}
                priceRaw={w.priceRaw}
                onPriceChange={w.setPriceRaw}
                unitsRaw={w.unitsRaw}
                onUnitsChange={w.setUnitsRaw}
                priceNum={w.priceNum}
                effectiveUnits={w.effectiveUnits}
                totalGbp={w.totalGbp}
                expiresAt={w.expiresAt}
                canSubmit={w.canSubmit}
                onSubmitClick={() => {
                  if (w.requireAuth('purchase')) w.setConfirmOpen(true);
                }}
                confirmOpen={w.confirmOpen}
                onCloseConfirm={() => w.setConfirmOpen(false)}
                submitting={w.submitting}
                onConfirmSubmit={() => void w.submitOffer()}
              />

              {/* Holder review — every open offer on this asset */}
              <section
                aria-labelledby="buyout-offers"
                className="mt-10 border-t border-border-subtle pt-6"
              >
                <h2
                  id="buyout-offers"
                  className="flex items-baseline justify-between text-micro font-semibold uppercase tracking-[0.08em] text-text-muted"
                >
                  Active buyout offers
                  <span className="tnum normal-case tracking-normal">{w.offers.length}</span>
                </h2>
                {w.offers.length === 0 ? (
                  <p className="mt-4 text-body text-text-secondary">
                    No active buyout offers for this asset.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {w.offers.map((offer) => (
                      <BuyoutOfferCard
                        key={offer.id}
                        offer={offer}
                        referencePriceGbp={coOwnMarkGbp(asset)}
                        viewerUnits={w.viewerUnits}
                        accepting={w.acceptingId === offer.id}
                        onAccept={w.handleAccept}
                      />
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      {w.wall}
    </div>
  );
}
