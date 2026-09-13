import { useCallback } from 'react';
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import { Linking } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useToast } from '../../context/ToastContext';
import { haptics } from '../../utils/haptics';
import { parseApiError, fetchJson } from '../../lib/apiClient';
import { shipOrder, assertHandoff, proposeDispatchExtension } from '../../services/commerceApi';
import {
  classifyShippingError,
  SHIPPING_ERROR_RECOVERY,
  getDropOffUrl,
  type ShippingProviderErrorCode } from '../../services/shippingProviderRegistry';
import type { FulfilmentSnapshot } from '../../components/orders/orderCapabilities';
import type { SellerFulfilmentConfirmSheetState } from './useSellerFulfilment';

export interface UseSellerFulfilmentActionsParams {
  orderId: string;
  snapshot: FulfilmentSnapshot | null;
  serviceName: string | null;
  canDispatch: boolean;
  canProposeExtension: boolean;
  trackingNumber: string;
  setTrackingNumber: Dispatch<SetStateAction<string>>;
  shippingProvider: string;
  isDispatching: boolean;
  setIsDispatching: Dispatch<SetStateAction<boolean>>;
  isGeneratingLabel: boolean;
  setIsGeneratingLabel: Dispatch<SetStateAction<boolean>>;
  generatedLabelUrl: string | null;
  setGeneratedLabelUrl: Dispatch<SetStateAction<string | null>>;
  setLabelError: Dispatch<SetStateAction<string | null>>;
  setLabelErrorCode: Dispatch<SetStateAction<ShippingProviderErrorCode | null>>;
  extensionDays: number | null;
  setExtensionDays: Dispatch<SetStateAction<number | null>>;
  setExtensionPickerOpen: Dispatch<SetStateAction<boolean>>;
  isProposingExtension: boolean;
  setIsProposingExtension: Dispatch<SetStateAction<boolean>>;
  setConfirmSheet: Dispatch<SetStateAction<SellerFulfilmentConfirmSheetState>>;
  isMountedRef: MutableRefObject<boolean>;
  fetchOrder: () => Promise<void>;
}

export interface UseSellerFulfilmentActionsResult {
  handleGenerateLabel: () => Promise<void>;
  handleShowQR: () => void;
  handleFindDropOff: () => void;
  handleManualDispatch: () => Promise<void>;
  handleDroppedOffRecovery: () => Promise<void>;
  handleProposeExtension: () => Promise<void>;
  /** Footer press — builds the confirmation sheet (populated form gets the
   *  real confirm; empty form gets an informational sheet). */
  handleDispatchConfirmPress: () => void;
}

/**
 * Interaction handlers for SellerFulfilmentScreen: integrated label
 * generation, QR preview, drop-off finder, manual dispatch, dropped-off
 * handoff recovery, and dispatch-extension proposal.
 *
 * All logic relocated verbatim from SellerFulfilmentScreen.
 */
