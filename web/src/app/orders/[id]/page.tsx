'use client';

/**
 * /orders/[id] — order detail surface orchestrator.
 * Follows FAANG / eBay / Vinted quality standards:
 *  - Header: Status badge, explanation, and next-action hint
 *  - Left rail: Operational banners, eBay-style purchase summary card,
 *    counterparty trust card, escrow protection strip, dispatch extension,
 *    inspection window, tracking trail, and 4-milestone timeline.
 *  - Right rail: Sticky delivery & payment facts, support entries,
 *    and capability-driven CTA buttons.
 *
 * Factored into domain components (<400 LOC standard):
 *  - OrderPurchaseSummaryCard
 *  - OrderInstrumentFactsRail
 *  - OrderCounterpartyCard
 *  - OrderBannersRail
 *  - OrderMiddleSections
 *  - OrderSheetsGroup
 *  - useOrderDetailWorkflow
 */

import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { OrderStatusBadge } from '@/components/orders/OrderRow';
import { OrderDetailSkeleton } from '@/components/orders/OrderDetailSkeleton';
import { OrderSupportSection } from '@/components/orders/OrderSupportSection';
import { isCancelledStatus } from '@/components/orders/orderCapabilities';
import { DATA_MODE } from '@/lib/api/client';
import { formatDate } from '@/lib/utils/format';
import { OrderPurchaseSummaryCard } from '@/components/orders/OrderPurchaseSummaryCard';
import { OrderInstrumentFactsRail } from '@/components/orders/OrderInstrumentFactsRail';
import { OrderCounterpartyCard } from '@/components/orders/OrderCounterpartyCard';
import { OrderBannersRail } from '@/components/orders/OrderBannersRail';
import { OrderMiddleSections } from '@/components/orders/OrderMiddleSections';
import { OrderSheetsGroup } from '@/components/orders/OrderSheetsGroup';
import {
  ACTION_LABEL,
  useOrderDetailWorkflow,
} from '@/components/orders/detail/useOrderDetailWorkflow';

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params?.id ?? '';
  const workflow = useOrderDetailWorkflow(orderId);

  const {
    router,
    user,
    sessionLoading,
    isLoading,
    isError,
    refetch,
    order,
    isBuyer,
    role,
    resolvedListing,
    counterparty,
    liveSellerLoading,
    deliveryAddress,
    paidWith,
    detail,
    enrichment,
    trackingEvents,
    returnCase,
    openTicket,
    sellerReview,
    orderReview,
    authentication,
    isAuthenticationError,
    key,
    isCompleted,
    experience,
    caps,
    pendingExtension,
    sheetActions,
    contextualIssues,
    protectionCoverage,
    protectionLoading,
    isProtectionError,
    protectionOpen,
    setProtectionOpen,
    actionsOpen,
    setActionsOpen,
    issueOpen,
    setIssueOpen,
    returnOpen,
    setReturnOpen,
    dispatchOpen,
    setDispatchOpen,
    confirmSheet,
    setConfirmSheet,
    busy,
    claimBusy,
    actions,
    run,
    handleAction,
    handleIssueSelect,
    submitProtectionClaim,
    openCounterpartyThread,
    copyTracking,
    copyOrderNumber,
  } = workflow;

  if (sessionLoading || isLoading) {
    return <OrderDetailSkeleton />;
  }

  if (!user) {
    return (
      <EmptyState
        icon="profile"
        title="Sign in to view this order"
        subtitle="Purchases and sales are tied to your account."
        actionLabel="Sign in"
        onAction={() => router.push('/auth')}
      />
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon="alert"
        title="Couldn't load this order"
        subtitle="Check your connection and try again — the order is safe."
        actionLabel="Try again"
        onAction={() => void refetch()}
      />
    );
  }

  if (!order) {
    return (
      <EmptyState
        icon="receipt"
        title="Order not found"
        subtitle="This order may have been removed, or the link is incomplete."
        actionLabel="View all orders"
        onAction={() => router.push('/orders')}
      />
    );
  }

  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6 lg:max-w-[1100px]">
      <div className="flex items-center gap-2">
        <IconButton name="back" aria-label="Back to orders" onClick={() => router.push('/orders')} className="-ml-2" />
        <p className="text-caption text-text-muted">
          Order <span className="tnum font-semibold text-text-secondary">{order.id}</span>
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-screen-title text-text-primary">
          {isBuyer ? 'Your purchase' : 'Your sale'}
        </h1>
        <OrderStatusBadge status={order.status} />
      </div>
      <p className="mt-1 text-caption text-text-secondary">
        Placed {formatDate(order.createdAt)}
      </p>
      {experience.explanation ? (
        <p className="mt-2 text-body text-text-secondary">{experience.explanation}</p>
      ) : null}
      {experience.nextActionHint && !isCompleted && !isCancelledStatus(order.status) ? (
        <p className="mt-1 flex items-center gap-1.5 text-caption font-medium text-warning-text">
          <Icon name="alert" size={14} />
          {experience.nextActionHint}
        </p>
      ) : null}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-x-10">
        <div className="min-w-0">
          <OrderBannersRail
            order={order}
            isBuyer={isBuyer}
            role={role}
            shipByDate={caps.shipByDate}
            statusKey={key}
          />

          <OrderPurchaseSummaryCard
            order={order}
            listing={resolvedListing}
            detail={detail!}
            enrichment={enrichment!}
            isBuyer={isBuyer}
            deliveryAddress={deliveryAddress}
            paidWith={paidWith}
            onCopyOrderNumber={copyOrderNumber}
          />

          <OrderCounterpartyCard
            counterparty={counterparty}
            isLoading={liveSellerLoading}
            isBuyer={isBuyer}
            onMessage={openCounterpartyThread}
          />

          <OrderMiddleSections
            order={order}
            detail={detail!}
            isBuyer={isBuyer}
            statusKey={key}
            estimatedReleaseAt={experience.estimatedReleaseAt}
            inspectionDeadlineAt={experience.inspectionDeadlineAt}
            inspectionWindowOpen={experience.inspectionWindowOpen}
            estimatedDeliveryAt={experience.estimatedDeliveryAt}
            etaWindow={caps.etaWindow}
            serviceName={caps.serviceName}
            pendingExtension={pendingExtension}
            canRespondExtension={caps.canRespondExtension}
            trackingEvents={trackingEvents}
            authentication={authentication}
            isAuthenticationError={isAuthenticationError}
            returnCase={returnCase}
            sellerReview={sellerReview}
            orderReviewId={orderReview?.id}
            busy={busy}
            actions={actions}
            run={run}
            setConfirmSheet={setConfirmSheet}
            onConfirmReceipt={() => handleAction('confirm_delivery')}
            onReportIssue={() => setIssueOpen(true)}
            onCopyTracking={copyTracking}
          />
        </div>

        <aside className="lg:sticky lg:top-20 lg:flex lg:flex-col lg:self-start">
          <OrderInstrumentFactsRail
            order={order}
            isBuyer={isBuyer}
            paidWith={paidWith}
            deliveryAddress={deliveryAddress}
            enrichment={enrichment!}
            onCopyOrderNumber={copyOrderNumber}
          />

          <section className="border-b border-border-subtle py-4 lg:order-3">
            <OrderSupportSection
              openTicket={openTicket ? { id: openTicket.id, topicLabel: openTicket.topicLabel } : null}
              onPressOpenTicket={(ticketId) => router.push(`/support/${ticketId}`)}
              contactLabel={isBuyer ? 'Contact seller' : 'Contact buyer'}
              onContact={openCounterpartyThread}
              onPressGetSupport={() => setIssueOpen(true)}
            />
          </section>

          <section className="flex flex-col gap-2 pt-5 lg:order-1 lg:pt-0">
            {DATA_MODE === 'live' && experience.primaryAction === 'pay' ? (
              <p className="text-center text-caption text-text-secondary">
                Payment isn’t confirmed yet — pay now, or the order can be cancelled below.
              </p>
            ) : null}
            {experience.primaryAction ? (
              <Button
                variant="primary"
                size="lg"
                fullWidth
                disabled={busy}
                onClick={() => handleAction(experience.primaryAction!)}
              >
                {ACTION_LABEL[experience.primaryAction]}
              </Button>
            ) : !experience.primaryAction && resolvedListing && !resolvedListing.isSold ? (
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={() => router.push(`/item/${order.listingId}`)}
              >
                Buy again
              </Button>
            ) : null}
            <Button
              variant="secondary"
              size="md"
              fullWidth
              icon="more"
              onClick={() => setActionsOpen(true)}
            >
              More actions
            </Button>
          </section>
        </aside>
      </div>

      <OrderSheetsGroup
        order={order}
        role={role}
        actionsOpen={actionsOpen}
        setActionsOpen={setActionsOpen}
        sheetActions={sheetActions}
        issueOpen={issueOpen}
        setIssueOpen={setIssueOpen}
        contextualIssues={contextualIssues}
        onSelectIssue={handleIssueSelect}
        returnOpen={returnOpen}
        setReturnOpen={setReturnOpen}
        itemTitle={resolvedListing?.title}
        dispatchOpen={dispatchOpen}
        setDispatchOpen={setDispatchOpen}
        serviceName={caps.serviceName}
        protectionOpen={protectionOpen}
        setProtectionOpen={setProtectionOpen}
        protectionCoverage={protectionCoverage}
        isProtectionLoading={protectionLoading}
        isProtectionError={isProtectionError}
        isBuyer={isBuyer}
        claimBusy={claimBusy}
        onFileClaim={submitProtectionClaim}
        confirmSheet={confirmSheet}
        setConfirmSheet={setConfirmSheet}
        busy={busy}
        actions={actions}
        run={run}
      />
    </div>
  );
}
