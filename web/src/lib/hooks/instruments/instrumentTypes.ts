import type { Address, PaymentMethod } from '@/lib/contracts/domain';
import { DATA_MODE } from '@/lib/api/client';
import type { RemoveEntryResult } from '@/lib/store/userPaymentData';

export const IS_LIVE = DATA_MODE === 'live';

/** Stable empty list — `query.data ?? []` would allocate a fresh array
 *  every render and churn downstream memo deps. */
export const EMPTY_LIST: never[] = [];

export type AddressInput = Omit<Address, 'id' | 'isDefault'>;
export type PaymentMethodInput = Omit<PaymentMethod, 'id' | 'isDefault'>;

// The same keys useCheckoutInstruments publishes — settings, checkout and
// the order pages share one cache, so a settings mutation invalidates the
// rail everywhere it is mounted.
export const addressQueryKey = (userId: string | null) =>
  ['checkout', 'addresses', userId ?? 'guest'] as const;

export const methodsQueryKey = (userId: string | null) =>
  ['checkout', 'payment-methods', userId ?? 'guest'] as const;

export interface LivePaymentMethodRow {
  /** Numeric user_payment_methods id — matches the mapped PaymentMethod.id. */
  id: number;
  /** The pm_* ref the v2 detach/default routes key on. */
  providerPaymentMethodId?: string | null;
}

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

export interface OrderInstrumentFacts {
  /** The buyer's address the order was placed against — null when the
   *  order carries no addressId or the row no longer exists. */
  deliveryAddress: Address | null;
  /** The tokenised method the order charged — null when unresolvable
   *  (wallet-paid, detached, provider unconfigured) or not requested. */
  paymentMethod: PaymentMethod | null;
  isLoading: boolean;
}
