'use client';

/**
 * /offers — the offer lifecycle surface. Received / Sent tabs, actionable
 * rows (accept / decline / counter / withdraw), a confirmation sheet
 * ahead of every money/exit write (port of the native OffersScreen's
 * ConfirmationSheet ceremony), a live 15s poll while mounted, ?listing=
 * scoping for the manage-listing "View offers" deep link, and skeleton +
 * per-tab empty states.
 */

import { Suspense, useId } from 'react';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, tabId, tabPanelId } from '@/components/ui/Tabs';
import { RowSkeleton } from '@/components/orders/RowSkeleton';
import { OfferConfirmSheet } from '@/components/offers/OfferConfirmSheet';
import { OffersScopeBanner } from '@/components/offers/OffersScopeBanner';
import { OffersListContent } from '@/components/offers/OffersListContent';
import { useOffersWorkflow } from '@/components/offers/useOffersWorkflow';

// The sheet mounts only behind counterTarget — lazy keeps it off the
// offers route's initial bundle (same grammar as the PDP consumers).
const OfferSheet = dynamic(
  () => import('@/components/pdp/OfferSheet').then((m) => m.OfferSheet),
  { ssr: false },
);

function OffersView() {
  const {
    router,
    user,
    sessionLoading,
    viewerId,
    scopedListingId,
    scopedListing,
    tab,
    setTab,
    tabCounts,
    offers,
    loadError,
    retryLoad,
    visible,
    nowMs,
    handleAction,
    confirm,
    confirmBusy,
    confirmListing,
    setConfirm,
    runConfirmed,
    counterTarget,
    counterListing,
    setCounterTarget,
    handleSendCounter,
  } = useOffersWorkflow();
  const tabsId = useId();

  return (
    <div className="mx-auto max-w-[820px] px-4 py-8 sm:px-6 lg:max-w-[1280px]">
      <h1 className="text-screen-title text-text-primary">Offers</h1>

      {/* Listing scope — the manage-listing "View offers" deep link names
          the item and carries the reset back to the full list. */}
      <OffersScopeBanner
        scopedListingId={scopedListingId}
        scopedListing={scopedListing}
      />

      <Tabs
        className="-mx-4 mt-4 sm:-mx-6"
        railClassName="px-1 sm:px-3"
        tabs={[
          { key: 'received', label: 'Received', count: tabCounts.received },
          { key: 'sent', label: 'Sent', count: tabCounts.sent },
        ]}
        active={tab}
        onChange={setTab}
        ariaLabel="Offer sections"
        idBase={tabsId}
      />

      <div
        className="mt-5"
        role="tabpanel"
        id={tabPanelId(tabsId, tab)}
        aria-labelledby={tabId(tabsId, tab)}
      >
        <OffersListContent
          sessionLoading={sessionLoading}
          user={user}
          offers={offers}
          loadError={loadError}
          retryLoad={retryLoad}
          visible={visible}
          tab={tab}
          scopedListingId={scopedListingId}
          viewerId={viewerId}
          nowMs={nowMs}
          onAction={handleAction}
          onNavigateAuth={() => router.push('/auth')}
          onNavigateExplore={() => router.push('/explore')}
        />
      </div>

      {/* Confirmation ceremony — every accept/decline/cancel waits here
          until the confirm button fires the mutation. */}
      <OfferConfirmSheet
        confirm={confirm}
        viewerId={viewerId}
        listingTitle={confirmListing?.title}
        busy={confirmBusy}
        onConfirm={runConfirmed}
        onClose={() => setConfirm(null)}
      />

      {/* Counter sheet — reuses the PDP offer grammar */}
      {counterTarget && counterListing ? (
        <OfferSheet
          open={!!counterTarget}
          onClose={() => setCounterTarget(null)}
          listing={counterListing}
          counterTo={{
            amount: counterTarget.amount,
            label: counterTarget.counterRound > 0 ? 'Their counter' : 'Their offer',
          }}
          onSend={handleSendCounter}
        />
      ) : null}
    </div>
  );
}

export default function OffersPage() {
  return (
    // OffersView reads ?listing= via useSearchParams — the boundary keeps
    // the prerender bailout painting structure, not blank (same grammar
    // as /sell and /settings).
    <Suspense
      fallback={
        <div
          className="mx-auto max-w-[820px] px-4 py-8 sm:px-6 lg:max-w-[1280px]"
          aria-busy
          aria-label="Loading offers"
        >
          <Skeleton className="h-8 w-32" />
          <Skeleton className="mt-4 h-10 w-72" />
          <div className="mt-5">
            <RowSkeleton />
          </div>
        </div>
      }
    >
      <OffersView />
    </Suspense>
  );
}
