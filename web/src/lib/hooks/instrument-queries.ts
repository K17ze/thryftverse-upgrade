'use client';

/**
 * Saved-instrument queries — the mode-aware truth for the /settings
 * management surfaces and the per-order payment/delivery rows.
 *
 *  - fixture: the local overlay store (useSavedAddresses /
 *    useSavedPaymentMethods) stays the single truth — reads, writes and
 *    default resolution are unchanged.
 *  - live: server rows only.
 *
 *    Addresses ride GET/POST/DELETE /users/:id/addresses. No address PATCH
 *    or set-default route exists server-side (verified
 *    backend/api/src/index.ts — only list, create, delete), so edit and
 *    re-default on existing rows are honestly absent in live: the create
 *    payload's isDefault flag is the only default write, the server
 *    auto-defaults the first address, and DELETE re-promotes the freshest
 *    remaining row when the default goes away.
 *
 *    Payment methods are the Stripe-projected GET /v2/payments/methods
 *    rail. Detach and set-default exist but key on the provider's pm_* ref
 *    (DELETE /v2/payments/methods/:providerMethodId, PATCH
 *    /v2/payments/methods/:providerMethodId/default), which the mapped
 *    PaymentMethod contract drops — each action re-reads the rail to
 *    resolve the ref (verify-then-act: a stale row answers not-found
 *    instead of mutating the wrong instrument). There is no web card-add
 *    rail: legacy POST /users/:id/payment-methods is permanently 410
 *    TOKENISED_PAYMENT_METHOD_REQUIRED, so addPaymentMethod is null in
 *    live and the card sheet self-gates into its tokenisation notice.
 *
 *    Order surfaces resolve the ids stamped on the order itself — GET
 *    /orders/:id carries addressId/paymentMethodId — matched against the
 *    same live rails. Unresolvable refs (wallet-paid, detached method,
 *    deleted address) omit the row instead of falling back to a local
 *    default.
 */

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import { fetchJson, parseApiError } from '@/lib/api/http';
import * as checkoutService from '@/lib/api/services/checkout';
import { useSession } from '@/lib/session/SessionProvider';
import {
  useSavedAddresses,
  useSavedPaymentMethods,
  type RemoveEntryResult,
} from '@/lib/store/userPaymentData';
import type { Address, PaymentMethod } from '@/lib/contracts/domain';

const IS_LIVE = DATA_MODE === 'live';

/** Stable empty list — `query.data ?? []` would allocate a fresh array
 *  every render and churn downstream memo deps. */
const EMPTY_LIST: never[] = [];

export type AddressInput = Omit<Address, 'id' | 'isDefault'>;
export type PaymentMethodInput = Omit<PaymentMethod, 'id' | 'isDefault'>;

// The same keys useCheckoutInstruments publishes — settings, checkout and
// the order pages share one cache, so a settings mutation invalidates the
// rail everywhere it is mounted.
const addressQueryKey = (userId: string | null) =>
  ['checkout', 'addresses', userId ?? 'guest'] as const;
const methodsQueryKey = (userId: string | null) =>
  ['checkout', 'payment-methods', userId ?? 'guest'] as const;

// ── Private live helpers ─────────────────────────────────────────────────────

/** DELETE /users/:userId/addresses/:addressId — the only address mutation
 *  route besides create. 404s throw through fetchJson. */
async function deleteLiveAddress(userId: string, addressId: string): Promise<void> {
  await fetchJson(
    `/users/${encodeURIComponent(userId)}/addresses/${encodeURIComponent(addressId)}`,
    { method: 'DELETE' },
  );
}

interface LivePaymentMethodRow {
  /** Numeric user_payment_methods id — matches the mapped PaymentMethod.id. */
  id: number;
  /** The pm_* ref the v2 detach/default routes key on. */
  providerPaymentMethodId?: string | null;
}

/** Fresh read of the raw methods rail to resolve a row's provider ref —
 *  verify-then-act: if the method vanished since the list rendered, this
 *  answers null instead of detaching the wrong instrument. */
