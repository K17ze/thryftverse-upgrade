'use client';

/**
 * AlgorithmView — /agents/algorithm ("Your algorithm").
 *
 * Live mode is wired to the real intent profile
 * (GET /recommendations/intent/:userId/profile + POST .../mutate — the same
 * contract the native YourAlgorithmScreen consumes): topics carry a
 * server-side influence band, and rows the server marks non-removable
 * (history-derived) show the lock affordance — "from your activity" is now
 * a true claim. When the backend can't answer, the page shows the honest
 * unavailable state; it never renders seed topics as the user's signals.
 *
 * Fixture mode keeps the authored device-local preferences (persisted
 * zustand slice), labelled "Saved on this device".
 */

import { DATA_MODE } from '@/lib/api/client';
import { LiveAlgorithmView } from './algorithm/LiveAlgorithmView';
import { FixtureAlgorithmView } from './algorithm/FixtureAlgorithmView';

export function AlgorithmView() {
  return DATA_MODE === 'live' ? <LiveAlgorithmView /> : <FixtureAlgorithmView />;
}
