'use client';

/**
 * Saved-instrument queries — the mode-aware truth for the /settings
 * management surfaces and the per-order payment/delivery rows.
 *
 *  - fixture: the local overlay store (useSavedAddresses /
 *    useSavedPaymentMethods) stays the single truth — reads, writes and
 *    default resolution are unchanged.
 *  - live: server rows only.
 */

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { parseApiError, fetchJson } from '@/lib/api/http';
import * as checkoutService from '@/lib/api/services/checkout';
import { useSession } from '@/lib/session/SessionProvider';
import {
  useSavedAddresses,
  useSavedPaymentMethods,
  type RemoveEntryResult,
} from '@/lib/store/userPaymentData';
import type { Address, PaymentMethod } from '@/lib/contracts/domain';

import {
  IS_LIVE,
  EMPTY_LIST,
  addressQueryKey,
  methodsQueryKey,
  type AddressInput,
  type PaymentMethodInput,
  type ManagedAddresses,
  type ManagedPaymentMethods,
  type OrderInstrumentFacts,
} from './instruments/instrumentTypes';
import {
  deleteLiveAddress,
  resolveProviderMethodRef,
  fetchLiveOrderInstrumentRefs,
} from './instruments/instrumentHelpers';

export type {
  AddressInput,
  PaymentMethodInput,
  ManagedAddresses,
  ManagedPaymentMethods,
  OrderInstrumentFacts,
};

// ── Addresses (settings management + shared count read) ─────────────────────

export function useManagedAddresses(): ManagedAddresses {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const qc = useQueryClient();
  const {
    addresses: fixtureAddresses,
    defaultAddress: fixtureDefaultAddress,
    addAddress: fixtureAddAddress,
    updateAddress: fixtureUpdateAddress,
    removeAddress: fixtureRemoveAddress,
    setDefaultAddress: fixtureSetDefaultAddress,
  } = useSavedAddresses();

  const {
    data: liveAddressData,
    isLoading: addressesLoading,
    isError: addressesError,
    refetch: refetchAddresses,
  } = useQuery({
    queryKey: addressQueryKey(userId),
    enabled: IS_LIVE && !!userId,
    queryFn: ({ signal }) => checkoutService.fetchLiveAddresses(userId!, signal),
  });
  const liveAddresses = liveAddressData ?? EMPTY_LIST;

  const addAddress = useCallback(
    async (fields: AddressInput, makeDefault: boolean): Promise<Address> => {
      if (!IS_LIVE) {
        const saved = fixtureAddAddress(fields);
        if (makeDefault || fixtureAddresses.length === 0) {
          fixtureSetDefaultAddress(saved.id);
        }
        return saved;
      }
      if (!userId) throw new Error('Sign in to save a delivery address');
      const created = await checkoutService.createLiveAddress(userId, {
        ...fields,
        isDefault: makeDefault,
      });
      // Re-read so the rail shows the server row — the server auto-defaults
      // the first address and clears the flag on siblings when isDefault
      // was requested, neither of which the response alone reflects.
      await qc.invalidateQueries({ queryKey: addressQueryKey(userId) });
      return created;
    },
    [userId, qc, fixtureAddAddress, fixtureAddresses.length, fixtureSetDefaultAddress],
  );

  const removeAddress = useCallback(
    async (id: string): Promise<RemoveEntryResult> => {
      if (!IS_LIVE) return fixtureRemoveAddress(id);
      if (!userId) return { ok: false, reason: 'not_found' };
      const wasDefault = liveAddresses.some((a) => a.id === id && a.isDefault);
      await deleteLiveAddress(userId, id);
      await qc.invalidateQueries({ queryKey: addressQueryKey(userId) });
      const promoted = wasDefault
        ? qc
            .getQueryData<Address[]>(addressQueryKey(userId))
            ?.find((a) => a.isDefault)?.id
        : undefined;
      return { ok: true, promotedToDefault: promoted };
    },
    [userId, qc, liveAddresses, fixtureRemoveAddress],
  );

  return useMemo<ManagedAddresses>(() => {
    if (IS_LIVE) {
      return {
        mode: 'live',
        addresses: liveAddresses,
        defaultAddress: liveAddresses.find((a) => a.isDefault) ?? null,
        isLoading: !!userId && addressesLoading,
        isError: addressesError,
        refetch: () => void refetchAddresses(),
        updateAddress: null,
        setDefaultAddress: null,
        addAddress,
        removeAddress,
      };
    }
    return {
      mode: 'fixture',
      addresses: fixtureAddresses,
      defaultAddress: fixtureDefaultAddress,
      isLoading: false,
      isError: false,
      // Disabled query — never actually refetch the live route in fixture.
      refetch: () => {},
      updateAddress: fixtureUpdateAddress,
      setDefaultAddress: fixtureSetDefaultAddress,
      addAddress,
      removeAddress,
    };
  }, [
    liveAddresses,
    userId,
    addressesLoading,
    addressesError,
    refetchAddresses,
    fixtureAddresses,
    fixtureDefaultAddress,
    fixtureUpdateAddress,
    fixtureSetDefaultAddress,
    addAddress,
    removeAddress,
  ]);
}

// ── Payment methods (settings management) ────────────────────────────────────

