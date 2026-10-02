'use client';

import * as liveService from '@/lib/api/services/live';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';
import { STATUS_LABEL } from './useHostLotBoardWorkflow';

interface LotQueueListProps {
  queue: liveService.LiveLot[];
  finished: liveService.LiveLot[];
  live: boolean;
  tableBusy: boolean;
  pinLot: (lot: liveService.LiveLot) => void;
  startBidding: (lot: liveService.LiveLot) => void;
  cancelLot: (lot: liveService.LiveLot) => void;
}

export function LotQueueList({
  queue,
  finished,
  live,
  tableBusy,
  pinLot,
  startBidding,
  cancelLot,
}: LotQueueListProps) {
  return (
    <>
      {/* Queue — scheduled lots, in position order. */}
      {queue.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {queue.map((lot) => (
            <li
              key={lot.id}
              className="flex items-center gap-3 border border-border-subtle px-3 py-2.5"
            >
              <AppImage
                src={lot.imageUrl}
                alt={lot.title}
                fill
                className="h-10 w-10 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="clamp-1 text-caption font-semibold text-text-primary">
                  {lot.title}
                </p>
                <p className="tnum mt-0.5 text-meta text-text-muted">
                  Lot {lot.lotNumber} · starts at {formatPrice(lot.startPrice)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => pinLot(lot)}
                  disabled={tableBusy}
                  className="pressable rounded-md border border-border px-2 py-1 text-meta font-semibold text-text-secondary transition-colors hover:bg-brand-subtle disabled:opacity-50"
                >
                  Pin
                </button>
                {live ? (
                  <button
                    type="button"
                    onClick={() => startBidding(lot)}
                    disabled={tableBusy}
                    className="pressable rounded-md bg-brand px-2 py-1 text-meta font-semibold text-brand-foreground transition-colors hover:bg-brand-hover disabled:opacity-50"
                  >
                    Start bidding
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => cancelLot(lot)}
                  disabled={tableBusy}
                  aria-label={`Cancel lot ${lot.lotNumber}`}
                  className="pressable relative flex h-7 w-7 items-center justify-center rounded-md after:absolute after:-inset-2 after:content-[''] text-text-muted transition-colors hover:bg-surface-alt hover:text-danger-text disabled:opacity-50"
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Earlier lots — sold/passed/cancelled history for this show. */}
      {finished.length > 0 ? (
        <ul className="mt-4 space-y-1.5">
          {finished.map((lot) => (
            <li
              key={lot.id}
              className="flex items-center justify-between gap-3 py-1"
            >
              <p className="clamp-1 text-meta text-text-muted">
                Lot {lot.lotNumber} — {lot.title}
              </p>
              <span className="tnum shrink-0 text-meta text-text-muted">
                {lot.status === 'sold'
                  ? `${formatPrice(lot.highBid)} sold`
                  : STATUS_LABEL[lot.status]}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
