'use client';

/**
 * /seller-hub/promotions — the Sponsored-placement manage surface,
 * web port of the mobile SellerPromotionsPanel.
 *
 * Orchestrated with domain components (<400 LOC standard):
 *  - PromotionListRow
 *  - PromoteComposerSheet
 *  - EndPromotionConfirmSheet
 *  - SellerSectionNav
 *  - useSellerPromotionsWorkflow
 */

import { SellerSectionNav } from '@/components/seller/SellerSectionNav';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { PromotionsSkeleton } from '@/components/seller/promotions/SellerPromotionsPrimitives';
import { PromotionListRow } from '@/components/seller/promotions/PromotionListRow';
import { PromoteComposerSheet } from '@/components/seller/promotions/PromoteComposerSheet';
import { EndPromotionConfirmSheet } from '@/components/seller/promotions/EndPromotionConfirmSheet';
import { useSellerPromotionsWorkflow } from '@/components/seller/promotions/useSellerPromotionsWorkflow';

export default function SellerPromotionsPage() {
  const workflow = useSellerPromotionsWorkflow();

  const {
    counts,
    promotions,
    action,
    create,
    myListings,
    confirmEnd,
    setConfirmEnd,
    composerOpen,
    setComposerOpen,
    runAction,
    handleCreate,
    rows,
    liveMode,
  } = workflow;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 md:pt-12 lg:max-w-[1440px]">
      <h1 className="text-screen-title text-text-primary">Promoted listings</h1>
      <SellerSectionNav toPost={counts.toPost} posted={counts.posted} />

      {promotions.isLoading ? (
        <PromotionsSkeleton />
      ) : promotions.isError ? (
        <div className="mt-8">
          <EmptyState
            icon="alert"
            title="Couldn't load promotions"
            subtitle="We couldn't reach your sponsored listings. Try again in a moment."
            actionLabel="Retry"
            onAction={() => void promotions.refetch()}
          />
        </div>
      ) : (
        <>
          <p className="mt-5 text-body text-text-secondary">
            Sponsored listings occupy labelled placements in discovery. You pay a flat daily fee
            from your balance — impressions and taps below are real recorded events.
          </p>

          {rows.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon="trending"
                title="Nothing promoted yet"
                subtitle="Boost a live listing to reach more buyers in feeds and search."
                actionLabel="Promote a listing"
                onAction={() => setComposerOpen(true)}
              />
            </div>
          ) : (
            <ul className="mt-5 divide-y divide-border-subtle border-y border-border-subtle">
              {rows.map((row) => (
                <PromotionListRow
                  key={row.promotion.id}
                  row={row}
                  pending={action.isPending}
                  onAction={runAction}
                  onRequestEnd={(id) => setConfirmEnd(id)}
                />
              ))}
            </ul>
          )}

          {!liveMode ? (
            <p className="mt-3 flex items-start gap-1.5 text-meta text-text-muted">
              <Icon name="info" size={14} className="mt-px shrink-0" />
              Demo mode — promotions you create here are session-local: no spend is debited and no
              placement is delivered, so rows carry no metrics.
            </p>
          ) : null}

          {rows.length > 0 ? (
            <Button
              variant="secondary"
              size="md"
              icon="plus"
              className="mt-6"
              onClick={() => setComposerOpen(true)}
            >
              Promote another listing
            </Button>
          ) : null}
        </>
      )}

      <EndPromotionConfirmSheet
        confirmEnd={confirmEnd}
        onClose={() => setConfirmEnd(null)}
        onConfirm={(id) => runAction(id, 'end')}
      />

      <PromoteComposerSheet
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        rows={rows}
        listings={myListings.data ?? []}
        loadingListings={myListings.isLoading}
        pending={create.isPending}
        onCreate={handleCreate}
      />
    </div>
  );
}
