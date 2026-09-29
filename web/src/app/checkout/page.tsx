'use client';

/**
 * /checkout — delivery address, per-parcel delivery speed, payment method
 * (card or the 1ZE wallet), verification add-on, order summary and the Pay
 * action. ?item=<id> checks out a single listing (Buy now); with no param
 * it consumes the bag; ?order=<id> resumes an unpaid 'created' order —
 * the order-bound checkout native runs when OrderDetail's pay action
 * lands here (selections re-bind via PATCH /orders/:id/checkout only when
 * they diverge from the stored ones, then the payment intent re-attaches).
 *
 * Mobile parity notes (CheckoutScreen): the delivery row opens a quote
 * selector only when the parcel has more than one quote; verification is
 * a free request flag on the order; the dot row tracks
 * Delivery/Payment/Review completion; a partial-data banner names the
 * first missing capability; and the full breakdown sheet reconciles every
 * line to the total.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { useListing } from '@/lib/hooks/queries';
import { useSellerTrustSummary } from '@/lib/hooks/pdp-queries';
import { useStore } from '@/lib/store/useStore';
import { useBagListings } from '@/lib/store/useBagListings';
import { useSession } from '@/lib/session/SessionProvider';
import { useCheckoutInstruments } from '@/components/checkout/useCheckoutInstruments';
import {
  bundleDiscountFor,
  sellerGroups,
  type SellerGroup,
} from '@/lib/data/fixtures';
import { AUTHENTICATION_THRESHOLD_GBP, recordOrder } from '@/lib/data/fixtures-commerce';
import {
  checkoutTotalsWithDelivery,
  parcelSellerCovered,
  buildPartialDataPrompt,
  computeCheckoutSteps,
  type DeliverySelection,
} from '@/components/checkout/checkoutViewModel';
import {
  PARCEL_DELIVERY_QUOTES,
  defaultParcelQuote,
  type CheckoutDeliveryQuote,
} from '@/lib/data/fixtures-checkout';
import { DISPATCH_SLA_DAYS } from '@/lib/commerce/dispatch';
import { listingCapabilities } from '@/lib/commerce/capabilities';
import { intentSettlement, waitForPaymentSettlement } from '@/lib/commerce/payments';
import { DATA_MODE } from '@/lib/api/client';
import * as commerceService from '@/lib/api/services/commerce';
import * as checkoutService from '@/lib/api/services/checkout';
import { parseApiError } from '@/lib/api/http';
import type { Listing } from '@/lib/contracts/domain';
import {
  AddressPicker,
  PaymentPicker,
  paymentMethodExpired,
} from '@/components/checkout/SelectionList';
import { DeliveryPicker, type ParcelDeliveryVm } from '@/components/checkout/DeliveryPicker';
import { VerificationSection } from '@/components/checkout/VerificationSection';
import { BreakdownSheet } from '@/components/checkout/BreakdownSheet';
import { PartialDataBanner } from '@/components/checkout/PartialDataBanner';
import {
  CheckoutProgressDots,
  CheckoutProgressOverlay,
  CHECKOUT_STAGE_LABELS,
  type CheckoutPayStage,
} from '@/components/checkout/CheckoutProgress';
import { AddAddressSheet, AddCardSheet } from '@/components/checkout/AddPaymentSheets';
import { OrderSummary } from '@/components/checkout/OrderSummary';
import { CheckoutSkeleton, CheckoutSuccess } from '@/components/checkout/CheckoutStates';
import { useWalletData, type WalletData } from '@/components/wallet/useWalletData';
import { walletKeys } from '@/components/wallet/walletKeys';
import { GBP_PER_USD, formatIze, round2 } from '@/components/wallet/convertViewModel';
import { formatPrice } from '@/lib/utils/format';

const round = (n: number) => Math.round(n * 100) / 100;

/** Passed to useBagListings when ?item= short-circuits the bag branch. */
const NO_BAG_ENTRIES: { listingId: string }[] = [];

