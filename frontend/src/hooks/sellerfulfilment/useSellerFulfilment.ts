import { useState, useCallback, useRef, useEffect } from 'react';
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import { getOrder, type CommerceOrder } from '../../services/commerceApi';
import { getOrderReview } from '../../services/reviewApi';
import type { ShippingProviderErrorCode } from '../../services/shippingProviderRegistry';

export interface SellerFulfilmentConfirmSheetState {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  variant: 'default' | 'danger';
}

export interface UseSellerFulfilmentResult {
  // Order data
  order: CommerceOrder | null;
  isLoading: boolean;
  loadError: string | null;
  hasReview: boolean;
  isMountedRef: MutableRefObject<boolean>;
  fetchOrder: () => Promise<void>;
  retryLoad: () => void;
  // Manual shipping form state
  trackingNumber: string;
  setTrackingNumber: Dispatch<SetStateAction<string>>;
  shippingProvider: string;
  setShippingProvider: Dispatch<SetStateAction<string>>;
  showCarrierDropdown: boolean;
  setShowCarrierDropdown: Dispatch<SetStateAction<boolean>>;
  isDispatching: boolean;
  setIsDispatching: Dispatch<SetStateAction<boolean>>;
  // Label generation state (integrated shipping)
  isGeneratingLabel: boolean;
  setIsGeneratingLabel: Dispatch<SetStateAction<boolean>>;
  generatedLabelUrl: string | null;
  setGeneratedLabelUrl: Dispatch<SetStateAction<string | null>>;
  labelError: string | null;
  setLabelError: Dispatch<SetStateAction<string | null>>;
  labelErrorCode: ShippingProviderErrorCode | null;
  setLabelErrorCode: Dispatch<SetStateAction<ShippingProviderErrorCode | null>>;
  // Dispatch extension state — seller proposes extra days; the buyer decides.
  extensionPickerOpen: boolean;
  setExtensionPickerOpen: Dispatch<SetStateAction<boolean>>;
  extensionDays: number | null;
  setExtensionDays: Dispatch<SetStateAction<number | null>>;
  isProposingExtension: boolean;
  setIsProposingExtension: Dispatch<SetStateAction<boolean>>;
  // Confirmation sheet
  confirmSheet: SellerFulfilmentConfirmSheetState;
  setConfirmSheet: Dispatch<SetStateAction<SellerFulfilmentConfirmSheetState>>;
  dismissConfirmSheet: () => void;
}

/**
 * Data + interaction state for SellerFulfilmentScreen: order fetch with
 * isMountedRef cancellation, review gating, manual-form prefill from the
 * loaded order (resume after app kill), label-generation state, dispatch
 * extension state, and the confirmation sheet.
 *
 * All logic relocated verbatim from SellerFulfilmentScreen.
 */
export function useSellerFulfilment(orderId: string): UseSellerFulfilmentResult {
  const [order, setOrder] = useState<CommerceOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasReview, setHasReview] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [confirmSheet, setConfirmSheet] = useState<SellerFulfilmentConfirmSheetState>(
    { visible: false, title: '', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', onConfirm: () => {}, variant: 'default' });

  // Manual shipping form state
  const [trackingNumber, setTrackingNumber] = useState('');
  const [shippingProvider, setShippingProvider] = useState('');
  const [showCarrierDropdown, setShowCarrierDropdown] = useState(false);

  // Label generation state (integrated shipping)
  const [isGeneratingLabel, setIsGeneratingLabel] = useState(false);
  const [generatedLabelUrl, setGeneratedLabelUrl] = useState<string | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [labelErrorCode, setLabelErrorCode] = useState<ShippingProviderErrorCode | null>(null);

  // Dispatch extension state — seller proposes extra days; the buyer decides.
  const [extensionPickerOpen, setExtensionPickerOpen] = useState(false);
  const [extensionDays, setExtensionDays] = useState<number | null>(null);
  const [isProposingExtension, setIsProposingExtension] = useState(false);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const fetchOrder = useCallback(async () => {
    try {
      const fetched = await getOrder(orderId);
      if (!isMountedRef.current) return;
      setOrder(fetched);
      setLoadError(null);

      // Pre-fill from existing order data (for resume after app kill)
      if (fetched.trackingNumber) setTrackingNumber(fetched.trackingNumber);
      if (fetched.shippingProvider) setShippingProvider(fetched.shippingProvider);
      if (fetched.shippingLabelUrl) setGeneratedLabelUrl(fetched.shippingLabelUrl);

      // Fetch review state to correctly gate review/inspect capabilities.
      try {
        const review = await getOrderReview(orderId);
        if (!isMountedRef.current) return;
        setHasReview(review !== null);
      } catch {
        if (!isMountedRef.current) return;
        setHasReview(false);
      }
    } catch (error) {
      if (!isMountedRef.current) return;
      setLoadError('Order could not be loaded. Check your connection and try again.');
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void fetchOrder();
  }, [fetchOrder]);

  const retryLoad = useCallback(() => {
    setLoadError(null);
    setIsLoading(true);
    void fetchOrder();
  }, [fetchOrder]);

  const dismissConfirmSheet = useCallback(() => {
    setConfirmSheet((prev) => ({ ...prev, visible: false }));
  }, []);

  return {
    order,
    isLoading,
    loadError,
    hasReview,
    isMountedRef,
    fetchOrder,
    retryLoad,
    trackingNumber,
    setTrackingNumber,
    shippingProvider,
    setShippingProvider,
    showCarrierDropdown,
    setShowCarrierDropdown,
    isDispatching,
    setIsDispatching,
    isGeneratingLabel,
    setIsGeneratingLabel,
    generatedLabelUrl,
    setGeneratedLabelUrl,
    labelError,
    setLabelError,
    labelErrorCode,
    setLabelErrorCode,
    extensionPickerOpen,
    setExtensionPickerOpen,
    extensionDays,
    setExtensionDays,
    isProposingExtension,
    setIsProposingExtension,
    confirmSheet,
    setConfirmSheet,
    dismissConfirmSheet,
  };
}
