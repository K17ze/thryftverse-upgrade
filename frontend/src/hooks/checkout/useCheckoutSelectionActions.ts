import { useState, useCallback, type MutableRefObject } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useNotifications } from '../useNotifications';
import {
  listUserPaymentMethods,
  type CommercePaymentMethod,
  type ShippingQuoteItem,
} from '../../services/commerceApi';
import { haptics } from '../../utils/haptics';
import {
  toPostageOptionFromQuote,
  type CheckoutPostageOption,
} from '../../utils/checkoutFlow';

// The store's SavedAddress/SavedPaymentMethod shapes are not exported —
// structural mirrors of the fields these actions read or write.
type SavedAddressInput = {
  id?: number;
  name: string;
};

type SavePaymentMethodInput = {
  id?: number;
  type: 'card' | 'bank_account' | 'apple_pay' | 'google_pay';
  label: string;
  details?: string;
  isDefault?: boolean;
};

export interface UseCheckoutSelectionActionsOptions {
  userId: string | undefined;
  /** Presence of a saved address decides the AddressForm mode. */
  savedAddress: SavedAddressInput | null;
  savedPaymentMethodId: number | undefined;
  canChangePostage: boolean;
  allowCardPayments: boolean;
  hasCapabilities: boolean;
  paymentMethodsCount: number;
  /** From useCheckoutPaymentFlow — a non-null ref means an order may need
   *  cancelling before checkout details are allowed to change. */
  createdOrderIdRef: MutableRefObject<string | null>;
  cancelStaleOrder: () => Promise<boolean>;
  savePaymentMethod: (paymentMethod: SavePaymentMethodInput) => void;
  setBackendPaymentMethods: (methods: CommercePaymentMethod[]) => void;
  setPaymentError: (message: string) => void;
  setHasAttemptedPay: (value: boolean) => void;
  setPaymentSelectorVisible: (value: boolean) => void;
  setAddCardSheetVisible: (value: boolean) => void;
  /** Opens the per-option delivery selector sheet (checkout-owned). */
  setDeliverySelectorVisible: (value: boolean) => void;
  /** Applies a picked shipping quote as the active postage option. */
  setPostageOption: (option: CheckoutPostageOption) => void;
  /** The currently applied quote — re-selecting it is a no-op. */
  selectedQuoteId: string | null;
}

/**
 * useCheckoutSelectionActions — the "change a checkout detail" handlers.
 * Each follows the same contract: clear inline validation, cancel any
 * stale in-flight order, then navigate or open a sheet. Payment and
 * address selection can mutate the order signature, so the stale-order
 * cancellation must succeed before the change is committed.
 */
