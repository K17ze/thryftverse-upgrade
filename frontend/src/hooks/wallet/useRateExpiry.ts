import React, { useEffect, useState } from 'react';

// -- Rate expiry: rates are valid for 30 minutes from the timestamp --
const RATE_VALIDITY_MINUTES = 30;

/**
 * useRateExpiry — owns the FX-rate freshness surface for the convert flow:
 * the "rate as of" timestamp label, the 30-minute validity countdown and
 * the expired flag that gates the inline refresh affordance.
 */
export function useRateExpiry(rateUpdatedAt: number) {
  // -- Rate timestamp (when the rate was captured) --
  const rateTimestampLabel = React.useMemo(() => {
    if (!rateUpdatedAt) return null;
    const date = new Date(rateUpdatedAt);
    if (!Number.isFinite(date.getTime())) return null;
    return date.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit' });
  }, [rateUpdatedAt]);

  const [rateExpiryMs, setRateExpiryMs] = useState<number | null>(null);

  useEffect(() => {
    if (!rateUpdatedAt) {
      setRateExpiryMs(null);
      return;
    }
    const expiry = new Date(rateUpdatedAt).getTime() + RATE_VALIDITY_MINUTES * 60 * 1000;
    setRateExpiryMs(expiry);
  }, [rateUpdatedAt]);

  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    if (rateExpiryMs === null) return;
    const interval = setInterval(() => {
      const remaining = rateExpiryMs - Date.now();
      setRemainingMs(Math.max(0, remaining));
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [rateExpiryMs]);

  const rateExpiryLabel = React.useMemo(() => {
    if (remainingMs <= 0) return 'expired';
    const mins = Math.floor(remainingMs / 60000);
    const secs = Math.floor((remainingMs % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, [remainingMs]);

  const isRateExpired = remainingMs <= 0 && rateExpiryMs !== null;

  return {
    rateTimestampLabel,
    rateExpiryMs,
    rateExpiryLabel,
    isRateExpired,
  };
}
