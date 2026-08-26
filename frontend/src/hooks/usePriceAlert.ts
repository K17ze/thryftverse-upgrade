import { useState, useEffect, useCallback } from 'react';
import { enablePriceAlert, disablePriceAlert, getPriceAlertStatus } from '../services/priceAlertsApi';

// ───────────────────────────────────────────────────────────────────────────
// usePriceAlert — owns the price-drop alert toggle state for ItemDetailScreen.
//
// Fetches the initial backend status for the listing, then exposes a toggle
// handler that optimistically updates the flag and rolls back on failure.
// Extracted from the screen so the orchestrator only wires the switch.
// ───────────────────────────────────────────────────────────────────────────

export interface UsePriceAlertOptions {
  itemId: string | null | undefined;
  show: (message: string, kind: 'success' | 'info' | 'error') => void;
}

export interface UsePriceAlertReturn {
  priceAlertEnabled: boolean;
  priceAlertLoading: boolean;
  handleTogglePriceAlert: () => Promise<void>;
}

export function usePriceAlert({ itemId, show }: UsePriceAlertOptions): UsePriceAlertReturn {
  const [priceAlertEnabled, setPriceAlertEnabled] = useState(false);
  const [priceAlertLoading, setPriceAlertLoading] = useState(false);

  // Fetch initial price alert status from backend
  useEffect(() => {
    if (!itemId) return;
    let cancelled = false;
    getPriceAlertStatus(itemId)
      .then((enabled) => { if (!cancelled) setPriceAlertEnabled(enabled); })
      .catch(() => { /* endpoint may not exist yet — default to off */ });
    return () => { cancelled = true; };
  }, [itemId]);

  const handleTogglePriceAlert = useCallback(async () => {
    if (!itemId || priceAlertLoading) return;
    const next = !priceAlertEnabled;
    setPriceAlertLoading(true);
    setPriceAlertEnabled(next);
    try {
      if (next) {
        await enablePriceAlert(itemId);
        show('Price drop alerts enabled for this item', 'success');
      } else {
        await disablePriceAlert(itemId);
        show('Price drop alerts disabled', 'info');
      }
    } catch {
      setPriceAlertEnabled(!next);
      show('Could not update price alert. Try again.', 'error');
    } finally {
      setPriceAlertLoading(false);
    }
  }, [itemId, priceAlertEnabled, priceAlertLoading, show]);

  return {
    priceAlertEnabled,
    priceAlertLoading,
    handleTogglePriceAlert,
  };
}
