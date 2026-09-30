'use client';

/**
 * ReturnCaseCard — port of mobile ReturnCaseCard + ReturnCaseActions.
 * Flat status card: status line, requested amount, platform step-in,
 * return label/tracking, then the role/state-legal transitions.
 * Factored into domain sub-components:
 * - ReturnCasePrimitives: labels, formatters, ActionRow, FormShell
 * - ReturnCaseSellerActions: approve/decline, reverse tracking, inspection, remedy
 * - ReturnCaseBuyerActions: evidence photos, remedy acceptance, appeal
 */

import type { ReturnCase } from '@/lib/contracts/domain';
import {
  getReturnCaseStatusLabel,
  getStepInState,
  type ReturnCaseTransition,
} from '@/lib/data/fixtures-commerce';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';
import { formatDateTime } from './return/ReturnCasePrimitives';
import { ReturnCaseSellerActions } from './return/ReturnCaseSellerActions';
import { ReturnCaseBuyerActions } from './return/ReturnCaseBuyerActions';

interface Props {
  returnCase: ReturnCase;
  isBuyer: boolean;
  isSubmitting?: boolean;
  onStepIn: () => void;
  onAction: (action: ReturnCaseTransition) => void;
}

export function ReturnCaseCard({
  returnCase,
  isBuyer,
  isSubmitting = false,
  onStepIn,
  onAction,
}: Props) {
  const stepIn = getStepInState(returnCase);
  const status = returnCase.status;
  const isTerminal = status === 'closed' || status === 'refund_confirmed';

  const statusIcon: AppIconName = isTerminal
    ? 'check'
    : status === 'rejected'
      ? 'closeCircle'
      : status === 'appealed'
        ? 'shield'
        : 'clock';
  const statusColor = isTerminal
    ? 'text-success-text'
    : status === 'rejected'
      ? 'text-danger-text'
      : status === 'appealed'
        ? 'text-warning-text'
        : 'text-commerce-trust';

  return (
    <div className="flex flex-col gap-2.5" id="resolution">
      {/* Status line */}
      <div className="flex items-center gap-3">
        <Icon name={statusIcon} size={20} className={statusColor} />
        <div className="min-w-0 flex-1">
          <p className="text-body-emphasis font-medium text-text-primary">
            {getReturnCaseStatusLabel(returnCase)}
          </p>
          <p className="tnum text-caption text-text-muted">
            {returnCase.requestedAmountGbp != null
              ? `Requested refund: ${formatPrice(returnCase.requestedAmountGbp)}`
              : 'Full refund requested'}
            {' · '}
            {returnCase.reasonLabel}
          </p>
          {(returnCase.evidenceMediaUrls?.length ?? 0) > 0 ? (
            <p className="mt-0.5 flex items-center gap-1 text-caption text-text-muted">
              <Icon name="images" size={12} className="shrink-0" />
              {returnCase.evidenceMediaUrls!.length} photo
              {returnCase.evidenceMediaUrls!.length === 1 ? '' : 's'} attached
            </p>
          ) : null}
          {status === 'appealed' && returnCase.appealedAt ? (
            <p className="text-caption text-text-muted">
              Escalated {formatDateTime(returnCase.appealedAt)}
            </p>
          ) : null}
        </div>
      </div>

      {/* Platform step-in — buyer only, while the case waits on the seller */}
      {isBuyer && stepIn.state === 'pending' && stepIn.eligibleAt ? (
        <p className="text-caption text-text-secondary">
          If the seller hasn&apos;t responded by {formatDateTime(stepIn.eligibleAt)}, you can ask
          Thryft to step in.
        </p>
      ) : null}
      {isBuyer && stepIn.state === 'eligible' ? (
        <button
          type="button"
          onClick={onStepIn}
          disabled={isSubmitting}
          className="pressable flex min-h-11 items-center gap-2.5 py-1.5 text-body-emphasis font-medium text-commerce-trust disabled:opacity-50"
        >
          <Icon name="shield" size={18} />
          {isSubmitting ? 'Requesting…' : 'Ask Thryft to step in'}
        </button>
      ) : null}
      {isBuyer && stepIn.state === 'escalated' ? (
        <p className="text-caption text-text-secondary">
          Thryft is reviewing this case and will decide the outcome.
        </p>
      ) : null}

      {/* Return label + reverse tracking — only when provided */}
      {returnCase.returnLabelUrl ? (
        <a
          href={returnCase.returnLabelUrl}
          target="_blank"
          rel="noreferrer"
          className="pressable flex min-h-11 items-center gap-2.5 py-1.5 text-body-emphasis font-medium text-commerce-trust"
        >
          <Icon name="pricetag" size={16} />
          <span className="flex-1">Return shipping label</span>
          <Icon name="forward" size={14} className="text-text-muted" />
        </a>
      ) : null}
      {returnCase.returnTrackingNumber ? (
        <p className="tnum clamp-1 text-caption text-text-secondary">
          {returnCase.returnCarrier ? `${returnCase.returnCarrier} · ` : ''}
          {returnCase.returnTrackingNumber}
        </p>
      ) : null}

      {/* Legal transitions: seller vs buyer actions */}
      {!isBuyer ? (
        <ReturnCaseSellerActions
          returnCase={returnCase}
          isSubmitting={isSubmitting}
          onAction={onAction}
        />
      ) : (
        <ReturnCaseBuyerActions
          returnCase={returnCase}
          isSubmitting={isSubmitting}
          onAction={onAction}
        />
      )}
    </div>
  );
}
