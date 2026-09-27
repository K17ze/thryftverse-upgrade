'use client';

/**
 * Checkout instruments — one mode-aware read for delivery addresses and
 * payment methods (the same split usePayoutAccounts established):
 *
 *  - fixture: the local overlay store (fixture seeds + session extras),
 *    unchanged.
 *  - live: server truth only. Addresses come from
 *    GET /users/:id/addresses and are created through POST on the same
 *    route — the numeric ids the order and shipping-quote routes require.
 *    Payment methods come from GET /v2/payments/methods (the
 *    Stripe-projected rail the app uses). Fixture seeds and localStorage
 *    extras are never merged into a real user's rail, and a locally
 *    persisted card is never presented as chargeable — provider-hosted
 *    tokenisation is the only card rail, and the web doesn't have one.
 */

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import * as checkoutService from '@/lib/api/services/checkout';
import { useSession } from '@/lib/session/SessionProvider';
import { useSavedAddresses, useSavedPaymentMethods } from '@/lib/store/userPaymentData';
import type { Address, PaymentMethod } from '@/lib/contracts/domain';

const IS_LIVE = DATA_MODE === 'live';

export interface CheckoutInstruments {
  mode: 'fixture' | 'live';
  /** Selectable delivery addresses — server rows in live mode. */
  addresses: Address[];
  defaultAddress: Address | null;
  /** Selectable payment methods — tokenised provider rows in live mode. */
  paymentMethods: PaymentMethod[];
  /** Live instrument reads still in flight (always false in fixture). */
  isLoading: boolean;
  /** The live addresses read failed — show an honest retry, not an empty rail. */
  addressesError: boolean;
  /** The live payment-methods read failed (provider unconfigured, network). */
  paymentMethodsError: boolean;
  refetchInstruments: () => void;
  /**
   * Create a delivery address. Live mode POSTs to /users/:id/addresses and
   * resolves with the server row (numeric id) once the read is invalidated;
   * fixture mode writes the local overlay and resolves with it.
   */
  addAddress: (
    fields: Omit<Address, 'id' | 'isDefault'>,
    makeDefault: boolean,
  ) => Promise<Address>;
  /**
   * Fixture-mode local card write. Live mode has no client-side card rail —
   * POST /users/:id/payment-methods is permanently 410 and provider
   * tokenisation is app-only — so this throws rather than persisting a raw
   * card that checkout would present as chargeable.
   */
  addPaymentMethod: (p: Omit<PaymentMethod, 'id' | 'isDefault'>) => PaymentMethod;
}

export function useCheckoutInstruments(): CheckoutInstruments {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const qc = useQueryClient();

  // Fixture overlay reads — also the fixture-mode truth returned below.
  const {
    addresses: fixtureAddresses,
    defaultAddress: fixtureDefaultAddress,
    addAddress: fixtureAddAddress,
    setDefaultAddress: fixtureSetDefaultAddress,
  } = useSavedAddresses();
  const { methods: fixtureMethods, addPaymentMethod: fixtureAddPaymentMethod } =
    useSavedPaymentMethods();

  const addressesQuery = useQuery({
    queryKey: ['checkout', 'addresses', userId ?? 'guest'],
    enabled: IS_LIVE && !!userId,
    queryFn: ({ signal }) => checkoutService.fetchLiveAddresses(userId!, signal),
  });
  const methodsQuery = useQuery({
    queryKey: ['checkout', 'payment-methods', userId ?? 'guest'],
    enabled: IS_LIVE && !!userId,
    // Provider-unconfigured and auth failures are stable — one retry keeps a
    // transient blip recoverable without churning a dead endpoint.
    retry: 1,
    queryFn: ({ signal }) => checkoutService.fetchLivePaymentMethods(signal),
  });

  const addAddress = useCallback(
    async (fields: Omit<Address, 'id' | 'isDefault'>, makeDefault: boolean) => {
      if (IS_LIVE) {
        if (!userId) throw new Error('Sign in to save a delivery address');
        const created = await checkoutService.createLiveAddress(userId, {
          ...fields,
          isDefault: makeDefault,
        });
        // Re-read so the rail shows the server row (and its resolved
        // default) — the created row may have promoted itself server-side.
        await qc.invalidateQueries({
          queryKey: ['checkout', 'addresses', userId],
        });
        return created;
      }
      const saved = fixtureAddAddress(fields);
      if (makeDefault) fixtureSetDefaultAddress(saved.id);
      return saved;
    },
    [userId, qc, fixtureAddAddress, fixtureSetDefaultAddress],
  );

  const refetchInstruments = useCallback(() => {
    void addressesQuery.refetch();
    void methodsQuery.refetch();
  }, [addressesQuery, methodsQuery]);

  return useMemo<CheckoutInstruments>(() => {
    if (IS_LIVE) {
      const liveAddresses = addressesQuery.data ?? [];
      return {
        mode: 'live',
        addresses: liveAddresses,
        defaultAddress: liveAddresses.find((a) => a.isDefault) ?? null,
        paymentMethods: methodsQuery.data ?? [],
        isLoading:
          !!userId && (addressesQuery.isLoading || methodsQuery.isLoading),
        addressesError: addressesQuery.isError,
        paymentMethodsError: methodsQuery.isError,
        refetchInstruments,
        addAddress,
        addPaymentMethod: () => {
          throw new Error(
            'Cards are added through secure provider tokenisation — not available on web checkout.',
          );
        },
      };
    }
    return {
      mode: 'fixture',
      addresses: fixtureAddresses,
      defaultAddress: fixtureDefaultAddress,
      paymentMethods: fixtureMethods,
      isLoading: false,
      addressesError: false,
      paymentMethodsError: false,
      refetchInstruments,
      addAddress,
      addPaymentMethod: fixtureAddPaymentMethod,
    };
  }, [
    addressesQuery.data,
    addressesQuery.isLoading,
    addressesQuery.isError,
    methodsQuery.data,
    methodsQuery.isLoading,
    methodsQuery.isError,
    userId,
    refetchInstruments,
    addAddress,
    fixtureAddresses,
    fixtureDefaultAddress,
    fixtureMethods,
    fixtureAddPaymentMethod,
  ]);
}
