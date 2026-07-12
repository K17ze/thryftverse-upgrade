import { fetchJson } from '../lib/apiClient';

interface PriceAlertResponse {
  ok: true;
  alertId: string;
  enabled: boolean;
}

interface PriceAlertStatusResponse {
  ok: true;
  enabled: boolean;
}

/**
 * Enable a price-drop alert for a listing.
 * The backend will push a notification when the listing's price drops.
 */
export async function enablePriceAlert(listingId: string): Promise<string> {
  const res = await fetchJson<PriceAlertResponse>('/price-alerts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listingId }),
  });
  return res.alertId;
}

/**
 * Disable a price-drop alert for a listing.
 */
export async function disablePriceAlert(listingId: string): Promise<void> {
  await fetchJson<PriceAlertResponse>('/price-alerts', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listingId }),
  });
}

/**
 * Check whether a price-drop alert is currently enabled for a listing.
 */
export async function getPriceAlertStatus(listingId: string): Promise<boolean> {
  const res = await fetchJson<PriceAlertStatusResponse>(`/price-alerts/${encodeURIComponent(listingId)}`);
  return res.enabled;
}
