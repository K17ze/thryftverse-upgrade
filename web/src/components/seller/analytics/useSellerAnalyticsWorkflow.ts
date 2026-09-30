import { useMemo, useState } from 'react';
import {
  useFulfilmentCounts,
  useNeedsAttention,
  useSellerAnalytics,
  type SellerAnalyticsRange,
} from '@/lib/hooks/seller-queries';
import {
  type AnalyticsPreset,
  presetRange,
} from './SellerAnalyticsPrimitives';

export function useSellerAnalyticsWorkflow() {
  const counts = useFulfilmentCounts();
  const [preset, setPreset] = useState<AnalyticsPreset>('30d');
  const [customSheet, setCustomSheet] = useState(false);
  const [customDraft, setCustomDraft] = useState<SellerAnalyticsRange>(() =>
    presetRange('30d'),
  );
  const [customRange, setCustomRange] = useState<SellerAnalyticsRange | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);

  const range = useMemo<SellerAnalyticsRange>(
    () =>
      preset === 'custom' && customRange
        ? customRange
        : presetRange(preset === 'custom' ? '30d' : preset),
    [preset, customRange],
  );

  const analytics = useSellerAnalytics(range);
  const attention = useNeedsAttention(range);

  const openCustomSheet = () => {
    setCustomDraft(range);
    setCustomError(null);
    setCustomSheet(true);
  };

  const closeCustomSheet = () => {
    setCustomSheet(false);
  };

  const applyCustom = () => {
    const { from, to } = customDraft;
    if (!from || !to) {
      setCustomError('Pick both dates');
      return;
    }
    if (from > to) {
      setCustomError('Start must be before the end date');
      return;
    }
    setCustomError(null);
    setCustomRange({ from, to });
    setPreset('custom');
    setCustomSheet(false);
  };

  const a = analytics.data;
  const funnelBase = a && a.viewsTotal > 0 ? a.viewsTotal : null;

  return {
    counts,
    preset,
    setPreset,
    range,
    analytics,
    attention,
    data: a,
    funnelBase,
    customSheet,
    customDraft,
    setCustomDraft,
    customError,
    openCustomSheet,
    closeCustomSheet,
    applyCustom,
  };
}
