/**
 * Expired live-lot sweep handler.
 *
 * Closes `live_lots` rows whose server-set `closes_at` deadline has passed.
 * Every close goes through the shared engine path (`closeLiveLot` via
 * `sweepDueLiveLots`) — the same transaction the host-facing close route
 * runs — so auto-close produces the identical status transition,
 * `live_lot_events` entries and realtime fan-out. Settlement remains a
 * separate, explicit step (the `/lots/:lotId/settle` route).
 *
 * Scheduled by `startLiveLotSweepScheduler` (API) and executed here via the
 * infra queue; in production this runs inside the standalone worker
 * container alongside the auction sweep.
 */
import { db } from '../../db/pool.js';
import { sweepDueLiveLots } from '../../routes/liveLotEngine.js';

export async function sweepExpiredLiveLots(reason: 'interval' | 'manual'): Promise<number> {
  const { closedLots, failedLots } = await sweepDueLiveLots(db);
  // A persistently failing lot must be observable — otherwise it is re-swept
  // forever with zero trace. Log each failure; the sweep itself is per-lot
  // isolated so one bad lot never aborts the pass.
  for (const failure of failedLots ?? []) {
    console.error(
      `[live-lot-sweep] close failed for lot ${failure.lotId} (session=${failure.sessionId}, reason=${reason}): ${failure.error}`,
    );
  }
  return closedLots.length;
}
