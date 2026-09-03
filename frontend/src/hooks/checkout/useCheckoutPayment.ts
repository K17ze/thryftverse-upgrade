import { useState, useCallback, useEffect } from 'react';
import {
  listUserPaymentMethods,
  type CommercePaymentMethod,
} from '../../services/commerceApi';

export interface UseCheckoutPaymentOptions {
  currentUserId?: string;
  savedPaymentMethod?: CommercePaymentMethod | null;
  onSelectPaymentMethod: (pm: CommercePaymentMethod) => void;
}

export function useCheckoutPayment({
  currentUserId,
  savedPaymentMethod,
  onSelectPaymentMethod,
}: UseCheckoutPaymentOptions) {
  const [backendPaymentMethods, setBackendPaymentMethods] = useState<CommercePaymentMethod[]>([]);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);

  const loadPaymentMethods = useCallback(async () => {
    if (!currentUserId) return;
    setIsPaymentLoading(true);
    try {
      setPaymentError(null);
      const methods = await listUserPaymentMethods(currentUserId);
      setBackendPaymentMethods(methods);

      if (!savedPaymentMethod && methods.length > 0) {
        const defaultMethod = methods.find((m) => m.isDefault) ?? methods[0];
        if (defaultMethod) onSelectPaymentMethod(defaultMethod);
      }
    } catch {
      setPaymentError('Failed to load payment methods');
    } finally {
      setIsPaymentLoading(false);
    }
  }, [currentUserId, savedPaymentMethod, onSelectPaymentMethod]);

  useEffect(() => {
    loadPaymentMethods();
  }, [loadPaymentMethods]);

  return {
    backendPaymentMethods,
    paymentError,
    setPaymentError,
    isPaymentLoading,
    loadPaymentMethods,
  };
}
