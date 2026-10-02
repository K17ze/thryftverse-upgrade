'use client';

/**
 * /checkout — delivery address, per-parcel delivery speed, payment method
 * (card or the 1ZE wallet), verification add-on, order summary and the Pay
 * action. ?item=<id> checks out a single listing (Buy now); with no param
 * it consumes the bag; ?order=<id> resumes an unpaid 'created' order.
 *
 * Decomposed into domain components & hooks (<400 LOC standard):
 *  - useCheckoutWorkflow
 *  - useCheckoutDeliveryState
 *  - useCheckoutPaymentExecution
 *  - CheckoutFormRail
 *  - CheckoutAside
 *  - CheckoutStates
 */

import { Suspense } from 'react';
import { IconButton } from '@/components/ui/IconButton';
import { BreakdownSheet } from '@/components/checkout/BreakdownSheet';
import { PartialDataBanner } from '@/components/checkout/PartialDataBanner';
import {
  CheckoutProgressDots,
  CheckoutProgressOverlay,
  CHECKOUT_STAGE_LABELS,
} from '@/components/checkout/CheckoutProgress';
import { AddAddressSheet, AddCardSheet } from '@/components/checkout/AddPaymentSheets';
import {
  CheckoutEmptyGate,
  CheckoutSkeleton,
  CheckoutSuccess,
} from '@/components/checkout/CheckoutStates';
import { CheckoutFormRail } from '@/components/checkout/CheckoutFormRail';
import { CheckoutAside } from '@/components/checkout/CheckoutAside';
import { useCheckoutWorkflow } from '@/components/checkout/useCheckoutWorkflow';

function CheckoutInner() {
  const {
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
  } = useCheckoutWorkflow();

  if (orderId) {
    return <CheckoutSuccess orderId={orderId} />;
  }

  if (loading) {
    return <CheckoutSkeleton />;
  }

  if (
    (resumeOrderId && orderLoadFailed) ||
    (resumeOrderId && (!boundOrder || boundOrder.status !== 'created')) ||
    items.length === 0
  ) {
    return (
      <CheckoutEmptyGate
        resumeOrderId={resumeOrderId}
        itemId={itemId}
        orderLoadFailed={orderLoadFailed}
        boundOrder={boundOrder}
        itemsLength={items.length}
        onRetryOrder={() => void refetchBoundOrder()}
        onViewOrder={() => router.replace(`/orders/${resumeOrderId}`)}
        onBrowseItems={() => router.push('/explore')}
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1000px] px-4 pb-24 pt-8 sm:px-6">
      <div className="flex items-center gap-2">
        <IconButton
          name="back"
          aria-label="Back"
          onClick={() => router.back()}
          className="-ml-2"
        />
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

      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <CheckoutFormRail
          addresses={addresses}
          addressId={addressId}
          onSelectAddress={setAddressId}
          onAddAddress={() => setAddAddressOpen(true)}
          addressesError={addressesError}
          refetchInstruments={refetchInstruments}
          addressSaveError={addressSaveError}
          parcels={parcels}
          onSelectDelivery={handleSelectDelivery}
          selectedAddress={selectedAddress}
          onRetryQuotes={handleRetryQuotes}
          paymentMethods={paymentMethods}
          paymentId={paymentId}
          useOneze={useOneze}
          onSelectPayment={handleSelectPayment}
          onAddCard={() => setAddCardOpen(true)}
          walletOption={walletOption}
          paymentMethodsError={paymentMethodsError}
          verificationRequested={verificationRequested}
          onToggleVerification={() => setVerificationRequested((v) => !v)}
          autoVerified={autoVerified}
        />

        <CheckoutAside
          items={items}
          totals={totals}
          bundleDiscount={bundleDiscount}
          effectiveDelivery={effectiveDelivery}
          verification={verification}
          autoVerified={autoVerified}
          canPay={canPay}
          paying={paying}
          payStage={payStage}
          useOneze={useOneze}
          onezeRequired={onezeRequired}
          payableTotal={payableTotal}
          payError={payError}
          dispatchDays={dispatchDays}
          onOpenBreakdown={() => setBreakdownOpen(true)}
          onPay={handlePay}
        />
      </div>

      {payStage ? (
        <CheckoutProgressOverlay label={CHECKOUT_STAGE_LABELS[payStage]} />
      ) : null}

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
        onSave={handleSaveAddress}
      />

      <AddCardSheet
        open={addCardOpen}
        onClose={() => setAddCardOpen(false)}
        onSave={handleSaveCard}
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
