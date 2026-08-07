import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../store/useStore';
import { isCheckoutReady } from '../utils/checkoutFlow';

function resetStore() {
  useStore.setState(useStore.getInitialState(), true);
}

describe('checkout journey smoke', () => {
  beforeEach(() => {
    resetStore();
  });

  it('uses a server-projected card selection to unlock checkout', () => {
    const state = useStore.getState();

    expect(isCheckoutReady(state.savedAddress, state.savedPaymentMethod)).toBe(false);

    state.saveAddress({
      name: 'Ava Harper',
      streetAddress: '22 Wardrobe Lane',
      city: 'Manchester',
      postalCode: 'M1 2AB',
      countryCode: 'GB',
      country: 'United Kingdom',
    });

    let checkoutState = useStore.getState();
    expect(checkoutState.savedAddress?.city).toBe('Manchester');
    expect(isCheckoutReady(checkoutState.savedAddress, checkoutState.savedPaymentMethod)).toBe(false);

    state.savePaymentMethod({
      id: 42,
      type: 'card',
      label: 'Visa •••• 4242',
      details: 'Expires 12/28',
      isDefault: true,
    });

    checkoutState = useStore.getState();
    expect(checkoutState.savedPaymentMethod?.type).toBe('card');
    expect(checkoutState.savedPaymentMethod?.label).toContain('4242');
    expect(isCheckoutReady(checkoutState.savedAddress, checkoutState.savedPaymentMethod)).toBe(true);
  });

  it('clears a provider selection when the server no longer returns it', () => {
    const state = useStore.getState();

    state.saveAddress({
      name: 'Noah Clark',
      streetAddress: '71 Archive Street',
      city: 'London',
      postalCode: 'EC1A 1BB',
      countryCode: 'GB',
      country: 'United Kingdom',
    });
    state.savePaymentMethod({
      id: 43,
      type: 'card',
      label: 'Mastercard •••• 4444',
      details: 'Expires 04/30',
      isDefault: false,
    });

    let checkoutState = useStore.getState();
    expect(checkoutState.savedPaymentMethod?.id).toBe(43);
    expect(isCheckoutReady(checkoutState.savedAddress, checkoutState.savedPaymentMethod)).toBe(true);

    state.clearSavedPaymentMethod();
    checkoutState = useStore.getState();
    expect(isCheckoutReady(checkoutState.savedAddress, checkoutState.savedPaymentMethod)).toBe(false);
  });
});
