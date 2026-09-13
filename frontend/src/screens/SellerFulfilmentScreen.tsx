import React, { useMemo } from 'react';
import { ScrollView, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useAppTheme } from '../theme/ThemeContext';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import {
  FulfilmentItemHeader,
  IntegratedDispatchSection,
  ManualDispatchSection,
  DispatchBlockedNotice,
  DispatchExtensionSection,
  DispatchConfirmFooter,
  createSellerFulfilmentStyles } from '../components/sellerfulfilment';
import {
  useSellerFulfilment,
  useSellerFulfilmentViewModel,
  useSellerFulfilmentActions } from '../hooks/sellerfulfilment';

type SellerFulfilmentRoute = RouteProp<{ SellerFulfilment: { orderId: string } }, 'SellerFulfilment'>;

/**
 * SellerFulfilmentScreen — thin orchestrator.
 *
 * Data/state lives in hooks/sellerfulfilment, presentation in
 * components/sellerfulfilment, and pure derivation/formatting in
 * components/sellerfulfilment/fulfilmentViewModels. This file owns only
 * composition, navigation wiring, and the loading/error/permission gates.
 */
export default function SellerFulfilmentScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<SellerFulfilmentRoute>();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createSellerFulfilmentStyles(colors), [colors]);

  const { orderId } = route.params ?? {};

  // --- Data + interaction state ---
  const {
    order,
    isLoading,
    loadError,
    hasReview,
    isMountedRef,
    fetchOrder,
    retryLoad,
    trackingNumber,
    setTrackingNumber,
    shippingProvider,
    setShippingProvider,
    showCarrierDropdown,
    setShowCarrierDropdown,
    isDispatching,
    setIsDispatching,
    isGeneratingLabel,
    setIsGeneratingLabel,
    generatedLabelUrl,
    setGeneratedLabelUrl,
    labelError,
    setLabelError,
    labelErrorCode,
    setLabelErrorCode,
    extensionPickerOpen,
    setExtensionPickerOpen,
    extensionDays,
    setExtensionDays,
    isProposingExtension,
    setIsProposingExtension,
    confirmSheet,
    setConfirmSheet,
    dismissConfirmSheet,
  } = useSellerFulfilment(orderId);

  // --- Derived view-model (capabilities, delivery mode, ship-by, escrow) ---
  const {
    isSeller,
    canDispatch,
    canProposeExtension,
    pendingExtension,
    snapshot,
    isIntegrated,
    labelGenerationUnavailable,
    shipByLabel,
    shipByUrgent,
    shipByOverdue,
    shipByText,
    serviceName,
    etaWindow,
    escrowFootnote,
    statusLabel,
    shortOrderId,
  } = useSellerFulfilmentViewModel({
    order,
    hasReview,
    labelErrorCode,
    generatedLabelUrl });

  // --- Dispatch handlers ---
  const {
    handleGenerateLabel,
    handleShowQR,
    handleFindDropOff,
    handleDroppedOffRecovery,
    handleProposeExtension,
    handleDispatchConfirmPress,
  } = useSellerFulfilmentActions({
    orderId,
    snapshot,
    serviceName,
    canDispatch,
    canProposeExtension,
    trackingNumber,
    setTrackingNumber,
    shippingProvider,
    isDispatching,
    setIsDispatching,
    isGeneratingLabel,
    setIsGeneratingLabel,
    generatedLabelUrl,
    setGeneratedLabelUrl,
    setLabelError,
    setLabelErrorCode,
    extensionDays,
    setExtensionDays,
    setExtensionPickerOpen,
    isProposingExtension,
    setIsProposingExtension,
    setConfirmSheet,
    isMountedRef,
    fetchOrder });

  // --- Loading / error / permission states ---

  if (isLoading) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Dispatch" onBack={() => navigation.goBack()} />}>
        <FlagshipState variant="loading" />
      </FlagshipScreen>
    );
  }

  if (loadError || !order) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Dispatch" onBack={() => navigation.goBack()} />}>
        <FlagshipState
          variant="error"
          icon="cloud-offline-outline"
          title="Order could not be loaded"
          actionLabel="Retry"
          onAction={retryLoad}
        />
      </FlagshipScreen>
    );
  }

  if (!isSeller) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Dispatch" onBack={() => navigation.goBack()} />}>
        <FlagshipState
          variant="empty"
          icon="lock-closed-outline"
          title="Only the seller can dispatch this order"
        />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      header={<FlagshipHeader title={`Order #${shortOrderId}`} onBack={() => navigation.goBack()} />}
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 + insets.bottom }]}
      >
        {/* ─── A. Item-dominant header ─── */}
        <FulfilmentItemHeader
          imageUrl={order.listingImageUrl}
          title={order.listingTitle}
          shipByText={shipByText}
          shipByUrgent={shipByUrgent}
          shipByOverdue={shipByOverdue}
          serviceName={serviceName}
          trackingIncluded={snapshot?.trackingIncluded}
          etaWindow={etaWindow}
        />

        {/* ─── D. Escrow footnote ─── */}
        {escrowFootnote && <Text style={styles.escrowFootnote}>{escrowFootnote}</Text>}

        {/* ─── B. One next action ───
            Only the current next action is shown. Completed steps are
            replaced, not retained as "done" cards. */}
        {!canDispatch ? (
          <DispatchBlockedNotice statusLabel={statusLabel} />
        ) : isIntegrated && !labelGenerationUnavailable ? (
          <IntegratedDispatchSection
            generatedLabelUrl={generatedLabelUrl}
            shipByLabel={shipByLabel}
            isGeneratingLabel={isGeneratingLabel}
            isDispatching={isDispatching}
            labelError={labelError}
            onShowQR={handleShowQR}
            onFindDropOff={handleFindDropOff}
            onGenerateLabel={handleGenerateLabel}
            onDroppedOffRecovery={handleDroppedOffRecovery}
          />
        ) : (
          /* ─── Manual mode OR label generation unavailable ─── */
          <ManualDispatchSection
            labelGenerationUnavailable={labelGenerationUnavailable}
            labelError={labelError}
            trackingNumber={trackingNumber}
            onChangeTrackingNumber={setTrackingNumber}
            shippingProvider={shippingProvider}
            showCarrierDropdown={showCarrierDropdown}
            onToggleCarrierDropdown={() => setShowCarrierDropdown(!showCarrierDropdown)}
            onSelectCarrier={(carrier) => {
              setShippingProvider(carrier);
              setShowCarrierDropdown(false);
            }}
          />
        )}

        {/* ─── G. Dispatch extension — quiet row, not a panel. ─── */}
        <DispatchExtensionSection
          pendingExtension={pendingExtension}
          canProposeExtension={canProposeExtension}
          pickerOpen={extensionPickerOpen}
          selectedDays={extensionDays}
          isProposing={isProposingExtension}
          onToggle={() => setExtensionPickerOpen((v) => !v)}
          onSelectDays={setExtensionDays}
          onConfirm={handleProposeExtension}
        />
      </ScrollView>

      {/* ─── F. Footer: manual dispatch confirm ───
          Integrated shipping has no manual confirm button (the carrier scan
          advances state). */}
      {canDispatch && (!isIntegrated || labelGenerationUnavailable) && (
        <DispatchConfirmFooter
          bottomInset={insets.bottom}
          isDispatching={isDispatching}
          onConfirmPress={handleDispatchConfirmPress}
        />
      )}

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={dismissConfirmSheet}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel}
        cancelLabel={confirmSheet.cancelLabel}
        onConfirm={confirmSheet.onConfirm}
        variant={confirmSheet.variant}
      />
    </FlagshipScreen>
  );
}
