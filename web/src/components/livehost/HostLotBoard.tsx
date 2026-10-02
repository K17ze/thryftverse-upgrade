'use client';

/**
 * HostLotBoard — the live-mode lot surface for the web host console, the
 * same grammar as the fixture board but backed by the real lot engine
 * (routes/liveLotEngine.ts):
 *
 *  - Queue: GET /streaming/sessions/:id/lots — scheduled rows can be
 *    pinned to the table (PUT /current-lot) or opened straight into
 *    bidding (pin + POST /lots/:id/open — the bid handler joins the
 *    pinned listing against the open lot, so both writes are needed).
 *  - On the table: GET /current-lot — the pinned lot with the live high
 *    bid and bid count; open/close/cancel/settle by status.
 *  - Add: POST /lots schedules an eligible listing from the host's own
 *    inventory (active + unsold + not already queued).
 *
 * Queries are invalidated by the host hook's SSE lot events; mutations
 * invalidate directly too so the board never relies on the stream alone.
 * One pending transition at a time, mirroring the mobile seller
 * controls' guard.
 */

import { Button } from '@/components/ui/Button';
import { useHostLotBoardWorkflow } from './lots/useHostLotBoardWorkflow';
import { CurrentLotCard } from './lots/CurrentLotCard';
import { LotQueueList } from './lots/LotQueueList';
import { AddLotSheet } from './lots/AddLotSheet';

interface HostLotBoardProps {
  sessionId: string;
  /** On air — transitions hit the live auction. Backstage renders the
   *  same board for scheduling/pinning the queue. */
  live: boolean;
}

export function HostLotBoard({ sessionId, live }: HostLotBoardProps) {
  const {
    lots,
    onTable,
    queue,
    finished,
    candidates,
    tableBusy,
    tableStatus,
    pickerOpen,
    setPickerOpen,
    run,
    pinLot,
    startBidding,
    closeLot,
    cancelLot,
    settleLot,
    addLot,
  } = useHostLotBoardWorkflow(sessionId, live);

  return (
    <section className="border-t border-border-subtle pt-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-caption font-semibold text-text-primary">
          {live ? 'Lots' : 'Lot queue'}
        </h2>
        <span className="text-meta text-text-muted">
          {(lots ?? []).length === 0
            ? 'Nothing scheduled'
            : `${(lots ?? []).length} lot${
                (lots ?? []).length === 1 ? '' : 's'
              } on this show`}
        </span>
      </div>

      {/* On the table — the pinned lot; high bid + count are live truth
          from the same polling/SSE invalidation the viewer card runs. */}
      <CurrentLotCard
        sessionId={sessionId}
        onTable={onTable}
        tableStatus={tableStatus}
        tableBusy={tableBusy}
        queueLength={queue.length}
        run={run}
        closeLot={closeLot}
        cancelLot={cancelLot}
        settleLot={settleLot}
      />

      {/* Queue — scheduled lots, in position order. Finished lots — sold/passed/cancelled. */}
      <LotQueueList
        queue={queue}
        finished={finished}
        live={live}
        tableBusy={tableBusy}
        pinLot={pinLot}
        startBidding={startBidding}
        cancelLot={cancelLot}
      />

      <Button
        variant="secondary"
        size="sm"
        icon="plus"
        onClick={() => setPickerOpen(true)}
        className="mt-4"
      >
        Add a lot
      </Button>

      {/* Lot picker — the host's own unsold inventory */}
      <AddLotSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        candidates={candidates}
        tableBusy={tableBusy}
        onAddLot={addLot}
      />
    </section>
  );
}