async function resolveProviderMethodRef(localId: string): Promise<string | null> {
  const payload = await fetchJson<{ ok?: boolean; items?: LivePaymentMethodRow[] }>(
    '/v2/payments/methods',
  );
  const row = (payload.items ?? []).find((r) => String(r.id) === localId);
  return typeof row?.providerPaymentMethodId === 'string'
    ? row.providerPaymentMethodId
    : null;
}

/** GET /orders/:id emits the instrument ids the order was placed with;
 *  the mapped CommerceOrder contract drops them, so this reads the raw row. */
async function fetchLiveOrderInstrumentRefs(
  orderId: string,
  signal?: AbortSignal,
): Promise<{ addressId: number | null; paymentMethodId: number | null }> {
  const payload = await fetchJson<{
    ok?: boolean;
    order?: { addressId?: number | null; paymentMethodId?: number | null } | null;
  }>(`/orders/${encodeURIComponent(orderId)}`, undefined, { signal });
  const order = payload.order;
  return {
    addressId: typeof order?.addressId === 'number' ? order.addressId : null,
    paymentMethodId:
      typeof order?.paymentMethodId === 'number' ? order.paymentMethodId : null,
  };
}

// ── Addresses (settings management + shared count read) ─────────────────────

export interface ManagedAddresses {
  mode: 'fixture' | 'live';
  addresses: Address[];
  defaultAddress: Address | null;
  /** Live read still in flight (always false in fixture). */
  isLoading: boolean;
  /** Live read failed — callers show an honest retry, not an empty rail. */
  isError: boolean;
  refetch: () => void;
  /** Address PATCH doesn't exist server-side — null in live so any edit
   *  control omits itself rather than pretending to save. */
  updateAddress: ((id: string, fields: AddressInput) => void) | null;
  /** No set-default route exists — null in live. The create payload's
   *  isDefault flag is the only live default write. */
  setDefaultAddress: ((id: string) => void) | null;
  /** Both modes: fixture writes the local overlay, live POSTs the server
   *  row and re-reads so the resolved default is the server's. */
  addAddress: (fields: AddressInput, makeDefault: boolean) => Promise<Address>;
  /** Both modes; live resolves promotedToDefault from the refreshed list
   *  (the server re-promotes a default itself — the flag is only reported
   *  when the re-read actually shows a new default). */
  removeAddress: (id: string) => Promise<RemoveEntryResult>;
}

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

export interface ManagedPaymentMethods {
  mode: 'fixture' | 'live';
  methods: PaymentMethod[];
  isLoading: boolean;
  isError: boolean;
  /** The provider isn't configured (PAYMENT_PROVIDER_UNAVAILABLE, 503) —
   *  a stable condition, not a blip; callers show the tokenisation notice
   *  instead of a retry loop. */
  providerUnavailable: boolean;
  refetch: () => void;
  /** Device-local checkout preference — honest in both modes (it orders
   *  the charge source, it is never presented as server state). */
  useBalanceFirst: boolean;
  setUseBalanceFirst: (v: boolean) => void;
  /** Fixture-only local card write — null in live (no web card rail; the
   *  legacy create route is permanently 410). */
  addPaymentMethod: ((p: PaymentMethodInput) => PaymentMethod) | null;
  removePaymentMethod: (id: string) => Promise<RemoveEntryResult>;
  /** Both modes — live PATCHes the provider-bound default route. */
  setDefaultPaymentMethod: (id: string) => Promise<void>;
}

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
    // Provider-unconfigured and auth failures are stable — one retry keeps a
    // transient blip recoverable without churning a dead endpoint (same
    // posture as useCheckoutInstruments).
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
      // Detach at the provider — the local projection flips to 'detached'
      // server-side and the sync re-promotes a default when one goes away.
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

export interface OrderInstrumentFacts {
  /** The buyer's address the order was placed against — null when the
   *  order carries no addressId or the row no longer exists. */
  deliveryAddress: Address | null;
  /** The tokenised method the order charged — null when unresolvable
   *  (wallet-paid, detached, provider unconfigured) or not requested. */
  paymentMethod: PaymentMethod | null;
  isLoading: boolean;
}

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
