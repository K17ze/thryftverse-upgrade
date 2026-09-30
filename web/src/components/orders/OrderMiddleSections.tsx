'use client';

/**
 * OrderMiddleSections — renders the timeline, escrow trust, tracking scan trail,
 * physical authentication status, return case workflow, and seller review reply.
 */

import type {
  CommerceOrder,
  OrderAuthentication,
  ReturnCase,
  OrderTrackingEvent,
  DispatchExtension,
} from '@/lib/contracts/domain';
import type { OrderDetailInfo } from '@/lib/data/fixtures-commerce';
import type { ConfirmSheetState } from './ConfirmSheet';
import { EscrowBanner } from './EscrowBanner';
import { DispatchExtensionBanner } from './DispatchExtensionBanner';
import { InspectionBanner } from './InspectionBanner';
import { OrderTrackingSection } from './OrderTrackingSection';
import { OrderTimeline } from './OrderTimeline';
import { OrderAuthenticationSection } from './OrderAuthenticationSection';
import { ReturnCaseCard } from './ReturnCaseCard';
import { OrderReviewCard, type OrderReviewView } from './OrderReviewCard';
import { isCarrierFailureStatus } from './orderCapabilities';
import type { useOrderActions } from '@/lib/hooks/queries';
import { DATA_MODE } from '@/lib/api/client';

interface OrderMiddleSectionsProps {
  order: CommerceOrder;
  detail: OrderDetailInfo;
  isBuyer: boolean;
  statusKey: string;
  estimatedReleaseAt?: string | null;
  inspectionDeadlineAt?: string | null;
  inspectionWindowOpen: boolean;
  estimatedDeliveryAt?: string | null;
  etaWindow?: string | null;
  serviceName?: string | null;
  pendingExtension?: DispatchExtension | null;
  canRespondExtension: boolean;
  trackingEvents: OrderTrackingEvent[];
  authentication: OrderAuthentication | null;
  isAuthenticationError: boolean;
  returnCase: ReturnCase | null;
  sellerReview: OrderReviewView | null;
  orderReviewId?: string | null;
  busy: boolean;
  actions: ReturnType<typeof useOrderActions>;
  run: (fn: () => Promise<unknown>, toast?: string) => void;
  setConfirmSheet: (sheet: ConfirmSheetState | null) => void;
  onConfirmReceipt: () => void;
  onReportIssue: () => void;
  onCopyTracking: () => void;
}

export function OrderMiddleSections({
  order,
  detail,
  isBuyer,
  statusKey,
  estimatedReleaseAt,
  inspectionDeadlineAt,
  inspectionWindowOpen,
  estimatedDeliveryAt,
  etaWindow,
  serviceName,
  pendingExtension,
  canRespondExtension,
  trackingEvents,
  authentication,
  isAuthenticationError,
  returnCase,
  sellerReview,
  orderReviewId,
  busy,
  actions,
  run,
  setConfirmSheet,
  onConfirmReceipt,
  onReportIssue,
  onCopyTracking,
}: OrderMiddleSectionsProps) {
  const isCompleted = statusKey === 'completed';
  const showEscrow =
    isBuyer &&
    !isCompleted &&
    ['paid', 'shipped', 'in transit', 'out for delivery'].includes(statusKey);
  const showInspection = isBuyer && statusKey === 'delivered' && inspectionWindowOpen;
  const showTracking =
    !isCompleted && (!!order.trackingNumber || trackingEvents.length > 0);

  return (
    <>
      {showEscrow ? (
        <section className="border-b border-border-subtle py-4">
          <EscrowBanner status={order.status} estimatedReleaseAt={estimatedReleaseAt} />
        </section>
      ) : null}

      {pendingExtension?.status === 'pending' ? (
        <section className="border-b border-border-subtle py-4">
          <DispatchExtensionBanner
            extension={pendingExtension}
            isBuyer={isBuyer}
            canRespondExtension={canRespondExtension}
            isResponding={busy}
            onRespond={(accept) =>
              run(
                () => actions.respondExtension(accept, pendingExtension.id),
                accept ? 'Extension accepted — new deadline applies.' : 'Extension declined.',
              )
            }
          />
        </section>
      ) : null}

      {showInspection ? (
        <section id="inspection" className="border-b border-border-subtle py-4">
          <InspectionBanner
            inspectionDeadlineAt={inspectionDeadlineAt ?? null}
            onConfirmReceipt={onConfirmReceipt}
            onReportIssue={onReportIssue}
          />
        </section>
      ) : null}

      {showTracking ? (
        <section className="border-b border-border-subtle py-4">
          <OrderTrackingSection
            trackingNumber={order.trackingNumber}
            carrier={detail.carrier}
            service={detail.service}
            isBuyer={isBuyer}
            status={order.status}
            etaWindow={etaWindow ?? null}
            estimatedDeliveryAt={estimatedDeliveryAt ?? null}
            serviceName={serviceName ?? null}
            events={trackingEvents}
            onCopyTracking={onCopyTracking}
          />
        </section>
      ) : null}

      {!isCarrierFailureStatus(order.status) ? (
        <section className="border-b border-border-subtle py-4">
          <OrderTimeline order={order} detail={detail} />
        </section>
      ) : null}

      {order.verificationRequested || authentication ? (
        <section className="border-b border-border-subtle py-4">
          <OrderAuthenticationSection
            authentication={authentication}
            verificationRequested={order.verificationRequested === true}
          />
          {DATA_MODE === 'live' && isAuthenticationError ? (
            <p className="mt-1 text-caption text-text-muted">
              Verification status couldn’t be refreshed — the recorded request is shown.
            </p>
          ) : null}
        </section>
      ) : null}

      {returnCase ? (
        <section className="border-b border-border-subtle py-4">
          <ReturnCaseCard
            returnCase={returnCase}
            isBuyer={isBuyer}
            isSubmitting={busy}
            onStepIn={() =>
              setConfirmSheet({
                title: 'Ask Thryft to step in?',
                message:
                  'Our team will review the case and decide the outcome. The seller will no longer be able to resolve it directly.',
                confirmLabel: 'Ask Thryft to step in',
                cancelLabel: 'Not yet',
                onConfirm: () =>
                  run(
                    () => actions.stepIn(returnCase.id),
                    'Thryft is now reviewing this case.',
                  ),
              })
            }
            onAction={(action) =>
              run(() => actions.returnCaseAction(action, returnCase.id), 'Return case updated.')
            }
          />
        </section>
      ) : null}

      {sellerReview ? (
        <section className="border-b border-border-subtle py-4">
          <h2 className="mb-3 text-body-emphasis font-semibold text-text-primary">
            Buyer review
          </h2>
          <OrderReviewCard
            review={sellerReview}
            busy={busy}
            onSubmit={(text) =>
              run(
                () =>
                  actions.respondToReview(
                    DATA_MODE === 'live' && orderReviewId ? orderReviewId : order.id,
                    text,
                  ),
                'Response published.',
              )
            }
          />
        </section>
      ) : null}
    </>
  );
}
