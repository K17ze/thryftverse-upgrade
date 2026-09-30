import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useListing } from '@/lib/hooks/queries';
import { useSellerTrustSummary } from '@/lib/hooks/pdp-queries';
import { useStore } from '@/lib/store/useStore';
import { useBagListings } from '@/lib/store/useBagListings';
import { useSession } from '@/lib/session/SessionProvider';
import { useCheckoutInstruments } from '@/components/checkout/useCheckoutInstruments';
import { useCheckoutDeliveryState } from '@/components/checkout/useCheckoutDeliveryState';
import { useCheckoutPaymentExecution } from '@/components/checkout/useCheckoutPaymentExecution';
import {
  bundleDiscountFor,
  sellerGroups,
} from '@/lib/data/fixtures';
import { AUTHENTICATION_THRESHOLD_GBP } from '@/lib/data/fixtures-commerce';
import {
  checkoutTotalsWithDelivery,
  buildPartialDataPrompt,
  computeCheckoutSteps,
  type DeliverySelection,
} from '@/components/checkout/checkoutViewModel';
import { DISPATCH_SLA_DAYS } from '@/lib/commerce/dispatch';
import { listingCapabilities } from '@/lib/commerce/capabilities';
import { DATA_MODE } from '@/lib/api/client';
import * as commerceService from '@/lib/api/services/commerce';
import type { Address, Listing, PaymentMethod } from '@/lib/contracts/domain';
import { useCheckoutAutoSeeding } from '@/components/checkout/useCheckoutAutoSeeding';
import { useWalletData, type WalletData } from '@/components/wallet/useWalletData';
import { walletKeys } from '@/components/wallet/walletKeys';
import { GBP_PER_USD, round2 } from '@/components/wallet/convertViewModel';
import type { CheckoutDeliveryQuote } from '@/lib/data/fixtures-checkout';

const round = (n: number) => Math.round(n * 100) / 100;
const NO_BAG_ENTRIES: { listingId: string }[] = [];