function CheckoutInner() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const itemId = params.get('item');
  // Order-bound resume — live only (the fixture overlay flips 'created'
  // orders in place, so no web resume link exists there).
  const resumeOrderId = params.get('order');

  const bag = useStore((s) => s.bag);
  const removeFromBag = useStore((s) => s.removeFromBag);
  const { user } = useSession();
  // Instruments are mode-aware: fixture mode reads the local overlay;
  // live mode reads the server (addresses via /users/:id/addresses, cards
  // via /v2/payments/methods) — fixture/local ids never reach the wire.
  const {
    addresses,
    defaultAddress,
    paymentMethods,
    isLoading: instrumentsLoading,
    addressesError,
    paymentMethodsError,
    refetchInstruments,
    addAddress: addInstrumentAddress,
    addPaymentMethod,
  } = useCheckoutInstruments();

  // 1ZE wallet pocket — powers the "1ZE Wallet" tender row (mobile parity:
  // the full-order oneze_internal gateway option). Absent pocket → no row.
  const { data: wallet } = useWalletData();
  const izeSettled = wallet?.ize ? Math.max(0, wallet.ize.settled - wallet.ize.reserved) : 0;

  // The resume order — GET /orders/:id is the source of truth for the
  // bound selections (address, payment method, carrier, totals) and the
  // payability verdict ('created' is the only resumable status).
  const {
    data: boundOrder,
    isLoading: orderLoading,
    isError: orderLoadFailed,
    refetch: refetchBoundOrder,
  } = useQuery({
    queryKey: ['order', resumeOrderId],
    queryFn: ({ signal }) => commerceService.fetchOrderById(resumeOrderId!, signal),
    enabled: DATA_MODE === 'live' && !!resumeOrderId,
  });

  const { data: single, isLoading: itemLoading } = useListing(
    itemId ?? boundOrder?.listingId ?? '',
  );
  // Live away-state resolves from the seller trust summary — the listing
  // payload alone never carries holidayMode/reachState.
  const sellerTrustQuery = useSellerTrustSummary(single?.sellerId);
  const sellerTrust = sellerTrustQuery.data;
  // While the live trust read is in flight the listing's purchasability
  // is unresolved — keep the page in its loading surface rather than
  // flashing pay affordances an away-seller fetch would reject.
  const sellerTrustPending = DATA_MODE === 'live' && !!itemId && sellerTrustQuery.isLoading;

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // Bag checkout resolves entries the same way /bag does — live ids go to
  // GET /listings/:id; fixture ids map onto the catalogue. An unresolvable
  // live id drops out of the order rather than shipping a fixture row.
  const bagResolved = useBagListings(
    itemId || resumeOrderId ? NO_BAG_ENTRIES : bag,
  );

  const items = useMemo<Listing[]>(() => {
    if (resumeOrderId) {
      // Order-bound: the order is the source of truth — its listing may
      // be paused or sold (buyer-invisible), so the Buy-now capability
      // gate never applies to a resume.
      return single ? [single] : [];
    }
    if (itemId) {
      // Direct checkout honours the same capability gate as the PDP — a
      // sold/paused/away listing that raced the navigation never reaches
      // the pay button.
      return single && listingCapabilities(single, user?.id, sellerTrust).canBuy ? [single] : [];
    }
    return bagResolved.items;
  }, [resumeOrderId, itemId, single, bagResolved.items, user?.id, sellerTrust]);

  const groups = useMemo(() => sellerGroups(items), [items]);

  const [addressId, setAddressId] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  // Per-parcel delivery selection — sellerId → quote. Absent keys ride the
  // default catalogue quote (the flat SHIPPING_FEE equivalent), so a bag
  // never starts in an unselectable state.
  const [delivery, setDelivery] = useState<DeliverySelection>({});
  /** Item verification add-on — a request flag on the order, no fee. */
  const [verificationRequested, setVerificationRequested] = useState(false);
  /** Funding switch — '1ZE Wallet' replaces the card tender. */
  const [useOneze, setUseOneze] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [addAddressOpen, setAddAddressOpen] = useState(false);
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [payStage, setPayStage] = useState<CheckoutPayStage | null>(null);
  /** Live address-save failure — surfaced under the picker (the sheet
   *  closes optimistically; a failed POST must not pretend to persist). */
  const [addressSaveError, setAddressSaveError] = useState<string | null>(null);
  /** Bumped to re-run the live quote fetch (the retry affordance when the
   *  server couldn't price delivery). */
  const [quoteRefreshKey, setQuoteRefreshKey] = useState(0);

  // The selected address object — live mode needs its numeric id and
  // postcode for the server quote; both must reach POST /orders in the
  // exact shape the quote was bound with or the route rejects it
  // (SHIPPING_QUOTE_INVALID).
  const selectedAddress = useMemo(
    () => addresses.find((a) => a.id === addressId) ?? null,
    [addresses, addressId],
  );
  const liveAddressNumericId =
    DATA_MODE === 'live' && selectedAddress ? Number(selectedAddress.id) : Number.NaN;

  // ── Live delivery quotes ──────────────────────────────────────────────
  // Fixture mode reads the authored catalogue (PARCEL_DELIVERY_QUOTES —
  // the stand-in for POST /shipping/quote). Live mode asks the server per
  // ITEM — a persisted quote is bound to one listingId and the order route
  // validates quote.listing_id === order.listing_id, so a parcel can't
  // share one quote across items. Quotes are keyed by listing id; the
  // parcel selector displays the first item's list and the pay path
  // re-matches the chosen carrier inside each item's own quote set.
  const [liveQuotes, setLiveQuotes] = useState<Record<string, CheckoutDeliveryQuote[]>>({});
  useEffect(() => {
    if (
      DATA_MODE !== 'live' ||
      !user?.id ||
      !selectedAddress ||
      !Number.isFinite(liveAddressNumericId)
    ) {
      setLiveQuotes({});
      return;
    }
    const addressNum = liveAddressNumericId;
    const destinationPostcode = selectedAddress.postcode;
    let cancelled = false;
    const run = async () => {
      const next: Record<string, CheckoutDeliveryQuote[]> = {};
      await Promise.all(
        items.map(async (item) => {
          try {
            const res = await checkoutService.fetchCheckoutShippingQuote({
              buyerId: user.id,
              listingId: item.id,
              sellerId: item.sellerId,
              // Bind the quote to the selected address — the order must
              // send the same addressId for the quote to validate.
              addressId: addressNum,
              destinationPostcode,
              // Order-bound resume: the server sorts the order's stored
              // carrier first, and insures the locked subtotal rather than
              // the listing's current shelf price.
              preferredCarrierId: boundOrder
                ? (boundOrder.shippingCarrierId ??
                  boundOrder.fulfilmentSnapshot?.carrierId ??
                  undefined)
                : undefined,
              declaredValueGbp:
                boundOrder && item.id === boundOrder.listingId
                  ? (boundOrder.subtotalGbp ?? undefined)
                  : item.price > 0
                    ? item.price
                    : undefined,
            });
            if (res.ok && res.quotes.length > 0) {
              next[item.id] = res.quotes.map((q) => ({
                quoteId: q.quoteId ?? '',
                carrierId: q.carrierId,
                serviceName: q.label,
                priceFromGbp: q.priceFromGbp,
                etaMinDays: q.etaMinDays,
                etaMaxDays: q.etaMaxDays,
                tracking: q.tracking,
                live: q.live,
              }));
            }
          } catch {
            // Quote fetch failed — the parcel keeps the default option
            // (non-live) and Pay stays off until a bound quote resolves
            // (never fabricate quotes or pretend a fallback is orderable).
          }
        }),
      );
      if (!cancelled) setLiveQuotes(next);
    };
    void run();
    return () => {
      cancelled = true;
    };
    // items/groups share the same listing set — key on items directly.
  }, [items, user?.id, selectedAddress, liveAddressNumericId, quoteRefreshKey, boundOrder]);

  /** The parcel's effective live quote — the buyer's carrier pick matched
   *  inside the FRESH quote list (a stale selection object carries a dead
   *  quoteId; matching by carrierId keeps the choice truthful). */
  const liveParcelQuote = useCallback(
    (group: SellerGroup): CheckoutDeliveryQuote | null => {
      const list = liveQuotes[group.items[0]?.id ?? ''] ?? [];
      const wantedCarrier = delivery[group.sellerId]?.carrierId;
      return (
        list.find((q) => q.quoteId && q.carrierId === wantedCarrier) ??
        list.find((q) => q.quoteId) ??
        null
      );
    },
    [liveQuotes, delivery],
  );

  const parcels = useMemo<ParcelDeliveryVm[]>(
    () =>
      groups.map((group, i) => {
        const covered = parcelSellerCovered(group);
        const quotes = covered
          ? []
          : DATA_MODE === 'live'
            ? liveQuotes[group.items[0]?.id ?? ''] ?? [defaultParcelQuote()]
            : PARCEL_DELIVERY_QUOTES;
        const selected = covered
          ? null
          : DATA_MODE === 'live'
            ? (liveParcelQuote(group) ?? quotes[0] ?? defaultParcelQuote())
            : (delivery[group.sellerId] ?? quotes[0] ?? defaultParcelQuote());
        return {
          sellerId: group.sellerId,
          sellerName: group.seller?.username ?? null,
          index: i + 1,
          count: groups.length,
          sellerCovered: covered,
          quotes,
          selected,
        };
      }),
    [groups, delivery, liveQuotes, liveParcelQuote],
  );

  // Seed the selection from the resolved defaults once the instrument rail
  // is ready — the persisted fixture store rehydrates after mount, and the
  // live reads land asynchronously, so this can't live in useState
  // initialisers. Re-running on list change keeps a still-valid selection
  // and only re-seeds when the chosen row disappeared (or was never set).
  const instrumentsReady = DATA_MODE === 'live' ? !instrumentsLoading : hydrated;
  useEffect(() => {
    if (!instrumentsReady) return;
    // Order-bound resume seeds the order's own stored refs first — they
    // are the truth the re-bind compares against (native hydration prefers
    // boundOrder.addressId over the account default).
    const boundAddressId =
      boundOrder?.addressId != null
        ? (addresses.find((a) => a.id === String(boundOrder.addressId))?.id ?? null)
        : null;
    setAddressId((id) => {
      if (id && addresses.some((a) => a.id === id)) {
        // A deliberate pick (or an already-seeded bound ref) stays — only
        // the untouched auto-default yields to the order's own address.
        const autoSeed = defaultAddress?.id ?? addresses[0]?.id ?? null;
        return boundAddressId && id === autoSeed ? boundAddressId : id;
      }
      return boundAddressId ?? defaultAddress?.id ?? addresses[0]?.id ?? null;
    });
    // An expired card can never seed the selection — the picker renders
    // it disabled, so defaulting to it would silently produce an unpayable
    // state. Fall to the first chargeable method. In live mode no card is
    // chargeable web-side at all (the picker disables every card row —
    // intents can only be confirmed natively), so seeding stays empty.
    if (DATA_MODE !== 'live') {
      setPaymentId((id) =>
        id && paymentMethods.some((p) => p.id === id && !paymentMethodExpired(p))
          ? id
          : (paymentMethods.find((p) => p.isDefault && !paymentMethodExpired(p))?.id ??
            paymentMethods.find((p) => !paymentMethodExpired(p))?.id ??
            null),
      );
    }
  }, [instrumentsReady, addresses, paymentMethods, defaultAddress, boundOrder]);

  // Order-bound seeds — the stored verification flag and the carrier the
  // order's quote charged (the delivery selection only needs the carrierId
  // hint; liveParcelQuote re-matches it inside the fresh quote list, so a
  // drifted or expired quote id never reaches the PATCH).
  useEffect(() => {
    if (!boundOrder) return;
    setVerificationRequested(boundOrder.verificationRequested === true);
    const boundCarrier =
      boundOrder.shippingCarrierId ?? boundOrder.fulfilmentSnapshot?.carrierId ?? null;
    if (!boundCarrier) return;
    setDelivery((prev) =>
      prev[boundOrder.sellerId]
        ? prev
        : {
            ...prev,
            [boundOrder.sellerId]: {
              quoteId: '',
              carrierId: boundCarrier,
              serviceName: boundOrder.fulfilmentSnapshot?.serviceName ?? '',
              priceFromGbp: boundOrder.postageFeeGbp ?? 0,
              etaMinDays: 0,
              etaMaxDays: 0,
              tracking: false,
              live: false,
            },
          },
    );
  }, [boundOrder]);

  const paying = payStage !== null;
  const [orderId, setOrderId] = useState<string | null>(null);
  /** Payment failure state — a silent catch is never acceptable here:
   *  the user must see the failure and get a retry, and a partial
   *  multi-item failure must name what wasn't ordered. */
  const [payError, setPayError] = useState<string | null>(null);
  const idemRef = useRef<string | null>(null);

  const loading = itemId
    ? itemLoading || sellerTrustPending || instrumentsLoading
    : resumeOrderId
      ? orderLoading || itemLoading || instrumentsLoading
      : !hydrated || bagResolved.isLoading || instrumentsLoading;

  // The ledger derives from the delivery selection — picking Tracked 24
  // re-prices the parcel here, in the summary and on the recorded order.
  // In live mode the selection map holds the carrier PREFERENCE; the
  // priced quote is re-resolved against the fresh per-item quote lists so
  // the displayed shipping always matches a bound quote's price.
  const effectiveDelivery = useMemo<DeliverySelection>(() => {
    if (DATA_MODE !== 'live') return delivery;
    const out: DeliverySelection = {};
    for (const group of groups) {
      const q = liveParcelQuote(group);
      if (q) out[group.sellerId] = q;
    }
    return out;
  }, [delivery, groups, liveParcelQuote]);
  const totals = useMemo(() => {
    const t = checkoutTotalsWithDelivery(items, effectiveDelivery);
    if (!boundOrder) return t;
    // Order-bound: the server's locked charge lines are authoritative —
    // the listing price may have moved since the order was created
    // (accepted offer, price edit), so item and protection lines come off
    // the order; postage still follows the currently selected quote.
    const itemsSum = boundOrder.subtotalGbp ?? t.items;
    const protectionFee = boundOrder.buyerProtectionFeeGbp ?? t.protectionFee;
    return {
      ...t,
      items: itemsSum,
      protectionFee,
      total: round(itemsSum + protectionFee + t.shippingFee),
    };
  }, [items, effectiveDelivery, boundOrder]);
  // BUNDLE_RULE — same seller-group math the bag shows; 0 for ?item=
  // buys. Live mode: the backend charges listing.price_gbp in full per
  // item (native BundleBagScreen declines to fabricate tiers for the same
  // reason), so a live payable total subtracts nothing the wire won't.
  const bundleDiscount = useMemo(
    () => (DATA_MODE === 'live' ? 0 : bundleDiscountFor(items)),
    [items],
  );
  const payableTotal = round(totals.total - bundleDiscount);

  // Authentication threshold — an order containing a qualifying item is
  // verified regardless; the toggle only adds the request flag otherwise.
  const autoVerified = items.some((l) => l.price >= AUTHENTICATION_THRESHOLD_GBP);
  const verification = verificationRequested || autoVerified;

  // 1ZE requirement — the same GBP→1ZE conversion the wallet applies
  // (mobile toIze('GBP')): gross total ÷ GBP_PER_USD.
  const onezeRequired = round(payableTotal / GBP_PER_USD);
  const walletOption =
    wallet?.ize && wallet.ize.settled > 0
      ? {
          available: wallet.ize.settled,
          needed: onezeRequired,
          selected: useOneze,
          onSelect: () => setUseOneze(true),
        }
      : undefined;

  // Live card intents park unconfirmed — the 1ZE wallet is the only
  // web-completable tender, so select it as soon as it exists rather than
  // leaving the buyer on a tender that can never finish.
  const hasWalletTender = !!walletOption;
  useEffect(() => {
    if (DATA_MODE === 'live' && hasWalletTender) setUseOneze(true);
  }, [hasWalletTender]);

  const selectedPayment = paymentMethods.find((p) => p.id === paymentId) ?? null;
  const steps = computeCheckoutSteps({
    hasAddress: !!addressId,
    parcelsHaveDelivery: parcels.every((p) => p.sellerCovered || !!p.selected),
    selectedPayment,
    useOnezeWallet: useOneze,
    onezeSettled: izeSettled,
    onezeRequired,
  });
  // Live pay needs a server-bound quote on every buyer-paid parcel —
  // POST /orders requires shippingQuoteId and validates it against the
  // order's listing/seller/address/carrier. A fallback catalogue quote is
  // never orderable, so it disables Pay instead of lying on the wire.
  const liveQuotesReady =
    DATA_MODE !== 'live' ||
    (!!selectedAddress &&
      Number.isFinite(liveAddressNumericId) &&
      parcels.every(
        (p) => p.sellerCovered || (p.selected?.live === true && !!p.selected.quoteId),
      ));
  const canPay =
    items.length > 0 &&
    !!addressId &&
    liveQuotesReady &&
    // Live card intents can never confirm on web (the only confirm route
    // is admin-gated; there is no Stripe.js rail) — the wallet is the
    // only completable tender. Fixture keeps the full card demo.
    (useOneze ? izeSettled >= onezeRequired : DATA_MODE !== 'live' && !!paymentId) &&
    !paying;

  const partialDataPrompt = buildPartialDataPrompt({
    isLoading: loading,
    addressLoaded: addresses.length > 0,
    paymentLoaded: paymentMethods.length > 0 || !!walletOption,
    onAddAddress: () => setAddAddressOpen(true),
    onAddPayment: () => setAddCardOpen(true),
  });

  /** Dispatch certainty — the longest seller SLA across parcels (each
   *  listing's own dispatchSlaDays wins) or the platform default. Same
   *  number the PDP line and the seller-hub countdown share. */
  const dispatchDays = items.reduce(
    (max, l) =>
      Math.max(
        max,
        typeof l.dispatchSlaDays === 'number' && l.dispatchSlaDays > 0
          ? Math.round(l.dispatchSlaDays)
          : DISPATCH_SLA_DAYS,
      ),
    DISPATCH_SLA_DAYS,
  );

  /** Fixture-mode delivery choices keyed by sellerId for recordOrder. */
  const deliveryChoices = () => {
    const out: Record<string, { carrierId: string; serviceName: string; priceGbp: number }> = {};
    for (const parcel of parcels) {
      const q = parcel.selected;
      if (!parcel.sellerCovered && q) {
        out[parcel.sellerId] = {
          carrierId: q.carrierId,
          serviceName: q.serviceName,
          priceGbp: q.priceFromGbp,
        };
      }
    }
    return out;
  };

  /** Debit the settled 1ZE pocket — the fixture-mode mirror of the
   *  oneze_internal intent settling against the wallet (same write path
   *  the trading desk uses: mutate the wallet cache entry). */
  const debitOnezePocket = (amount: number) => {
    qc.setQueryData<WalletData>(walletKeys.all(user?.id), (w) =>
      w?.ize ? { ...w, ize: { ...w.ize, settled: round2(w.ize.settled - amount) } } : w,
    );
  };

  const handlePay = async () => {
    if (!canPay) return;
    setPayError(null);
    if (DATA_MODE === 'live') {
      // Live checkout — the backend orders one listing per order, so a
      // multi-item bag is one POST /orders per item. Order creation is NOT
      // payment: each order then gets a payment intent and only an intent
      // that reports 'succeeded' may show the success screen (native:
      // createOrder → payments/intents → settlement poll → Success). A
      // non-terminal intent lands the buyer on the order detail — the same
      // route native takes — where the order shows its truthful unpaid state.
      try {
        const buyerId = user?.id;
        if (!buyerId) throw new Error('not signed in');
        setPayStage('creating_order');
        // One idempotency key per pay intent — a retry replays the same
        // intent server-side instead of risking a duplicate order.
        idemRef.current ??= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        // The order route validates numeric ids against the buyer's own
        // rows — a non-numeric (local) id can never be sent as one.
        if (!Number.isFinite(liveAddressNumericId)) {
          throw new Error('a saved delivery address is required');
        }
        const orderAddressId = liveAddressNumericId;
        const numericPaymentId =
          !useOneze && paymentId && Number.isFinite(Number(paymentId))
            ? Number(paymentId)
            : undefined;

        // ── Order-bound resume — the order already exists at its locked
        // price. Never POST /orders: re-bind the buyer's current
        // selections via PATCH /orders/:id/checkout only when they diverge
        // from the stored ones (native alreadyBound), then re-attach the
        // payment intent — createCommercePaymentIntent is idempotent per
        // order, so it re-serves the bound intent when one exists.
        if (boundOrder) {
          const boundItem = items[0];
          const boundParcel = parcels[0];
          if (!boundItem || !boundParcel) throw new Error('order item unavailable');
          const wantedCarrier = boundParcel.selected?.carrierId;
          const cached = liveQuotes[boundItem.id] ?? [];
          let bound: { quoteId: string; carrierId: string } | null =
            cached.find((q) => q.quoteId && q.carrierId === wantedCarrier) ??
            cached.find((q) => q.quoteId) ??
            null;
          // Seller-paid parcels carry no buyer-paid quote selection — the
          // order's stored carrier/postage are the baseline then.
          const postageFee = boundParcel.sellerCovered
            ? 0
            : (boundParcel.selected?.priceFromGbp ?? 0);
          const carrierForOrder = boundParcel.sellerCovered
            ? (boundOrder.shippingCarrierId ?? null)
            : (wantedCarrier ?? null);
          const alreadyBound =
            boundOrder.addressId != null &&
            boundOrder.addressId === orderAddressId &&
            (boundOrder.shippingCarrierId ?? null) === carrierForOrder &&
            boundOrder.postageFeeGbp === postageFee &&
            (boundOrder.paymentMethodId ?? null) === (numericPaymentId ?? null) &&
            (boundOrder.verificationRequested ?? false) === verification;
          if (!alreadyBound) {
            // A changed selection needs a server-persisted quote bound to
            // THIS listing + address + carrier — same rule as order
            // creation (SHIPPING_QUOTE_INVALID otherwise).
            if (!bound) {
              const res = await checkoutService.fetchCheckoutShippingQuote({
                buyerId,
                listingId: boundItem.id,
                sellerId: boundItem.sellerId,
                addressId: orderAddressId,
                destinationPostcode: selectedAddress?.postcode,
                preferredCarrierId: wantedCarrier,
                declaredValueGbp: boundOrder.subtotalGbp ?? undefined,
              });
              const fresh =
                res.quotes.find((q) => q.quoteId && q.carrierId === wantedCarrier) ??
                (res.recommendedQuote?.quoteId ? res.recommendedQuote : null) ??
                res.quotes.find((q) => q.quoteId) ??
                null;
              bound =
                fresh?.quoteId && fresh.carrierId
                  ? { quoteId: fresh.quoteId, carrierId: fresh.carrierId }
                  : null;
            }
            if (!bound?.quoteId) throw new Error('no shipping quote');
            await commerceService.completeOrderCheckout(boundOrder.id, {
              addressId: orderAddressId,
              paymentMethodId: numericPaymentId,
              shippingQuoteId: bound.quoteId,
              shippingCarrierId: bound.carrierId,
              verificationRequested: verification,
            });
          }
          setPayStage('opening_payment');
          const intent = await commerceService.createCommercePaymentIntent({
            orderId: boundOrder.id,
            idempotencyKey: useOneze
              ? `oneze_payment_${boundOrder.id}`
              : `web-pay-${boundOrder.id}-${idemRef.current}`,
            gatewayId: useOneze ? 'oneze_internal' : undefined,
          });
          const immediate = intentSettlement(intent.status);
          const outcome =
            immediate === 'open' ? await waitForPaymentSettlement(intent.id) : immediate;
          void qc.invalidateQueries({ queryKey: ['orders'] });
          void qc.invalidateQueries({ queryKey: ['order', boundOrder.id] });
          if (outcome === 'succeeded') {
            setOrderId(boundOrder.id);
            return;
          }
          if (outcome === 'pending') {
            // The order exists unpaid — hand back to the order surface,
            // which renders its true 'created'/pending state.
            router.replace(`/orders/${boundOrder.id}`);
            return;
          }
          setPayError(
            'Payment could not be completed — try again, or finish it in the app.',
          );
          setPayStage(null);
          return;
        }

        const created: string[] = [];
        const settled: string[] = [];
        const pendingOrders: string[] = [];
        const failed: string[] = [];
        for (const item of items) {
          try {
            const parcel = parcels.find((p) => p.sellerId === item.sellerId);
            const wantedCarrier = parcel?.selected?.carrierId;
            // The binding quote must be issued for THIS listing —
            // quote.listing_id === order.listing_id is enforced
            // server-side, so a parcel-level quote can't be shared across
            // items. Prefer this item's prefetched quote matching the
            // chosen carrier; a covered parcel (or a stale/missing entry)
            // fetches a fresh bound quote on the spot.
            const cached = liveQuotes[item.id] ?? [];
            let bound: { quoteId: string; carrierId: string } | null =
              cached.find((q) => q.quoteId && q.carrierId === wantedCarrier) ??
              cached.find((q) => q.quoteId) ??
              null;
            if (!bound) {
              const res = await checkoutService.fetchCheckoutShippingQuote({
                buyerId,
                listingId: item.id,
                sellerId: item.sellerId,
                addressId: orderAddressId,
                destinationPostcode: selectedAddress?.postcode,
                preferredCarrierId: wantedCarrier,
                declaredValueGbp: item.price > 0 ? item.price : undefined,
              });
              const fresh =
                res.quotes.find((q) => q.quoteId && q.carrierId === wantedCarrier) ??
                (res.recommendedQuote?.quoteId ? res.recommendedQuote : null) ??
                res.quotes.find((q) => q.quoteId) ??
                null;
              bound =
                fresh?.quoteId && fresh.carrierId
                  ? { quoteId: fresh.quoteId, carrierId: fresh.carrierId }
                  : null;
            }
            if (!bound) throw new Error('no shipping quote');
            const { orderId: id } = await checkoutService.createCheckoutOrder({
              listingId: item.id,
              buyerId,
              idempotencyKey: `web-${item.id}-${idemRef.current}`,
              addressId: orderAddressId,
              paymentMethodId: numericPaymentId,
              // The persisted quote id AND its carrier — the route rejects
              // a quote bound without its matching shippingCarrierId.
              shippingQuoteId: bound.quoteId,
              shippingCarrierId: bound.carrierId,
              paymentGatewayId: useOneze ? 'oneze_internal' : undefined,
              verificationRequested: verification || undefined,
            });
            created.push(id);
            if (!itemId) removeFromBag(item.id);
            // The order exists unpaid until its intent settles — ask the
            // server, then read the real status. Never assume.
            try {
              setPayStage('opening_payment');
              const intent = await commerceService.createCommercePaymentIntent({
                orderId: id,
                // Mirrors mobile's oneze key — a replayed 1ZE intent returns
                // the same record rather than double-debiting the pocket.
                idempotencyKey: useOneze ? `oneze_payment_${id}` : `web-pay-${id}-${idemRef.current}`,
                gatewayId: useOneze ? 'oneze_internal' : undefined,
              });
              const immediate = intentSettlement(intent.status);
              const outcome =
                immediate === 'open' ? await waitForPaymentSettlement(intent.id) : immediate;
              if (outcome === 'succeeded') settled.push(id);
              else if (outcome === 'failed') failed.push(item.title);
              else pendingOrders.push(id);
            } catch {
              // Intent creation itself failed — the order is real but
              // unpaid; the order page owns the honest pending state.
              pendingOrders.push(id);
            }
          } catch {
            failed.push(item.title);
          }
        }
        if (created.length > 0) {
          void qc.invalidateQueries({ queryKey: ['orders'] });
          void qc.invalidateQueries({ queryKey: ['listing'] });
          void qc.invalidateQueries({ queryKey: ['listings'] });
        }
        if (failed.length === 0 && pendingOrders.length === 0 && settled.length > 0) {
          setOrderId(settled[0]!);
          return;
        }
        if (pendingOrders.length > 0 && failed.length === 0) {
          // Order(s) exist but payment isn't confirmed — route to the
          // order, which renders its true 'created'/pending state.
          void qc.invalidateQueries({ queryKey: ['order'] });
          router.replace(`/orders/${pendingOrders[0]!}`);
          return;
        }
        if (created.length > 0) {
          const notes: string[] = [];
          if (failed.length > 0) {
            notes.push(
              `${failed.length === 1 ? 'One item' : `${failed.length} items`} couldn't be completed — ${failed.join(', ')}.`,
            );
          }
          if (pendingOrders.length > 0) {
            notes.push('Some orders were created but payment is still pending — check your orders.');
          }
          setPayError(notes.join(' '));
        } else {
          setPayError('Payment could not be completed — no order was placed. Check your payment method and try again.');
        }
        setPayStage(null);
        return;
      } catch (error) {
        // Surface the server's own refusal first — a re-bind 409
        // (payment already in progress) or 410 (reservation expired) says
        // something specific; only an unparseable error takes the generic.
        setPayError(
          parseApiError(
            error,
            'Payment could not be completed — check your payment method and try again.',
          ).message,
        );
        setPayStage(null);
        return;
      }
    }
    // Fixture latency — two stages mirroring the live round-trips the
    // progress overlay narrates (create order → payment intent).
    setPayStage('creating_order');
    await new Promise((r) => setTimeout(r, 350));
    setPayStage('opening_payment');
    await new Promise((r) => setTimeout(r, 350));
    // One order per seller group — recordOrder marks the listings sold and
    // writes each parcel's honest breakdown (items − bundle discount +
    // protection + that parcel's chosen delivery quote) into the detail
    // store. The verification flag is part of the order record.
    const orders = recordOrder(items, {
      delivery: deliveryChoices(),
      verificationRequested: verification,
    });
    if (useOneze) debitOnezePocket(onezeRequired);
    // The orders list is a paginated (InfiniteData) cache — recordOrder
    // already wrote the fixture store, so invalidating refetches the
    // composed page rather than hand-splicing an entry.
    void qc.invalidateQueries({ queryKey: ['orders'] });
    // The purchased listings are now sold — let PDP/feed surfaces re-read
    // before they could offer a stale Buy-now.
    void qc.invalidateQueries({ queryKey: ['listing'] });
    void qc.invalidateQueries({ queryKey: ['listings'] });
    void qc.invalidateQueries({ queryKey: ['feed'] });
    if (!itemId) items.forEach((l) => removeFromBag(l.id));
    setPayStage(null);
    setOrderId(orders[0]?.id ?? null);
  };

  if (orderId) {
    return <CheckoutSuccess orderId={orderId} />;
  }

  if (loading) {
    return <CheckoutSkeleton />;
  }

  // Order-bound guards resolve before any listing-derived state — the
  // order is the source of truth (native CheckoutScreen order guards).
  if (resumeOrderId && orderLoadFailed) {
    return (
      <EmptyState
        icon="alert"
        title="Couldn't load this order"
        subtitle="Check your connection and try again — the order is safe."
        actionLabel="Try again"
        onAction={() => void refetchBoundOrder()}
      />
    );
  }
  if (resumeOrderId && (!boundOrder || boundOrder.status !== 'created')) {
    return (
      <EmptyState
        icon="receipt"
        title="This order is no longer awaiting payment"
        subtitle="It may already be paid, cancelled, or have a payment in progress."
        actionLabel="View order"
        onAction={() => router.replace(`/orders/${resumeOrderId}`)}
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon="bag"
        title={
          resumeOrderId
            ? "This order's item is no longer listed"
            : itemId
              ? 'This item is no longer available'
              : 'Nothing to check out'
        }
        subtitle={
          resumeOrderId
            ? 'The order itself still exists — its page has the support path if you need it.'
            : itemId
              ? 'It may have sold while you were browsing.'
              : 'Add items to your bag first.'
        }
        actionLabel={resumeOrderId ? 'Back to order' : 'Browse items'}
        onAction={
          resumeOrderId
            ? () => router.replace(`/orders/${resumeOrderId}`)
            : () => router.push('/explore')
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1000px] px-4 pb-24 pt-8 sm:px-6">
      <div className="flex items-center gap-2">
        <IconButton name="back" aria-label="Back" onClick={() => router.back()} className="-ml-2" />
        <h1 className="text-screen-title text-text-primary">Checkout</h1>
      </div>

      <CheckoutProgressDots
        deliveryComplete={steps.delivery}
        paymentComplete={steps.payment}
        reviewComplete={steps.review}
      />

      {partialDataPrompt ? (
        <div className="mt-3">
          <PartialDataBanner
            icon={partialDataPrompt.icon}
            message={partialDataPrompt.message}
            actionLabel={partialDataPrompt.actionLabel}
            onAction={partialDataPrompt.onAction}
          />
        </div>
      ) : null}

      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-8">
          <AddressPicker
            addresses={addresses}
            selectedId={addressId}
            onSelect={setAddressId}
            onAdd={() => setAddAddressOpen(true)}
          />
          {addressesError ? (
            <p className="-mt-4 flex items-center gap-1.5 text-caption text-warning-text">
              <Icon name="alert" size={14} className="shrink-0" />
              Saved addresses couldn’t be loaded.{' '}
              <button
                type="button"
                onClick={refetchInstruments}
                className="pressable font-semibold underline underline-offset-2"
              >
                Try again
              </button>
            </p>
          ) : null}
          {addressSaveError ? (
            <p
              className="-mt-4 flex items-center gap-1.5 text-caption text-danger-text"
              role="alert"
            >
              <Icon name="alert" size={14} className="shrink-0" />
              {addressSaveError}
            </p>
          ) : null}
          <div className="border-t border-border-subtle" />
          <DeliveryPicker
            parcels={parcels}
            onSelect={(sellerId, quote) =>
              setDelivery((prev) => ({ ...prev, [sellerId]: quote }))
            }
          />
          {DATA_MODE === 'live' &&
          !!selectedAddress &&
          parcels.some((p) => !p.sellerCovered && !p.selected?.live) ? (
            <p className="-mt-4 flex items-center gap-1.5 text-caption text-warning-text">
              <Icon name="alert" size={14} className="shrink-0" />
              Live delivery quotes are unavailable — payment stays off until a quote resolves.{' '}
              <button
                type="button"
                onClick={() => setQuoteRefreshKey((k) => k + 1)}
                className="pressable font-semibold underline underline-offset-2"
              >
                Retry
              </button>
            </p>
          ) : null}
          <div className="border-t border-border-subtle" />
          <PaymentPicker
            methods={paymentMethods}
            selectedId={useOneze ? null : paymentId}
            onSelect={(id) => {
              setPaymentId(id);
              setUseOneze(false);
            }}
            onAdd={() => setAddCardOpen(true)}
            walletOption={walletOption}
            cardTenderReason={
              DATA_MODE === 'live' ? 'Card payments finish in the app for now' : undefined
            }
          />
          {paymentMethodsError ? (
            <p className="-mt-4 flex items-center gap-1.5 text-caption text-warning-text">
              <Icon name="alert" size={14} className="shrink-0" />
              Payment methods couldn’t be loaded.{' '}
              <button
                type="button"
                onClick={refetchInstruments}
                className="pressable font-semibold underline underline-offset-2"
              >
                Try again
              </button>
            </p>
          ) : null}
          <div className="border-t border-border-subtle" />
          <VerificationSection
            enabled={verificationRequested}
            onToggle={() => setVerificationRequested((v) => !v)}
            autoIncluded={autoVerified}
            thresholdGbp={AUTHENTICATION_THRESHOLD_GBP}
          />
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <OrderSummary
            items={items}
            totals={totals}
            bundleDiscount={bundleDiscount}
            delivery={effectiveDelivery}
            verificationLabel={verification ? (autoVerified ? 'Included' : 'Free') : undefined}
            bundleCharged={DATA_MODE !== 'live'}
          />
          {/* Itemised ledger — the same lines, reconciling to the total,
              one tap away (mobile: tapping the footer summary opens the
              breakdown sheet). */}
          <button
            type="button"
            onClick={() => setBreakdownOpen(true)}
            className="pressable mt-3 flex w-full items-center justify-between rounded-md py-2 text-caption font-semibold text-text-secondary hover:text-text-primary"
            aria-label="View the full itemised breakdown"
          >
            <span className="flex items-center gap-1.5">
              <Icon name="receipt" size={15} />
              Full breakdown
            </span>
            <Icon name="forward" size={14} className="text-text-muted" />
          </button>
          <div className="mt-3.5 flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-alt/50 px-3 py-2 text-caption">
            <Icon name="shieldCheck" size={16} className="shrink-0 text-commerce-trust" />
            <span className="text-meta text-text-secondary">
              <strong className="font-semibold text-text-primary">ThryftVerse Escrow:</strong> Payment released to seller only after delivery is confirmed.
            </span>
          </div>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            icon="lock"
            className="mt-3"
            disabled={!canPay}
            onClick={handlePay}
          >
            {paying ? (
              (payStage ? CHECKOUT_STAGE_LABELS[payStage] : 'Processing…')
            ) : useOneze ? (
              <>Pay <span className="tnum">{formatIze(onezeRequired)} 1ZE</span></>
            ) : (
              <>Pay <span className="tnum">{formatPrice(payableTotal)}</span></>
            )}
          </Button>
          {payError ? (
            <div
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-lg bg-danger-subtle px-3.5 py-3"
            >
              <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-danger-text" />
              <div className="min-w-0 flex-1">
                <p className="text-caption font-medium text-danger-text">{payError}</p>
                <button
                  type="button"
                  onClick={handlePay}
                  disabled={!canPay}
                  className="pressable mt-1.5 text-caption font-semibold text-danger-text underline underline-offset-2"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : null}
          {/* Trust sits next to the irreversible action — one compact line,
              not a banner (mirrors the mobile BuyerProtectionStrip moment). */}
          <p className="mt-4 flex items-start gap-1.5 text-caption text-text-secondary">
            <Icon name="shieldCheck" size={15} className="mt-px shrink-0 text-commerce-trust" />
            <span>
              Covered by Buyer Protection — your money is held until the item arrives as described,
              then released to the seller. Full refund if it never arrives.
            </span>
          </p>
          {/* Returns window — the number is the backend contract
              (RETURN_WINDOW_DAYS = 14 in routes/returns.ts; expired cases
              are rejected RETURN_WINDOW_EXPIRED), not a marketing claim. */}
          <p className="mt-2 flex items-start gap-1.5 text-caption text-text-secondary">
            <Icon name="refresh" size={15} className="mt-px shrink-0 text-text-secondary" />
            <span>
              Buyer protection covers returns within{' '}
              <span className="tnum font-semibold text-text-primary">14</span> days of delivery.
            </span>
          </p>
          {/* Dispatch certainty — purchase-time ship window, contract-
              backed (listing SLA → platform default). Same claim the PDP
              delivery block makes. */}
          <p className="mt-2 flex items-start gap-1.5 text-caption text-text-secondary">
            <Icon name="clock" size={15} className="mt-px shrink-0 text-text-secondary" />
            <span>
              {items.length > 1 ? 'Sellers dispatch' : 'The seller dispatches'} within{' '}
              <span className="tnum font-semibold text-text-primary">{dispatchDays}</span>{' '}
              {dispatchDays === 1 ? 'day' : 'days'} of payment — tracking lands on your order.
            </span>
          </p>
          <p className="mt-2 text-caption text-text-muted">
            By paying, you agree to our{' '}
            <Link href="/terms" className="underline underline-offset-2 hover:text-text-secondary">
              Terms of Sale
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-text-secondary">
              Privacy Policy
            </Link>
            .
          </p>
        </aside>
      </div>

      {payStage ? <CheckoutProgressOverlay label={CHECKOUT_STAGE_LABELS[payStage]} /> : null}

      <BreakdownSheet
        open={breakdownOpen}
        onClose={() => setBreakdownOpen(false)}
        items={items}
        delivery={effectiveDelivery}
        totals={totals}
        bundleDiscount={bundleDiscount}
        verificationRequested={verification}
        verificationLabel={autoVerified ? 'Included' : 'Free'}
      />
      <AddAddressSheet
        open={addAddressOpen}
        onClose={() => setAddAddressOpen(false)}
        onSave={(a, makeDefault) => {
          setAddressSaveError(null);
          // Live: POSTs to the real address route and resolves with the
          // server row (numeric id). Fixture: persists to the local store.
          void addInstrumentAddress(a, makeDefault)
            .then((saved) => setAddressId(saved.id))
            .catch(() =>
              setAddressSaveError(
                'Address couldn’t be saved — check your connection and try again.',
              ),
            );
        }}
      />
      <AddCardSheet
        open={addCardOpen}
        onClose={() => setAddCardOpen(false)}
        onSave={(p) => {
          // Live mode never reaches here — the sheet self-gates into an
          // honest unavailable state (cards are provider-tokenised; web
          // has no Stripe rail). Fixture mode keeps the local card sim.
          if (DATA_MODE === 'live') return;
          const saved = addPaymentMethod(p);
          setPaymentId(saved.id);
          setUseOneze(false);
        }}
      />
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<CheckoutSkeleton />}>
      <CheckoutInner />
    </Suspense>
  );
}