export function useSellerFulfilmentActions({
  orderId,
  snapshot,
  serviceName,
  canDispatch,
  canProposeExtension,
  trackingNumber,
  setTrackingNumber,
  shippingProvider,
  isDispatching,
  setIsDispatching,
  isGeneratingLabel,
  setIsGeneratingLabel,
  generatedLabelUrl,
  setGeneratedLabelUrl,
  setLabelError,
  setLabelErrorCode,
  extensionDays,
  setExtensionDays,
  setExtensionPickerOpen,
  isProposingExtension,
  setIsProposingExtension,
  setConfirmSheet,
  isMountedRef,
  fetchOrder }: UseSellerFulfilmentActionsParams): UseSellerFulfilmentActionsResult {
  const navigation = useNavigation<any>();
  const { show } = useToast();

  const handleGenerateLabel = useCallback(async () => {
    if (isGeneratingLabel) return;
    setIsGeneratingLabel(true);
    setLabelError(null);
    setLabelErrorCode(null);
    haptics.tap();
    try {
      const carrier = (snapshot?.carrierId ?? shippingProvider) || 'Royal Mail';
      const res = await fetchJson<{ shippingLabelUrl?: string; trackingNumber?: string }>(
        `/orders/${orderId}/shipping-label`,
        { method: 'POST', body: JSON.stringify({ carrier }) }
      );
      if (!isMountedRef.current) return;
      if (res.shippingLabelUrl) {
        setGeneratedLabelUrl(res.shippingLabelUrl);
        show('Shipping label ready. Show the QR code at drop-off.', 'success');
      }
      if (res.trackingNumber && !trackingNumber) {
        setTrackingNumber(res.trackingNumber);
      }
    } catch (error) {
      if (!isMountedRef.current) return;
      // Typed error classification via provider registry — no free-text matching.
      const errorCode = classifyShippingError(error);
      setLabelErrorCode(errorCode);
      setLabelError(SHIPPING_ERROR_RECOVERY[errorCode]);
    } finally {
      if (isMountedRef.current) setIsGeneratingLabel(false);
    }
  }, [isGeneratingLabel, orderId, snapshot, shippingProvider, trackingNumber, show, isMountedRef]);

  const handleShowQR = useCallback(() => {
    if (!generatedLabelUrl) return;
    haptics.tap();
    navigation.navigate('ChatMediaPreview', {
      mediaUri: generatedLabelUrl,
      mediaType: 'image',
      senderLabel: 'Shipping label / QR code' });
  }, [generatedLabelUrl, navigation]);

  const handleFindDropOff = useCallback(() => {
    const carrierId = snapshot?.carrierId ?? shippingProvider ?? null;
    const url = getDropOffUrl(carrierId);
    if (!url) {
      show('Drop-off finder not available for this carrier. Check the carrier\'s website.', 'info');
      return;
    }
    haptics.tap();
    void Linking.openURL(url).catch(() => {
      show('Unable to open drop-off finder', 'error');
    });
  }, [snapshot, shippingProvider, show]);

  // Manual dispatch: seller enters tracking and confirms.
  const handleManualDispatch = useCallback(async () => {
    if (!canDispatch || isDispatching) return;
    const tn = trackingNumber.trim();
    const carrier = shippingProvider.trim();
    if (!tn) {
      show('Enter a tracking number to confirm dispatch', 'info');
      return;
    }
    if (!carrier) {
      show('Select a carrier to confirm dispatch', 'info');
      return;
    }
    setIsDispatching(true);
    haptics.heavyPress();
    try {
      await shipOrder(orderId, {
        trackingNumber: tn,
        shippingProvider: carrier });
      show('Item dispatched. The buyer will be notified.', 'success');
      navigation.goBack();
    } catch (error) {
      show(parseApiError(error).message, 'error');
    } finally {
      if (isMountedRef.current) setIsDispatching(false);
    }
  }, [canDispatch, isDispatching, orderId, trackingNumber, shippingProvider, show, navigation, isMountedRef]);

  // Integrated shipping: the carrier's first scan is authoritative.
  // The seller does NOT confirm dispatch — the scan webhook advances state.
  // This is a recovery action for when the seller has dropped off the parcel
  // but the carrier scan hasn't appeared after a reasonable delay.
  // It does NOT mutate the canonical order status — it only records the
  // seller's handoff claim for reconciliation purposes.
  const handleDroppedOffRecovery = useCallback(async () => {
    if (isDispatching) return;
    setIsDispatching(true);
    haptics.heavyPress();
    try {
      await assertHandoff(orderId, {
        trackingNumber: trackingNumber.trim() || undefined,
        shippingProvider: serviceName ?? undefined,
        labelUrl: generatedLabelUrl ?? undefined });
      show('Handoff recorded. Waiting for carrier scan to confirm tracking.', 'success');
      navigation.goBack();
    } catch (error) {
      show(parseApiError(error).message, 'error');
    } finally {
      if (isMountedRef.current) setIsDispatching(false);
    }
    // Defect fix: `generatedLabelUrl` is read above but was missing from the
    // original dep list — the callback closed over the stale (usually null)
    // value, so `labelUrl` was sent as undefined even after a label existed.
  }, [canDispatch, isDispatching, orderId, trackingNumber, serviceName, generatedLabelUrl, show, navigation, isMountedRef]);

  // Dispatch extension: seller proposes extra days; the new deadline takes
  // effect only if the buyer accepts. 409 = one already pending.
  const handleProposeExtension = useCallback(async () => {
    if (!canProposeExtension || isProposingExtension || extensionDays == null) return;
    setIsProposingExtension(true);
    haptics.tap();
    try {
      await proposeDispatchExtension(orderId, extensionDays);
      show('Extension request sent to the buyer.', 'success');
      setExtensionPickerOpen(false);
      setExtensionDays(null);
      await fetchOrder();
    } catch (error) {
      show(parseApiError(error).message, 'error');
    } finally {
      if (isMountedRef.current) setIsProposingExtension(false);
    }
  }, [canProposeExtension, isProposingExtension, extensionDays, orderId, show, fetchOrder, isMountedRef]);

  // Footer press — opens the confirmation sheet. A populated form gets the
  // real confirm action; an empty form gets an informational sheet.
  const handleDispatchConfirmPress = useCallback(() => {
    if (trackingNumber.trim() && shippingProvider.trim()) {
      setConfirmSheet({
        visible: true,
        title: 'Confirm dispatch?',
        message: `The order will be dispatched with ${shippingProvider} tracking number ${trackingNumber.trim()}. The buyer will be notified.`,
        confirmLabel: 'Confirm dispatch',
        cancelLabel: 'Not yet',
        onConfirm: handleManualDispatch,
        variant: 'default' });
    } else {
      setConfirmSheet({
        visible: true,
        title: 'Confirm dispatch?',
        message: 'Enter a tracking number and carrier to confirm dispatch.',
        confirmLabel: 'OK',
        cancelLabel: 'Not yet',
        onConfirm: () => {},
        variant: 'default' });
    }
  }, [trackingNumber, shippingProvider, handleManualDispatch, setConfirmSheet]);

  return {
    handleGenerateLabel,
    handleShowQR,
    handleFindDropOff,
    handleManualDispatch,
    handleDroppedOffRecovery,
    handleProposeExtension,
    handleDispatchConfirmPress,
  };
}
