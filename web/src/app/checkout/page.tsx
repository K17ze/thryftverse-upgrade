'use client';

/**
 * /checkout — delivery address, payment method, order summary and the Pay
 * action. ?item=<id> checks out a single listing (Buy now); with no param
 * it consumes the bag. Address/payment rows are radio selectors; "Add new"
 * hands off to the real management routes (/settings/addresses,
 * /settings/payments). Success swaps to the confirmation surface with a
 * real (fixture-recorded) order id.
 */

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { useListing } from '@/lib/hooks/queries';
import { useStore } from '@/lib/store/useStore';
import { useSession } from '@/lib/session/SessionProvider';
import { useSavedAddresses, useSavedPaymentMethods } from '@/lib/store/userPaymentData';
import { bundleDiscountFor, listingById } from '@/lib/data/fixtures';
import { ORDER_DETAILS, orderTotals, recordOrder } from '@/lib/data/fixtures-commerce';
import { DATA_MODE } from '@/lib/api/client';
import * as commerceService from '@/lib/api/services/commerce';
import { AddressPicker, PaymentPicker } from '@/components/checkout/SelectionList';
import { OrderSummary } from '@/components/checkout/OrderSummary';
import { CheckoutSkeleton, CheckoutSuccess } from '@/components/checkout/CheckoutStates';
import { formatPrice } from '@/lib/utils/format';
import type { Listing } from '@/lib/contracts/domain';

function CheckoutInner() {
  const router = useRouter();
  const params = useSearchParams();
  const itemId = params.get('item');

  const bag = useStore((s) => s.bag);
  const removeFromBag = useStore((s) => s.removeFromBag);
  const { user } = useSession();
  const {
    addresses,
    defaultAddress,
  } = useSavedAddresses();
  const {
    methods: paymentMethods,
    defaultMethod,
  } = useSavedPaymentMethods();

  const { data: single, isLoading: itemLoading } = useListing(itemId ?? '');

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const items = useMemo<Listing[]>(() => {
    if (itemId) return single ? [single] : [];
    return bag
      .map((b) => listingById(b.listingId))
      .filter((l): l is Listing => !!l && !l.isSold);
  }, [itemId, single, bag]);

  const [addressId, setAddressId] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);

  // Seed the selection from the resolved defaults once — the persisted store
  // rehydrates after mount, so this can't live in useState initialisers.
  useEffect(() => {
    if (!hydrated) return;
    setAddressId((id) =>
      id && addresses.some((a) => a.id === id)
        ? id
        : (defaultAddress?.id ?? addresses[0]?.id ?? null),
    );
    setPaymentId((id) =>
      id && paymentMethods.some((p) => p.id === id)
        ? id
        : (defaultMethod?.id ?? paymentMethods[0]?.id ?? null),
    );
    // Only seed once hydration completes — subsequent list edits shouldn't
    // hijack an in-progress selection unless the chosen row disappeared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);
  const [paying, setPaying] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  const loading = itemId ? itemLoading : !hydrated;
  const totals = useMemo(() => orderTotals(items), [items]);
  // BUNDLE_RULE — same seller-group math the bag shows; 0 for ?item= buys.
  const bundleDiscount = useMemo(() => bundleDiscountFor(items), [items]);
  const payableTotal = Math.round((totals.total - bundleDiscount) * 100) / 100;
  const canPay = items.length > 0 && !!addressId && !!paymentId && !paying;

  const handlePay = async () => {
    if (!canPay) return;
    setPaying(true);
    if (DATA_MODE === 'live') {
      // Live checkout — one POST /orders per listing (the backend orders one
      // listing per order; the web bag multi-order surface collapses to the
      // first item for now, matching the mobile single-listing checkout).
      try {
        const buyerId = user?.id;
        if (!buyerId) throw new Error('not signed in');
        const first = items[0]!;
        const { orderId: created } = await commerceService.createOrder({
          listingId: first.id,
          buyerId,
          idempotencyKey: `web-${first.id}-${Date.now()}`,
          addressId: addressId ? Number(addressId) || undefined : undefined,
          paymentMethodId: paymentId ? Number(paymentId) || undefined : undefined,
        });
        if (!itemId) items.forEach((l) => removeFromBag(l.id));
        setOrderId(created);
      } catch {
        // Payment/order failure — stay on the sheet with a recoverable
        // state; the Pay button re-enables.
        setPaying(false);
      }
      return;
    }
    // Fixture latency — the payment intent round-trip in live mode.
    await new Promise((r) => setTimeout(r, 700));
    const order = recordOrder(items);
    if (bundleDiscount > 0) {
      // Keep the recorded fixture order honest with the amount paid: fold
      // the bundle deduction into the items line so the ledger still sums.
      order.totalPrice = payableTotal;
      const detail = ORDER_DETAILS[order.id];
      if (detail) detail.itemPrice = Math.round((totals.items - bundleDiscount) * 100) / 100;
    }
    if (!itemId) items.forEach((l) => removeFromBag(l.id));
    setOrderId(order.id);
  };

  if (orderId) {
    return <CheckoutSuccess orderId={orderId} />;
  }

  if (loading) {
    return <CheckoutSkeleton />;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon="bag"
        title={itemId ? 'This item is no longer available' : 'Nothing to check out'}
        subtitle={itemId ? 'It may have sold while you were browsing.' : 'Add items to your bag first.'}
        actionLabel="Browse items"
        onAction={() => router.push('/explore')}
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-6">
      <div className="flex items-center gap-2">
        <IconButton name="back" aria-label="Back" onClick={() => router.back()} className="-ml-2" />
        <h1 className="text-screen-title font-bold text-text-primary">Checkout</h1>
      </div>

      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-8">
          <AddressPicker
            addresses={addresses}
            selectedId={addressId}
            onSelect={setAddressId}
          />
          <div className="border-t border-border-subtle" />
          <PaymentPicker
            methods={paymentMethods}
            selectedId={paymentId}
            onSelect={setPaymentId}
          />
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <OrderSummary items={items} totals={totals} bundleDiscount={bundleDiscount} />
          <Button
            variant="primary"
            size="lg"
            fullWidth
            icon="lock"
            className="mt-5"
            disabled={!canPay}
            onClick={handlePay}
          >
            {paying ? 'Processing…' : `Pay ${formatPrice(payableTotal)}`}
          </Button>
          {(!addressId || !paymentId) && items.length > 0 ? (
            <p className="mt-2 text-center text-caption text-warning-text" role="alert">
              Select a delivery address and payment method to continue —
              manage them under Settings.
            </p>
          ) : null}
          {/* Trust sits next to the irreversible action — one compact line,
              not a banner (mirrors the mobile BuyerProtectionStrip moment). */}
          <p className="mt-4 flex items-start gap-1.5 text-caption text-text-secondary">
            <Icon name="shieldCheck" size={15} className="mt-px shrink-0 text-commerce-trust" />
            Covered by Buyer Protection — your money is held until the item arrives as described,
            then released to the seller. Full refund if it never arrives.
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
