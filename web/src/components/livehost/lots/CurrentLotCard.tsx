'use client';

import * as liveService from '@/lib/api/services/live';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { formatPrice } from '@/lib/utils/format';
import { STATUS_LABEL } from './useHostLotBoardWorkflow';

interface CurrentLotCardProps {
  sessionId: string;
  onTable: liveService.LiveLot | null | undefined;
  tableStatus: liveService.LiveLotStatus | null;
  tableBusy: boolean;
  queueLength: number;
  run: (key: string, action: () => Promise<unknown>) => Promise<void>;
  closeLot: (lot: liveService.LiveLot) => void;
  cancelLot: (lot: liveService.LiveLot) => void;
  settleLot: (lot: liveService.LiveLot) => void;
}

export function CurrentLotCard({
  sessionId,
  onTable,
  tableStatus,
  tableBusy,
  queueLength,
  run,
  closeLot,
  cancelLot,
  settleLot,
}: CurrentLotCardProps) {
  if (!onTable) {
    return (
      <p className="mt-3 border border-dashed border-border px-3 py-4 text-caption text-text-muted">
        Nothing on the table —{' '}
        {queueLength > 0
          ? 'pin a lot from the queue so viewers can bid.'
          : 'schedule a lot so viewers can bid.'}
      </p>
    );
  }

  return (
    <div className="mt-3 border border-border-subtle">
      <div className="flex items-center gap-3 border-b border-border-subtle px-3 py-2.5">
        <AppImage
          src={onTable.imageUrl}
          alt={onTable.title}
          fill
          className="h-12 w-12 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="clamp-1 text-caption font-semibold text-text-primary">
            Lot {onTable.lotNumber} — {onTable.title}
          </p>
          <p className="tnum mt-0.5 text-meta text-text-muted">
            {(onTable.bidCount ?? 0) > 0
              ? `${formatPrice(onTable.highBid)} · ${onTable.bidCount} bid${
                  onTable.bidCount === 1 ? '' : 's'
                }`
              : `Starts at ${formatPrice(onTable.startPrice)}`}
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-surface-alt px-1.5 py-0.5 text-meta font-semibold uppercase tracking-wide text-text-muted">
          {STATUS_LABEL[tableStatus ?? 'scheduled']}
        </span>
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5">
        {tableStatus === 'scheduled' ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              void run(`open-${onTable.id}`, () =>
                liveService.openStreamLot(sessionId, onTable.id, {
                  durationSeconds: liveService.DEFAULT_LOT_DURATION_SECONDS,
                }),
              )
            }
            disabled={tableBusy}
          >
            Open bidding
          </Button>
        ) : null}
        {tableStatus === 'open' || tableStatus === 'closing' ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => closeLot(onTable)}
              disabled={tableBusy}
            >
              Close lot
            </Button>
            <Button
              variant="quiet"
              size="sm"
              onClick={() => cancelLot(onTable)}
              disabled={tableBusy}
              className="text-danger-text"
            >
              Cancel
            </Button>
          </>
        ) : null}
        {tableStatus === 'sold' ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => settleLot(onTable)}
            disabled={tableBusy}
          >
            Settle — create the order
          </Button>
        ) : null}
        {tableStatus === 'passed' ? (
          <span className="text-meta text-text-muted">
            Passed with no winner — pick the next lot below.
          </span>
        ) : null}
        {tableStatus === 'cancelled' ? (
          <span className="text-meta text-text-muted">
            Cancelled — pick the next lot below.
          </span>
        ) : null}
      </div>
    </div>
  );
}
