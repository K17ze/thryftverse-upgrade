'use client';

/**
 * DispatchExtensionBanner — port of mobile DispatchExtensionBanner.
 * A pending seller-proposed dispatch extension: the buyer accepts/declines
 * inline; the seller sees a single muted status line. Requires the real
 * capability flag so a stale extension can't offer dead CTAs.
 */

import type { DispatchExtension } from '@/lib/contracts/domain';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils/format';

interface Props {
  extension: DispatchExtension | null;
  isBuyer: boolean;
  canRespondExtension: boolean | undefined;
  isResponding?: boolean;
  onRespond: (accept: boolean) => void;
}

export function DispatchExtensionBanner({
  extension,
  isBuyer,
  canRespondExtension,
  isResponding = false,
  onRespond,
}: Props) {
  if (!extension || extension.status !== 'pending') return null;

  const proposedLabel = formatDate(extension.proposedShipBy);

  if (isBuyer && canRespondExtension) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-start gap-2.5">
          <Icon name="clock" size={16} className="mt-0.5 shrink-0 text-text-secondary" />
          <div className="min-w-0 flex-1">
            <p className="text-body font-medium text-text-primary">
              {extension.days === 1
                ? 'The seller asked for 1 extra day to dispatch'
                : `The seller asked for ${extension.days} extra days to dispatch`}
            </p>
            <p className="mt-0.5 text-caption text-text-secondary">
              {proposedLabel ? `New deadline: ${proposedLabel}` : 'New deadline not specified'}
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            variant="primary"
            size="sm"
            fullWidth
            disabled={isResponding}
            onClick={() => onRespond(true)}
          >
            {isResponding ? 'Responding…' : 'Accept'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            fullWidth
            disabled={isResponding}
            onClick={() => onRespond(false)}
          >
            Decline
          </Button>
        </div>
      </div>
    );
  }

  if (isBuyer) return null;

  return (
    <p className="flex items-center gap-2 text-caption text-text-muted">
      <Icon name="clock" size={14} />
      {proposedLabel
        ? `Extension requested — awaiting the buyer (proposed ${proposedLabel}).`
        : 'Extension requested — awaiting the buyer.'}
    </p>
  );
}