export function useCheckoutWorkflow() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const itemId = params.get('item');
  const resumeOrderId = params.get('order');

  const bag = useStore((s) => s.bag);
  const removeFromBag = useStore((s) => s.removeFromBag);
  const { user } = useSession();

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

  const { data: wallet } = useWalletData();
  const izeSettled = wallet?.ize ? Math.max(0, wallet.ize.settled - wallet.ize.reserved) : 0;

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

  const sellerTrustQuery = useSellerTrustSummary(single?.sellerId);
  const sellerTrust = sellerTrustQuery.data;
  const sellerTrustPending = DATA_MODE === 'live' && !!itemId && sellerTrustQuery.isLoading;

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const bagResolved = useBagListings(
    itemId || resumeOrderId ? NO_BAG_ENTRIES : bag,
  );

  const items = useMemo<Listing[]>(() => {
    if (resumeOrderId) {
      return single ? [single] : [];
    }
    if (itemId) {
      return single && listingCapabilities(single, user?.id, sellerTrust).canBuy ? [single] : [];
    }
    return bagResolved.items;
  }, [resumeOrderId, itemId, single, bagResolved.items, user?.id, sellerTrust]);

  const groups = useMemo(() => sellerGroups(items), [items]);

  const [addressId, setAddressId] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<DeliverySelection>({});
  const [verificationRequested, setVerificationRequested] = useState(false);
  const [useOneze, setUseOneze] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [addAddressOpen, setAddAddressOpen] = useState(false);
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [addressSaveError, setAddressSaveError] = useState<string | null>(null);

  const selectedAddress = useMemo(
    () => addresses.find((a) => a.id === addressId) ?? null,
    [addresses, addressId],
  );
  const liveAddressNumericId =
    DATA_MODE === 'live' && selectedAddress ? Number(selectedAddress.id) : Number.NaN;

  const {
    setQuoteRefreshKey,
    liveQuotes,
    parcels,
    effectiveDelivery,
    liveQuotesReady,
  } = useCheckoutDeliveryState({
    items,
    groups,
    user,
    selectedAddress,
    liveAddressNumericId,
    boundOrder,
    delivery,
  });

  const instrumentsReady = DATA_MODE === 'live' ? !instrumentsLoading : hydrated;
  useCheckoutAutoSeeding({
    instrumentsReady,
    addresses,
    defaultAddress,
    paymentMethods,
    boundOrder,
    setAddressId,
    setPaymentId,
    setDelivery,
    setVerificationRequested,
  });

  const loading = itemId
    ? itemLoading || sellerTrustPending || instrumentsLoading
    : resumeOrderId
      ? orderLoading || itemLoading || instrumentsLoading
      : !hydrated || bagResolved.isLoading || instrumentsLoading;

  const totals = useMemo(() => {
    const t = checkoutTotalsWithDelivery(items, effectiveDelivery);
    if (!boundOrder) return t;
    const itemsSum = boundOrder.subtotalGbp ?? t.items;
    const protectionFee = boundOrder.buyerProtectionFeeGbp ?? t.protectionFee;
    return {
      ...t,
      items: itemsSum,
      protectionFee,
      total: round(itemsSum + protectionFee + t.shippingFee),
    };
  }, [items, effectiveDelivery, boundOrder]);

  const bundleDiscount = useMemo(
    () => (DATA_MODE === 'live' ? 0 : bundleDiscountFor(items)),
    [items],
  );
  const payableTotal = round(totals.total - bundleDiscount);

  const autoVerified = items.some((l) => l.price >= AUTHENTICATION_THRESHOLD_GBP);
  const verification = verificationRequested || autoVerified;

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

  const debitOnezePocket = (amount: number) => {
    qc.setQueryData<WalletData>(walletKeys.all(user?.id), (w) =>
      w?.ize ? { ...w, ize: { ...w.ize, settled: round2(w.ize.settled - amount) } } : w,
    );
  };

  const canPay =
    items.length > 0 &&
    !!addressId &&
    liveQuotesReady &&
    (useOneze ? izeSettled >= onezeRequired : DATA_MODE !== 'live' && !!paymentId);

  const { payStage, orderId, payError, handlePay } = useCheckoutPaymentExecution({
    canPay,
    items,
    parcels,
    liveQuotes,
    selectedAddress,
    liveAddressNumericId,
    paymentId,
    useOneze,
    onezeRequired,
    verification,
    boundOrder,
    user,
    itemId,
    removeFromBag,
    qc,
    router,
    debitOnezePocket,
  });

  const paying = payStage !== null;

  const partialDataPrompt = buildPartialDataPrompt({
    isLoading: loading,
    addressLoaded: addresses.length > 0,
    paymentLoaded: paymentMethods.length > 0 || !!walletOption,
    onAddAddress: () => setAddAddressOpen(true),
    onAddPayment: () => setAddCardOpen(true),
  });

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

  const handleSelectDelivery = (sellerId: string, quote: CheckoutDeliveryQuote) => {
    setDelivery((prev) => ({ ...prev, [sellerId]: quote }));
  };

  const handleSelectPayment = (id: string | null) => {
    setPaymentId(id);
    setUseOneze(false);
  };

  const handleRetryQuotes = () => {
    setQuoteRefreshKey((k) => k + 1);
  };

  const handleSaveAddress = (a: Omit<Address, 'id' | 'isDefault'>, makeDefault?: boolean) => {
    setAddressSaveError(null);
    void addInstrumentAddress(a, makeDefault ?? false)
      .then((saved) => setAddressId(saved.id))
      .catch(() =>
        setAddressSaveError(
          'Address couldn’t be saved — check your connection and try again.',
        ),
      );
  };

  const handleSaveCard = (p: Omit<PaymentMethod, 'id' | 'isDefault'>) => {
    if (DATA_MODE === 'live') return;
    const saved = addPaymentMethod(p);
    setPaymentId(saved.id);
    setUseOneze(false);
  };

  return {
    router,
    itemId,
    resumeOrderId,
    items,
    loading,
    orderLoadFailed,
    boundOrder,
    orderId,
    refetchBoundOrder,
    steps,
    partialDataPrompt,
    addresses,
    addressId,
    setAddressId,
    selectedAddress,
    addressesError,
    refetchInstruments,
    addressSaveError,
    parcels,
    handleSelectDelivery,
    handleRetryQuotes,
    paymentMethods,
    paymentId,
    useOneze,
    handleSelectPayment,
    walletOption,
    paymentMethodsError,
    verificationRequested,
    setVerificationRequested,
    autoVerified,
    totals,
    bundleDiscount,
    effectiveDelivery,
    verification,
    canPay,
    paying,
    payStage,
    onezeRequired,
    payableTotal,
    payError,
    dispatchDays,
    handlePay,
    breakdownOpen,
    setBreakdownOpen,
    addAddressOpen,
    setAddAddressOpen,
    addCardOpen,
    setAddCardOpen,
    handleSaveAddress,
    handleSaveCard,
  };
}
