'use client';

/**
 * User payment data — addresses and payment methods the user adds during
 * checkout or manages under /settings, persisted locally. Fixture seeds live
 * in ADDRESSES / PAYMENT_METHODS; this store carries the session-created
 * extras plus management overlays (seed removals, seed edits, the resolved
 * default) — never full card numbers, only last4 + brand + expiry (same
 * contract the backend would store post-tokenisation).
 *
 * Overlay conventions mirror components/wallet/withdraw/usePayoutAccounts:
 * seeds are filtered by removedIds, patched by overrides, and exactly one
 * default is resolved — removing the default promotes the oldest remaining
 * entry so checkout never dangles.
 */

import { useMemo } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Address, PaymentMethod } from '@/lib/contracts/domain';
import { ADDRESSES, PAYMENT_METHODS } from '@/lib/data/fixtures';

export type RemoveEntryResult =
  | { ok: true; promotedToDefault?: string }
  | { ok: false; reason: 'not_found' };

type AddressFields = Omit<Address, 'id' | 'isDefault'>;

interface UserPaymentDataState {
  extraAddresses: Address[];
  extraPaymentMethods: PaymentMethod[];
  /** Seed ids the user removed — keeps deletions honest across reloads. */
  removedAddressIds: string[];
  removedPaymentMethodIds: string[];
  /** Edits applied to fixture seed addresses (extras update in place). */
  addressOverrides: Record<string, AddressFields>;
  /** Explicit default picks; null resolves to the fixture default / first. */
  defaultAddressId: string | null;
  defaultPaymentMethodId: string | null;
  /** Checkout preference — apply the wallet balance before charging a card. */
  useBalanceFirst: boolean;
  addAddress: (a: AddressFields) => Address;
  addPaymentMethod: (p: Omit<PaymentMethod, 'id' | 'isDefault'>) => PaymentMethod;
  updateAddress: (id: string, patch: AddressFields) => void;
  removeAddress: (id: string) => RemoveEntryResult;
  removePaymentMethod: (id: string) => RemoveEntryResult;
  setDefaultAddress: (id: string) => void;
  setDefaultPaymentMethod: (id: string) => void;
  setUseBalanceFirst: (v: boolean) => void;
}

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

type AddressSlice = Pick<
  UserPaymentDataState,
  'extraAddresses' | 'removedAddressIds' | 'addressOverrides' | 'defaultAddressId'
>;
type MethodSlice = Pick<
  UserPaymentDataState,
  'extraPaymentMethods' | 'removedPaymentMethodIds' | 'defaultPaymentMethodId'
>;

/** Merge seeds + extras, apply edits, resolve exactly one default. */
function resolveAddresses(state: AddressSlice): Address[] {
  const merged = [
    ...ADDRESSES.filter((a) => !state.removedAddressIds.includes(a.id)).map((a) => ({
      ...a,
      ...state.addressOverrides[a.id],
    })),
    ...state.extraAddresses,
  ];
  const resolvedId =
    state.defaultAddressId && merged.some((a) => a.id === state.defaultAddressId)
      ? state.defaultAddressId
      : (merged.find((a) => a.isDefault)?.id ?? merged[0]?.id ?? null);
  return merged.map((a) => ({ ...a, isDefault: a.id === resolvedId }));
}

function resolvePaymentMethods(state: MethodSlice): PaymentMethod[] {
  const merged = [
    ...PAYMENT_METHODS.filter((p) => !state.removedPaymentMethodIds.includes(p.id)),
    ...state.extraPaymentMethods,
  ];
  const resolvedId =
    state.defaultPaymentMethodId && merged.some((p) => p.id === state.defaultPaymentMethodId)
      ? state.defaultPaymentMethodId
      : (merged.find((p) => p.isDefault)?.id ?? merged[0]?.id ?? null);
  return merged.map((p) => ({ ...p, isDefault: p.id === resolvedId }));
}