export function useManagedPaymentMethods(): ManagedPaymentMethods {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const qc = useQueryClient();
  const {
    methods: fixtureMethods,
    useBalanceFirst,
    setUseBalanceFirst,
    addPaymentMethod: fixtureAddPaymentMethod,
    removePaymentMethod: fixtureRemovePaymentMethod,
    setDefaultPaymentMethod: fixtureSetDefaultPaymentMethod,
  } = useSavedPaymentMethods();

  const {
    data: liveMethodData,
    isLoading: methodsLoading,
    isError: methodsIsError,
    error: methodsError,
    refetch: refetchMethods,
  } = useQuery({
    queryKey: methodsQueryKey(userId),
    enabled: IS_LIVE && !!userId,
    retry: 1,
    queryFn: ({ signal }) => checkoutService.fetchLivePaymentMethods(signal),
  });
  const liveMethods = liveMethodData ?? EMPTY_LIST;

  const removePaymentMethod = useCallback(
    async (id: string): Promise<RemoveEntryResult> => {
      if (!IS_LIVE) return fixtureRemovePaymentMethod(id);
      const providerRef = await resolveProviderMethodRef(id);
      if (!providerRef) return { ok: false, reason: 'not_found' };
      const wasDefault = liveMethods.some((m) => m.id === id && m.isDefault);
      await fetchJson(`/v2/payments/methods/${encodeURIComponent(providerRef)}`, {
        method: 'DELETE',
      });
      await qc.invalidateQueries({ queryKey: methodsQueryKey(userId) });
      const promoted = wasDefault
        ? qc
            .getQueryData<PaymentMethod[]>(methodsQueryKey(userId))
            ?.find((m) => m.isDefault)?.id
        : undefined;
      return { ok: true, promotedToDefault: promoted };
    },
    [userId, qc, liveMethods, fixtureRemovePaymentMethod],
  );

  const setDefaultPaymentMethod = useCallback(
    async (id: string): Promise<void> => {
      if (!IS_LIVE) {
        fixtureSetDefaultPaymentMethod(id);
        return;
      }
      const providerRef = await resolveProviderMethodRef(id);
      if (!providerRef) throw new Error('Payment method not found');
      await fetchJson(
        `/v2/payments/methods/${encodeURIComponent(providerRef)}/default`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      );
      await qc.invalidateQueries({ queryKey: methodsQueryKey(userId) });
    },
    [userId, qc, fixtureSetDefaultPaymentMethod],
  );

  return useMemo<ManagedPaymentMethods>(() => {
    if (IS_LIVE) {
      return {
        mode: 'live',
        methods: liveMethods,
        isLoading: !!userId && methodsLoading,
        isError: methodsIsError,
        providerUnavailable:
          methodsIsError &&
          parseApiError(methodsError).code === 'PAYMENT_PROVIDER_UNAVAILABLE',
        refetch: () => void refetchMethods(),
        useBalanceFirst,
        setUseBalanceFirst,
        addPaymentMethod: null,
        removePaymentMethod,
        setDefaultPaymentMethod,
      };
    }
    return {
      mode: 'fixture',
      methods: fixtureMethods,
      isLoading: false,
      isError: false,
      providerUnavailable: false,
      refetch: () => {},
      useBalanceFirst,
      setUseBalanceFirst,
      addPaymentMethod: fixtureAddPaymentMethod,
      removePaymentMethod,
      setDefaultPaymentMethod,
    };
  }, [
    liveMethods,
    userId,
    methodsLoading,
    methodsIsError,
    methodsError,
    refetchMethods,
    useBalanceFirst,
    setUseBalanceFirst,
    fixtureMethods,
    fixtureAddPaymentMethod,
    removePaymentMethod,
    setDefaultPaymentMethod,
  ]);
}

// ── Order instrument facts (order detail + receipt) ──────────────────────────

/**
 * Per-order instrument resolution — live mode only; fixture callers keep
 * the session-store defaults they already render. Seller views resolve
 * nothing: the address and card belong to the buyer.
 */
export function useOrderInstrumentFacts(
  orderId: string,
  isBuyer: boolean,
  options?: { resolvePaymentMethod?: boolean },
): OrderInstrumentFacts {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const resolvePaymentMethod = options?.resolvePaymentMethod !== false;

  const refsQuery = useQuery({
    queryKey: ['order', orderId, 'instrument-refs'],
    enabled: IS_LIVE && isBuyer && !!orderId,
    staleTime: 60_000,
    queryFn: ({ signal }) => fetchLiveOrderInstrumentRefs(orderId, signal),
  });
  const addressId = refsQuery.data?.addressId ?? null;
  const paymentMethodId = refsQuery.data?.paymentMethodId ?? null;

  const addressesQuery = useQuery({
    queryKey: addressQueryKey(userId),
    enabled: IS_LIVE && isBuyer && !!userId && addressId !== null,
    queryFn: ({ signal }) => checkoutService.fetchLiveAddresses(userId!, signal),
  });
  const methodsQuery = useQuery({
    queryKey: methodsQueryKey(userId),
    enabled:
      IS_LIVE && isBuyer && !!userId && resolvePaymentMethod && paymentMethodId !== null,
    retry: 1,
    queryFn: ({ signal }) => checkoutService.fetchLivePaymentMethods(signal),
  });

  const deliveryAddress =
    IS_LIVE && addressId !== null
      ? (addressesQuery.data ?? []).find((a) => a.id === String(addressId)) ?? null
      : null;
  const paymentMethod =
    IS_LIVE && resolvePaymentMethod && paymentMethodId !== null
      ? (methodsQuery.data ?? []).find((m) => m.id === String(paymentMethodId)) ??
        null
      : null;

  return {
    deliveryAddress,
    paymentMethod,
    isLoading:
      IS_LIVE &&
      isBuyer &&
      (refsQuery.isLoading ||
        (addressId !== null && addressesQuery.isLoading) ||
        (resolvePaymentMethod &&
          paymentMethodId !== null &&
          methodsQuery.isLoading)),
  };
}
