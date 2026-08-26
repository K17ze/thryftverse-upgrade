import { useState, useCallback } from 'react';
import { UserCountryCapabilities } from '../../services/capabilitiesApi';

/**
 * useCheckoutCapabilities — owns the user's country capability resolution
 * state for the checkout flow. The actual fetch happens inside the screen's
 * hydrateCheckout Promise.allSettled so the parallelism is preserved; this
 * hook owns the state and exposes setters for hydrateCheckout to call.
 */
export function useCheckoutCapabilities(_itemId: string) {
  const [checkoutCapabilities, setCheckoutCapabilities] = useState<UserCountryCapabilities | null>(null);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);

  const retryCapabilities = useCallback(() => {
    setCapabilityError(null);
  }, []);

  return {
    checkoutCapabilities,
    setCheckoutCapabilities,
    capabilityError,
    setCapabilityError,
    retryCapabilities,
  };
}
