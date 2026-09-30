'use client';

/**
 * /auctions/create — put one of your listings under the hammer.
 *
 * Orchestrated with domain components (<400 LOC standard):
 *  - AuctionItemPicker
 *  - AuctionPricingFields
 *  - AuctionScheduleFields
 *  - AuctionCommitSection
 *  - useCreateAuctionWorkflow
 */

import { EmptyState } from '@/components/ui/EmptyState';
import { useCreateAuctionWorkflow } from '@/components/auctions/create/useCreateAuctionWorkflow';
import { AuctionItemPicker } from '@/components/auctions/create/AuctionItemPicker';
import { AuctionPricingFields } from '@/components/auctions/create/AuctionPricingFields';
import { AuctionScheduleFields } from '@/components/auctions/create/AuctionScheduleFields';
import { AuctionCommitSection } from '@/components/auctions/create/AuctionCommitSection';

export default function CreateAuctionPage() {
  const workflow = useCreateAuctionWorkflow();

  const {
    router,
    isGuest,
    isLoading,
    isError,
    refetch,
    available,
    listingId,
    selected,
    startingBid,
    setStartingBid,
    durationHours,
    setDurationHours,
    buyNowOn,
    setBuyNowOn,
    buyNowInput,
    setBuyNowInput,
    reserveOn,
    setReserveOn,
    reserveInput,
    setReserveInput,
    schedule,
    setSchedule,
    startAt,
    setStartAt,
    minStart,
    errors,
    setErrors,
    creating,
    liveMode,
    pick,
    submit,
  } = workflow;

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-4 pt-6 sm:px-6">
        <div className="flex flex-col gap-4" aria-busy aria-label="Loading your listings">
          <div className="skeleton h-7 w-56 rounded-md" />
          <div className="flex gap-3">
            <div className="skeleton h-24 w-24 rounded-lg" />
            <div className="flex flex-1 flex-col gap-2 pt-2">
              <div className="skeleton h-4 w-2/3 rounded" />
              <div className="skeleton h-3 w-24 rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon="alert"
        title="Couldn't load your listings"
        subtitle="Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void refetch()}
      />
    );
  }

  if (isGuest) {
    return (
      <EmptyState
        icon="auction"
        title="Sign in to create an auction"
        subtitle="Auctions are built from your listings — sign in to list and sell."
        actionLabel="Sign in"
        onAction={() => router.push('/auth')}
      />
    );
  }

  if (available.length === 0) {
    return (
      <EmptyState
        icon="inventory"
        title="Nothing to auction yet"
        subtitle="List an item first — auctions are built from your active listings."
        actionLabel="List an item"
        onAction={() => router.push('/sell')}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-16 pt-6 sm:px-6">
      <h1 className="text-screen-title text-text-primary">Create auction</h1>
      <p className="mt-1 text-body text-text-secondary">
        Pick an item, set the opening bid, choose the window.
      </p>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-6">
        <AuctionItemPicker
          available={available}
          listingId={listingId}
          error={errors.item}
          onPick={pick}
        />

        <div className="flex flex-col gap-5 border-t border-border-subtle pt-6">
          <AuctionPricingFields
            startingBid={startingBid}
            onStartingBidChange={(val) => {
              setStartingBid(val);
              setErrors((e) => (e.startingBid ? { ...e, startingBid: undefined } : e));
            }}
            buyNowOn={buyNowOn}
            onToggleBuyNow={() => setBuyNowOn((on) => !on)}
            buyNowInput={buyNowInput}
            onBuyNowInputChange={(val) => {
              setBuyNowInput(val);
              setErrors((e) => (e.buyNow ? { ...e, buyNow: undefined } : e));
            }}
            reserveOn={reserveOn}
            onToggleReserve={() => setReserveOn((on) => !on)}
            reserveInput={reserveInput}
            onReserveInputChange={(val) => {
              setReserveInput(val);
              setErrors((e) => (e.reserve ? { ...e, reserve: undefined } : e));
            }}
            liveMode={liveMode}
            errors={errors}
          />

          <AuctionScheduleFields
            schedule={schedule}
            onScheduleChange={setSchedule}
            startAt={startAt}
            onStartAtChange={(val) => {
              setStartAt(val);
              setErrors((e) => (e.schedule ? { ...e, schedule: undefined } : e));
            }}
            minStart={minStart}
            durationHours={durationHours}
            onDurationChange={setDurationHours}
            error={errors.schedule}
          />
        </div>

        <AuctionCommitSection
          creating={creating}
          canSubmit={!!selected}
          schedule={schedule}
          liveMode={liveMode}
        />
      </form>
    </div>
  );
}
