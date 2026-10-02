'use client';

/**
 * /bag — bundle bag. Line items grouped per seller (the unit a bundle
 * discount attaches to) with a per-seller bundle hint rail, totals ledger
 * (items / bundle discount / protection / shipping / total), one checkout
 * CTA. Mutations are client-side via useStore.
 * Decomposed into modular domain components (< 400 LOC standard):
 *  - BagSkeleton
 *  - BagEmptyRecovery
 *  - BagSellerGroup
 *  - BagBundleSuggestions
 *  - BagOrderSummary
 *  - useBagWorkflow
 */

import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { BagSellerGroup } from '@/components/bag/BagSellerGroup';
import { BagSkeleton } from '@/components/bag/BagSkeleton';
import { BagEmptyRecovery } from '@/components/bag/BagEmptyRecovery';
import { BagBundleSuggestions } from '@/components/bag/BagBundleSuggestions';
import { BagOrderSummary } from '@/components/bag/BagOrderSummary';
import { useBagWorkflow } from '@/components/bag/useBagWorkflow';

export default function BagPage() {
  const router = useRouter();
  const workflow = useBagWorkflow();

  if (!workflow.hydrated || workflow.listingsLoading) {
    return <BagSkeleton />;
  }

  if (workflow.items.length === 0) {
    // Live entries that resolved to nothing aren't "empty bag" — say so.
    const pruned = workflow.soldOutCount + workflow.unresolvedCount;
    // Recovery path: items parked with "Save for later" live in /saved —
    // surface the way back when there's something to recover.
    return (
      <>
        <EmptyState
          icon="bag"
          title={pruned > 0 ? 'Nothing left in your bag' : 'Your bag is empty'}
          subtitle={
            pruned > 0
              ? `${pruned} ${pruned === 1 ? 'item is' : 'items are'} no longer available and ${pruned === 1 ? 'was' : 'were'} removed from view.`
              : 'Save items to your bag and check out in one go — bundles from the same seller ship together.'
          }
          actionLabel="Start shopping"
          actionVariant="primary"
          onAction={() => router.push('/explore')}
        />
        <BagEmptyRecovery />
      </>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
      <h1 className="text-screen-title text-text-primary">
        Bag <span className="tnum text-text-muted">· {workflow.items.length}</span>
      </h1>
      <p className="mt-2 text-meta text-text-muted">
        Items aren’t reserved until you check out.
      </p>
      {workflow.liveAuctionCount > 0 ? (
        <p className="mt-1 text-meta text-text-muted">
          {workflow.liveAuctionCount}{' '}
          {workflow.liveAuctionCount === 1 ? 'item' : 'items'} in your bag{' '}
          {workflow.liveAuctionCount === 1 ? 'is' : 'are'} in a live auction and
          can sell to another bidder.
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {workflow.soldOutCount > 0 ? (
            <p className="mb-4 flex items-center gap-1.5 text-caption text-text-muted">
              <Icon name="info" size={14} className="shrink-0" />
              {workflow.soldOutCount}{' '}
              {workflow.soldOutCount === 1 ? 'item' : 'items'} sold out —
              excluded from your bag.
            </p>
          ) : null}
          {workflow.unresolvedCount > 0 ? (
            <p className="mb-4 flex items-center gap-1.5 text-caption text-text-muted">
              <Icon name="info" size={14} className="shrink-0" />
              {workflow.unresolvedCount}{' '}
              {workflow.unresolvedCount === 1 ? 'item' : 'items'} couldn’t be
              loaded — not included in your totals.
            </p>
          ) : null}

          {/* Seller groups — hairline-separated sections on canvas;
              the bundle is priced per seller */}
          <div className="divide-y divide-border-subtle">
            {workflow.groups.map((group) => (
              <BagSellerGroup
                key={group.sellerId}
                group={group}
                onRemove={workflow.handleRemoveItem}
                onSaveForLater={workflow.handleSaveForLater}
              />
            ))}
          </div>

          {/* Bundle hint — other stock from sellers already in the bag */}
          <BagBundleSuggestions
            bundleGroups={workflow.bundleGroups}
            onAddToBag={workflow.handleAddToBag}
          />
        </div>

        {/* Totals — flat ledger, hairlines, one action */}
        <BagOrderSummary
          itemsCount={workflow.items.length}
          totals={workflow.totals}
          bundleDiscount={workflow.bundleDiscount}
          promoDiscount={workflow.promoDiscount}
          payableTotal={workflow.payableTotal}
          appliedPromo={workflow.appliedPromo}
          onApplyPromo={workflow.handleApplyPromo}
          onRemovePromo={workflow.handleRemovePromo}
          onCheckout={workflow.handleCheckout}
        />
      </div>
    </div>
  );
}
