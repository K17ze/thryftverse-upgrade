'use client';

/**
 * OrderSheetsGroup — renders the interactive sheets and modals for order actions:
 * overflow actions, issue reporting, return requests, dispatch tracking,
 * buyer protection claims, and irreversible confirmation dialogues.
 */

import type { CommerceOrder } from '@/lib/contracts/domain';
import type { OrderActionItem } from './OrderActionsSheet';
import { OrderActionsSheet } from './OrderActionsSheet';
import { IssueReportSheet, type IssueCategory } from './IssueReportSheet';
import { ReturnRequestSheet } from './ReturnRequestSheet';
import { DispatchSheet } from './DispatchSheet';
import { BuyerProtectionSheet, type ProtectionCoverage } from './BuyerProtectionSheet';
import { ConfirmSheet, type ConfirmSheetState } from './ConfirmSheet';
import type { OrderRole } from './orderCapabilities';
import type { useOrderActions } from '@/lib/hooks/queries';
import { DATA_MODE } from '@/lib/api/client';
import * as commerceService from '@/lib/api/services/commerce';

interface OrderSheetsGroupProps {
  order: CommerceOrder;
  role: OrderRole;
  actionsOpen: boolean;
  setActionsOpen: (open: boolean) => void;
  sheetActions: OrderActionItem[];
  issueOpen: boolean;
  setIssueOpen: (open: boolean) => void;
  contextualIssues: IssueCategory[];
  onSelectIssue: (category: IssueCategory, note: string, evidenceUris: string[]) => void;
  returnOpen: boolean;
  setReturnOpen: (open: boolean) => void;
  itemTitle?: string;
  dispatchOpen: boolean;
  setDispatchOpen: (open: boolean) => void;
  serviceName?: string | null;
  protectionOpen: boolean;
  setProtectionOpen: (open: boolean) => void;
  protectionCoverage: ProtectionCoverage | null;
  isProtectionLoading: boolean;
  isProtectionError: boolean;
  isBuyer: boolean;
  claimBusy: boolean;
  onFileClaim: (input: { reason: string; description: string }) => void;
  confirmSheet: ConfirmSheetState | null;
  setConfirmSheet: (sheet: ConfirmSheetState | null) => void;
  busy: boolean;
  actions: ReturnType<typeof useOrderActions>;
  run: (fn: () => Promise<unknown>, toast?: string) => void;
}

export function OrderSheetsGroup({
  order,
  role,
  actionsOpen,
  setActionsOpen,
  sheetActions,
  issueOpen,
  setIssueOpen,
  contextualIssues,
  onSelectIssue,
  returnOpen,
  setReturnOpen,
  itemTitle,
  dispatchOpen,
  setDispatchOpen,
  serviceName,
  protectionOpen,
  setProtectionOpen,
  protectionCoverage,
  isProtectionLoading,
  isProtectionError,
  isBuyer,
  claimBusy,
  onFileClaim,
  confirmSheet,
  setConfirmSheet,
  busy,
  actions,
  run,
}: OrderSheetsGroupProps) {
  return (
    <>
      <OrderActionsSheet
        open={actionsOpen}
        orderStatus={order.status}
        role={role}
        orderId={order.id}
        actions={sheetActions}
        onClose={() => setActionsOpen(false)}
      />

      <IssueReportSheet
        open={issueOpen}
        contextualIssues={contextualIssues}
        onSelect={onSelectIssue}
        onClose={() => setIssueOpen(false)}
      />

      <ReturnRequestSheet
        open={returnOpen}
        orderTotalGbp={order.totalPrice}
        itemTitle={itemTitle}
        onSubmit={(input) => {
          setReturnOpen(false);
          run(
            () => actions.requestReturn(input),
            'Return requested — the seller has been notified.',
          );
        }}
        onClose={() => setReturnOpen(false)}
      />

      <DispatchSheet
        open={dispatchOpen}
        defaultCarrier={serviceName}
        busy={busy}
        onSubmit={({ trackingNumber, carrier }) => {
          setDispatchOpen(false);
          run(
            () =>
              DATA_MODE === 'live'
                ? commerceService.shipOrder(order.id, {
                    trackingNumber,
                    shippingProvider: carrier,
                  })
                : actions.markDispatched(trackingNumber),
            'Marked as dispatched — the buyer has been notified.',
          );
        }}
        onAssertHandoff={(input) => {
          setDispatchOpen(false);
          run(
            () =>
              actions.assertHandoff({
                trackingNumber: input.trackingNumber,
                shippingProvider: input.carrier,
              }),
            'Handoff recorded — tracking updates when the carrier scans.',
          );
        }}
        onClose={() => setDispatchOpen(false)}
      />

      <BuyerProtectionSheet
        open={protectionOpen}
        coverage={protectionCoverage}
        loading={isProtectionLoading}
        error={isProtectionError}
        canClaim={isBuyer}
        claimBusy={claimBusy}
        onSubmitClaim={onFileClaim}
        onClose={() => setProtectionOpen(false)}
      />

      <ConfirmSheet
        sheet={confirmSheet}
        busy={busy}
        onDismiss={() => setConfirmSheet(null)}
      />
    </>
  );
}
