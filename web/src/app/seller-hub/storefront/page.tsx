'use client';

/**
 * /seller-hub/storefront — the seller's shop-front editor orchestrator.
 *
 * Orchestrated with domain components (<400 LOC standard):
 *  - StorefrontStatusBanner
 *  - StorefrontBoardSection
 *  - StorefrontFeaturedRail
 *  - StorefrontRollbackSheet
 *  - SellerSectionNav
 *  - useStorefrontWorkflow
 */

import { SellerSectionNav } from '@/components/seller/SellerSectionNav';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { DATA_MODE } from '@/lib/api/client';
import { StorefrontSkeleton } from '@/components/seller/storefront/StorefrontPrimitives';
import { StorefrontStatusBanner } from '@/components/seller/storefront/StorefrontStatusBanner';
import { StorefrontBoardSection } from '@/components/seller/storefront/StorefrontBoardSection';
import { StorefrontFeaturedRail } from '@/components/seller/storefront/StorefrontFeaturedRail';
import { StorefrontRollbackSheet } from '@/components/seller/storefront/StorefrontRollbackSheet';
import { useStorefrontWorkflow } from '@/components/seller/storefront/useStorefrontWorkflow';

export default function StorefrontEditorPage() {
  const workflow = useStorefrontWorkflow();

  const {
    router,
    user,
    isGuest,
    sessionLoading,
    counts,
    storefront,
    listings,
    save,
    statusAction,
    sf,
    announcement,
    setAnnouncement,
    shipping,
    setShipping,
    returnsPolicy,
    setReturnsPolicy,
    additional,
    setAdditional,
    picked,
    featureable,
    dirty,
    busy,
    canPublish,
    togglePick,
    onSave,
    runStatus,
    status,
    statusCopy,
    confirmRollback,
    setConfirmRollback,
  } = workflow;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 md:pt-12 lg:max-w-[1440px]">
      <h1 className="text-screen-title text-text-primary">Storefront</h1>
      <SellerSectionNav toPost={counts.toPost} posted={counts.posted} />

      {sessionLoading || storefront.isLoading ? (
        <StorefrontSkeleton />
      ) : isGuest ? (
        <div className="mt-8">
          <EmptyState
            icon="bag"
            title="Sign in to edit your storefront"
            subtitle="Your announcement, policies and pinned items live on your seller account."
            actionLabel="Sign in"
            onAction={() => router.push('/auth')}
          />
        </div>
      ) : storefront.isError || !sf ? (
        <div className="mt-8">
          <EmptyState
            icon="alert"
            title="Couldn't load your storefront"
            subtitle="We couldn't reach your shop details. Try again in a moment."
            actionLabel="Retry"
            onAction={() => void storefront.refetch()}
          />
        </div>
      ) : (
        <>
          <StorefrontStatusBanner
            sf={sf}
            status={status}
            statusCopy={statusCopy}
            busy={busy}
            canPublish={canPublish}
            isPublishing={statusAction.isPending}
            onStatusAction={runStatus}
            onRequestRollback={() => setConfirmRollback(true)}
          />

          <StorefrontBoardSection
            announcement={announcement}
            onAnnouncementChange={setAnnouncement}
            shipping={shipping}
            onShippingChange={setShipping}
            returnsPolicy={returnsPolicy}
            onReturnsPolicyChange={setReturnsPolicy}
            additional={additional}
            onAdditionalChange={setAdditional}
            busy={busy}
          />

          <StorefrontFeaturedRail
            picked={picked}
            featureable={featureable}
            isLoadingListings={listings.isLoading}
            busy={busy}
            onTogglePick={togglePick}
          />

          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-5">
            <p className="flex items-start gap-1.5 text-meta text-text-muted">
              <Icon name="info" size={14} className="mt-px shrink-0" />
              {DATA_MODE === 'live'
                ? 'Saved to your account — your shop updates the moment you save.'
                : 'Demo mode — saved on this device; nothing is published to a live shop.'}
            </p>
            <div className="flex items-center gap-2">
              {user?.username ? (
                <Button
                  variant="quiet"
                  size="sm"
                  icon="forward"
                  onClick={() => router.push(`/u/${user.username}`)}
                >
                  View shop
                </Button>
              ) : null}
              <Button
                variant="primary"
                size="sm"
                disabled={!dirty || busy}
                onClick={onSave}
              >
                {save.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
          {save.isError ? (
            <p role="alert" className="mt-2 text-caption text-danger-text">
              We couldn&apos;t save that change — check the highlighted items and try again.
            </p>
          ) : null}
        </>
      )}

      <StorefrontRollbackSheet
        open={confirmRollback}
        busy={busy}
        onClose={() => setConfirmRollback(false)}
        onConfirm={() => runStatus('rollback')}
      />
    </div>
  );
}
