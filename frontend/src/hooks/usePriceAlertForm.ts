import React from 'react';
import { createCoOwnPriceAlert } from '../services/marketApi';
import { haptics } from '../utils/haptics';
import { useToast } from '../context/ToastContext';

export type PriceAlertCondition = 'above' | 'below';

export interface UsePriceAlertFormResult {
  priceAlertVisible: boolean;
  alertTargetPrice: string;
  alertCondition: PriceAlertCondition;
  alertSubmitting: boolean;
  setAlertTargetPrice: React.Dispatch<React.SetStateAction<string>>;
  setAlertCondition: React.Dispatch<React.SetStateAction<PriceAlertCondition>>;
  openPriceAlert: () => void;
  closePriceAlert: () => void;
  /** Submit handler — validates input, creates the alert, and closes on success. */
  handleSubmit: () => Promise<void>;
}

/**
 * Owns the price-alert creation form state for the Co-Own asset detail
 * surface. Encapsulates visibility, target price, condition, submitting
 * flag, and the submit handler that calls the market API.
 */
export function usePriceAlertForm(assetId: string | undefined): UsePriceAlertFormResult {
  const { show } = useToast();
  const [priceAlertVisible, setPriceAlertVisible] = React.useState(false);
  const [alertTargetPrice, setAlertTargetPrice] = React.useState('');
  const [alertCondition, setAlertCondition] = React.useState<PriceAlertCondition>('above');
  const [alertSubmitting, setAlertSubmitting] = React.useState(false);

  const handleSubmit = React.useCallback(async () => {
    if (!assetId) return;
    const priceNum = parseFloat(alertTargetPrice);
    if (!priceNum || priceNum <= 0) {
      show('Enter a valid target price', 'error');
      return;
    }
    const priceMinor = Math.round(priceNum * 100);
    setAlertSubmitting(true);
    try {
      await createCoOwnPriceAlert(assetId, alertCondition, priceMinor);
      haptics.success();
      show(`Price alert set: ${alertCondition} £${priceNum.toFixed(2)}`, 'success');
      setPriceAlertVisible(false);
      setAlertTargetPrice('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create alert';
      show(message, 'error');
    } finally {
      setAlertSubmitting(false);
    }
  }, [assetId, alertTargetPrice, alertCondition, show]);

  const openPriceAlert = React.useCallback(() => setPriceAlertVisible(true), []);
  const closePriceAlert = React.useCallback(() => setPriceAlertVisible(false), []);

  return {
    priceAlertVisible,
    alertTargetPrice,
    alertCondition,
    alertSubmitting,
    setAlertTargetPrice,
    setAlertCondition,
    openPriceAlert,
    closePriceAlert,
    handleSubmit,
  };
}