export function useCheckoutSelectionActions({
  userId,
  savedAddress,
  savedPaymentMethodId,
  canChangePostage,
  allowCardPayments,
  hasCapabilities,
  paymentMethodsCount,
  createdOrderIdRef,
  cancelStaleOrder,
  savePaymentMethod,
  setBackendPaymentMethods,
  setPaymentError,
  setHasAttemptedPay,
  setPaymentSelectorVisible,
  setAddCardSheetVisible,
  setDeliverySelectorVisible,
  setPostageOption,
  selectedQuoteId,
}: UseCheckoutSelectionActionsOptions) {
  const navigation = useNavigation<any>();
  const { showError, showInfo } = useNotifications();
  const [isSelectingPayment, setIsSelectingPayment] = useState(false);

  // --- Address selection change ---
  const handleAddressPress = useCallback(async () => {
    haptics.tap();
    setHasAttemptedPay(false);

    if (createdOrderIdRef.current) {
      const cancelled = await cancelStaleOrder();
      if (!cancelled) {
        return;
      }
    }

    navigation.navigate('AddressForm', {
      mode: savedAddress ? 'edit' : 'add',
      source: 'checkout',
    });
  }, [cancelStaleOrder, navigation, savedAddress, setHasAttemptedPay]);

  // --- Payment selection change ---
  const handleSelectPaymentMethod = useCallback(async (
    method: CommercePaymentMethod
  ) => {
    if (method.id === savedPaymentMethodId) {
      setPaymentSelectorVisible(false);
      return;
    }

    if (createdOrderIdRef.current) {
      setIsSelectingPayment(true);
      const cancelled = await cancelStaleOrder();
      setIsSelectingPayment(false);

      if (!cancelled) {
        return;
      }
    }

    savePaymentMethod({
      id: method.id,
      type: method.type,
      label: method.label,
      details: method.details ?? undefined,
      isDefault: method.isDefault,
    });

    setPaymentSelectorVisible(false);
  }, [savedPaymentMethodId, cancelStaleOrder, savePaymentMethod, setPaymentSelectorVisible]);

  // --- Add-card success handler ---
  const handleAddCardSuccess = useCallback(async () => {
    if (!userId) return;

    try {
      const methods = await listUserPaymentMethods(userId);
      setBackendPaymentMethods(methods);

      const preferred = methods.find((pm) => pm.isDefault) ?? methods[0];

      if (preferred) {
        if (preferred.id !== savedPaymentMethodId) {
          if (createdOrderIdRef.current) {
            const cancelled = await cancelStaleOrder();
            if (!cancelled) {
              showInfo('Cannot change selection', 'The existing order is still active.');
              return;
            }
          }

          savePaymentMethod({
            id: preferred.id,
            type: preferred.type,
            label: preferred.label,
            details: preferred.details ?? undefined,
            isDefault: preferred.isDefault,
          });
        }
      }
    } catch {
      setPaymentError('Payment methods could not be refreshed after adding card.');
    }
  }, [userId, savedPaymentMethodId, cancelStaleOrder, savePaymentMethod, setBackendPaymentMethods, setPaymentError, showInfo]);

  // --- Payment method change press ---
  const handlePaymentPress = useCallback(() => {
    haptics.tap();
    setHasAttemptedPay(false);
    if (!allowCardPayments && hasCapabilities) {
      showError('Cards unavailable', 'Cards are unavailable for your region.');
      navigation.navigate('Payments');
      return;
    }
    if (paymentMethodsCount > 1) {
      setPaymentSelectorVisible(true);
    } else {
      setAddCardSheetVisible(true);
    }
  }, [allowCardPayments, hasCapabilities, paymentMethodsCount, showError, navigation, setHasAttemptedPay, setPaymentSelectorVisible, setAddCardSheetVisible]);

  // --- Delivery selection change ---
  // Opens the per-option shipping sheet (speeds/carriers with real prices
  // from the persisted server quotes). The previous behaviour navigated to
  // the Postage screen, which is the seller's preferences surface — not a
  // buyer-facing checkout picker.
  const handleDeliveryPress = useCallback(() => {
    if (!canChangePostage) return;

    haptics.tap();
    setHasAttemptedPay(false);
    // Opening the sheet alone changes nothing about the order signature —
    // a created order is only cancelled when the selection actually
    // changes (see handleSelectDeliveryOption).
    setDeliverySelectorVisible(true);
  }, [canChangePostage, setHasAttemptedPay, setDeliverySelectorVisible]);

  // --- Shipping option select ---
  // Each quote is already persisted server-side with its own quoteId, so
  // applying the selection is a pure state change — the order payload picks
  // it up at pay time (the signature changes and any stale order is
  // re-created by the payment flow).
  const handleSelectDeliveryOption = useCallback(async (quote: ShippingQuoteItem) => {
    haptics.tap();
    setHasAttemptedPay(false);

    // Re-selecting the active quote leaves the order signature unchanged —
    // a created order stays valid, so just close the sheet.
    if (quote.quoteId === selectedQuoteId) {
      setDeliverySelectorVisible(false);
      return;
    }

    if (createdOrderIdRef.current) {
      const cancelled = await cancelStaleOrder();
      if (!cancelled) {
        return;
      }
    }

    setPostageOption(toPostageOptionFromQuote(quote));
    setDeliverySelectorVisible(false);
  }, [selectedQuoteId, cancelStaleOrder, setHasAttemptedPay, setPostageOption, setDeliverySelectorVisible]);

  return {
    isSelectingPayment,
    handleAddressPress,
    handleSelectPaymentMethod,
    handleAddCardSuccess,
    handlePaymentPress,
    handleDeliveryPress,
    handleSelectDeliveryOption,
  };
}
