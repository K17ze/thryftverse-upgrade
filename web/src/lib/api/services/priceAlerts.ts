/**
 * Web price-alert service — mirrors frontend/src/services/priceAlertsApi.ts.
 * These are LISTING price-drop alerts (the `price_alerts` table), a
 * different contract from the Co-Own asset alerts under /co-own/price-alerts.
 * All three routes are member-scoped (resolveAuthenticatedUserId): the PDP
 * gates the affordance behind the signup wall and only reads status for a
 * signed-in viewer.
 */

import { fetchJson } from '../http';

interface PriceAlertResponse {
  ok: boolean;
  alertId: string;
  enabled: boolean;
}

interface PriceAlertStatusResponse {
  ok: boolean;
  enabled: boolean;
}

/**
 * Enable a price-drop alert for a listing — POST /price-alerts
 * `{ listingId }` (an optional `triggerPrice` overrides the default
 * "notify on any drop below the current price"). The write upserts on
 * (user, listing), so re-enabling is idempotent. Returns the alert id.
 */
export async function enablePriceAlert(
  listingId: string,
  triggerPrice?: number,
): Promise<string> {
  const res = await fetchJson<PriceAlertResponse>('/price-alerts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      triggerPrice !== undefined ? { listingId, triggerPrice } : { listingId },
    ),
  });
  if (!res.ok || !res.alertId) throw new Error('Price alert was not created');
  return res.alertId;
}

/**
 * Disable a price-drop alert — DELETE /price-alerts `{ listingId }`.
 * The backend soft-disables (`enabled = FALSE`); deleting an alert that
 * doesn't exist is still `{ ok: true }`, matching native's idempotent
 * treatment.
 */
export async function disablePriceAlert(listingId: string): Promise<void> {
  await fetchJson<{ ok: boolean }>('/price-alerts', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listingId }),
  });
}

/**
 * Whether the viewer's price-drop alert is currently enabled for a
 * listing — GET /price-alerts/:listingId → `{ ok, enabled }`.
 */
export async function getPriceAlertStatus(listingId: string): Promise<boolean> {
  const res = await fetchJson<PriceAlertStatusResponse>(
    `/price-alerts/${encodeURIComponent(listingId)}`,
  );
  return res.ok === true && res.enabled === true;
}
