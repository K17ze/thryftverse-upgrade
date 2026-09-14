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
  const { closedLots } = await sweepDueLiveLots(db);
  void reason;
  return closedLots.length;
}