export const useUserPaymentData = create<UserPaymentDataState>()(
  persist(
    (set, get) => ({
      extraAddresses: [],
      extraPaymentMethods: [],
      removedAddressIds: [],
      removedPaymentMethodIds: [],
      addressOverrides: {},
      defaultAddressId: null,
      defaultPaymentMethodId: null,
      useBalanceFirst: true,
      addAddress: (a) => {
        const address: Address = { ...a, id: nextId('ua'), isDefault: false };
        set((s) => ({ extraAddresses: [...s.extraAddresses, address] }));
        return address;
      },
      addPaymentMethod: (p) => {
        const method: PaymentMethod = { ...p, id: nextId('upm'), isDefault: false };
        set((s) => ({ extraPaymentMethods: [...s.extraPaymentMethods, method] }));
        return method;
      },
      updateAddress: (id, patch) =>
        set((s) => {
          if (s.extraAddresses.some((a) => a.id === id)) {
            return {
              extraAddresses: s.extraAddresses.map((a) =>
                a.id === id ? { ...a, ...patch } : a,
              ),
            };
          }
          if (ADDRESSES.some((seed) => seed.id === id)) {
            return { addressOverrides: { ...s.addressOverrides, [id]: patch } };
          }
          return s;
        }),
      removeAddress: (id) => {
        const merged = resolveAddresses(get());
        const target = merged.find((a) => a.id === id);
        if (!target) return { ok: false, reason: 'not_found' };
        const remaining = merged.filter((a) => a.id !== id);
        // Removing the default promotes the oldest remaining address —
        // a deterministic handoff, never a dangling default.
        const promoted = target.isDefault ? remaining[0]?.id : undefined;
        set((s) => {
          const overrides = { ...s.addressOverrides };
          delete overrides[id];
          return {
            removedAddressIds: ADDRESSES.some((seed) => seed.id === id)
              ? [...s.removedAddressIds, id]
              : s.removedAddressIds,
            extraAddresses: s.extraAddresses.filter((a) => a.id !== id),
            addressOverrides: overrides,
            defaultAddressId:
              promoted ?? (s.defaultAddressId === id ? null : s.defaultAddressId),
          };
        });
        return { ok: true, promotedToDefault: promoted };
      },
      removePaymentMethod: (id) => {
        const merged = resolvePaymentMethods(get());
        const target = merged.find((p) => p.id === id);
        if (!target) return { ok: false, reason: 'not_found' };
        const remaining = merged.filter((p) => p.id !== id);
        const promoted = target.isDefault ? remaining[0]?.id : undefined;
        set((s) => ({
          removedPaymentMethodIds: PAYMENT_METHODS.some((seed) => seed.id === id)
            ? [...s.removedPaymentMethodIds, id]
            : s.removedPaymentMethodIds,
          extraPaymentMethods: s.extraPaymentMethods.filter((p) => p.id !== id),
          defaultPaymentMethodId:
            promoted ?? (s.defaultPaymentMethodId === id ? null : s.defaultPaymentMethodId),
        }));
        return { ok: true, promotedToDefault: promoted };
      },
      setDefaultAddress: (id) => set({ defaultAddressId: id }),
      setDefaultPaymentMethod: (id) => set({ defaultPaymentMethodId: id }),
      setUseBalanceFirst: (v) => set({ useBalanceFirst: v }),
    }),
    {
      name: 'thryftverse.web.payment-data',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export interface SavedAddressesData {
  /** Merged addresses with edits applied and exactly one resolved default. */
  addresses: Address[];
  defaultAddress: Address | null;
  addAddress: UserPaymentDataState['addAddress'];
  updateAddress: UserPaymentDataState['updateAddress'];
  removeAddress: UserPaymentDataState['removeAddress'];
  setDefaultAddress: UserPaymentDataState['setDefaultAddress'];
}

/** The management surface read — /settings/addresses consumes this so the
 * list, edits and default all share one truth. */
export function useSavedAddresses(): SavedAddressesData {
  const extraAddresses = useUserPaymentData((s) => s.extraAddresses);
  const removedAddressIds = useUserPaymentData((s) => s.removedAddressIds);
  const addressOverrides = useUserPaymentData((s) => s.addressOverrides);
  const defaultAddressId = useUserPaymentData((s) => s.defaultAddressId);
  const addAddress = useUserPaymentData((s) => s.addAddress);
  const updateAddress = useUserPaymentData((s) => s.updateAddress);
  const removeAddress = useUserPaymentData((s) => s.removeAddress);
  const setDefaultAddress = useUserPaymentData((s) => s.setDefaultAddress);

  // Memoised so effect deps downstream don't fire on every render.
  const addresses = useMemo(
    () =>
      resolveAddresses({ extraAddresses, removedAddressIds, addressOverrides, defaultAddressId }),
    [extraAddresses, removedAddressIds, addressOverrides, defaultAddressId],
  );

  return {
    addresses,
    defaultAddress: addresses.find((a) => a.isDefault) ?? null,
    addAddress,
    updateAddress,
    removeAddress,
    setDefaultAddress,
  };
}

export interface SavedPaymentMethodsData {
  /** Merged masked methods (last4 only) with one resolved default. */
  methods: PaymentMethod[];
  defaultMethod: PaymentMethod | null;
  useBalanceFirst: boolean;
  setUseBalanceFirst: (v: boolean) => void;
  addPaymentMethod: UserPaymentDataState['addPaymentMethod'];
  removePaymentMethod: UserPaymentDataState['removePaymentMethod'];
  setDefaultPaymentMethod: UserPaymentDataState['setDefaultPaymentMethod'];
}

export function useSavedPaymentMethods(): SavedPaymentMethodsData {
  const extraPaymentMethods = useUserPaymentData((s) => s.extraPaymentMethods);
  const removedPaymentMethodIds = useUserPaymentData((s) => s.removedPaymentMethodIds);
  const defaultPaymentMethodId = useUserPaymentData((s) => s.defaultPaymentMethodId);
  const useBalanceFirst = useUserPaymentData((s) => s.useBalanceFirst);
  const setUseBalanceFirst = useUserPaymentData((s) => s.setUseBalanceFirst);
  const addPaymentMethod = useUserPaymentData((s) => s.addPaymentMethod);
  const removePaymentMethod = useUserPaymentData((s) => s.removePaymentMethod);
  const setDefaultPaymentMethod = useUserPaymentData((s) => s.setDefaultPaymentMethod);

  const methods = useMemo(
    () =>
      resolvePaymentMethods({
        extraPaymentMethods,
        removedPaymentMethodIds,
        defaultPaymentMethodId,
      }),
    [extraPaymentMethods, removedPaymentMethodIds, defaultPaymentMethodId],
  );

  return {
    methods,
    defaultMethod: methods.find((p) => p.isDefault) ?? null,
    useBalanceFirst,
    setUseBalanceFirst,
    addPaymentMethod,
    removePaymentMethod,
    setDefaultPaymentMethod,
  };
}
