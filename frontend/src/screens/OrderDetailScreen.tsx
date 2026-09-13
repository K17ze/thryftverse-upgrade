import React, { useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { openProfile } from '../navigation/openProfile';
import { openProductDetail } from '../platform/product/openProductDetail';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useOrderDetail } from '../hooks/useOrderDetail';
import {
  useOrderDetailViewModel,
  useOrderDetailTracking,
  useOrderDetailSheets,
  useReviewPrompt,
  useOrderDetailActions } from '../hooks/orderdetail';
import { haptics } from '../utils/haptics';
import { OfflineBanner } from '../components/OfflineBanner';
import { OrderDetailSummary } from '../components/orders/OrderDetailSummary';
import { OrderActionFooter } from '../components/orders/OrderActionFooter';
import { InspectionBanner } from '../components/orders/InspectionBanner';
import { CompletedOrderSummary } from '../components/orders/CompletedOrderSummary';
import { OrderCounterpartySection } from '../components/orders/OrderCounterpartySection';
import { EscrowBanner } from '../components/orders/EscrowBanner';
import { ShipmentDetails } from '../components/orders/ShipmentDetails';
import { TransactionBreakdown } from '../components/orders/TransactionBreakdown';
import { OrderSupportSection } from '../components/orders/OrderSupportSection';
import { OrderDetailSkeleton } from '../components/orders/OrderDetailSkeleton';
import { OrderDetailStatusHeader } from '../components/orders/OrderDetailStatusHeader';
import { DispatchExtensionBanner } from '../components/orders/DispatchExtensionBanner';
import { OrderTrackingSection } from '../components/orders/OrderTrackingSection';
import { OrderDetailSheets } from '../components/orders/OrderDetailSheets';
import {
  OrderDetailChrome,
  OrderDetailHeaderActions,
  OrderDetailLoadError,
  OrderDetailNotFound } from '../components/orders/OrderDetailChrome';
import {
  orderDetailScreenStyles as styles,
  createOrderDetailThemedStyles } from '../components/orders/orderDetailScreenStyles';

type RouteT = RouteProp<RootStackParamList, 'OrderDetail'>;

// --- Component ---

export default function OrderDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteT>();
  const { formatFromFiat } = useFormattedPrice();
  const { orderId } = route.params ?? {};
  const { colors } = useAppTheme();

  // Theme-aware color overrides for the static styles. The static
  // StyleSheet contains only non-color properties; colors are applied
  // via this themed proxy so the screen is fully dark-mode compatible.
  const themed = useMemo(() => createOrderDetailThemedStyles(colors), [colors]);

  // --- Data (fetch/poll/mutations live in hooks/useOrderDetail) ---
  const {
    backendOrder, parcelEvents, hasReview, isInitialLoading, isRefreshing,
    loadError, parcelError, orderMutation, isMountedRef,
    refreshOrder, handleCancel, handleDeliver } = useOrderDetail(orderId);

  // --- Derived view-model (status, roles, counterparty, capabilities) ---
  const {
    currentUser, openTicket, normalisedStatus, isKnown, statusLabel,
    statusExplanation, isCompleted, isBuyer, statusColor, statusSubtleColor,
    listingId, listingExists, orderTitle, orderImage, orderSubtotal,
    orderSubtitle, counterparty, subtotal, platformCharge, buyerProtectionFee,
    postageFee, totalPaid, capabilities, mutationLocked, pendingExtension,
    proposedShipByLabel, shortOrderId, carrierTrackingUrl } = useOrderDetailViewModel({
    orderId, backendOrder, parcelEvents, hasReview, orderMutation });

  // --- Tracking/timeline derived data ---
  const {
    timelineEntries, shipmentLastUpdated, latestEventSummary, snapshot,
    etaWindow, estimatedDeliveryDate, estimatedDeliveryLabel, isStaleTracking,
    contextualIssues, packageSummary, showShipmentDetails } = useOrderDetailTracking({
    backendOrder, parcelEvents, hasReview, normalisedStatus, isBuyer, openTicket });

  // --- Review prompt (auto-surface after eligibility window) ---
  const {
    reviewPromptVisible, openReviewPrompt, closeReviewPrompt, deferReviewPrompt,
  } = useReviewPrompt({
    backendOrder, currentUserId: currentUser?.id, isMountedRef });

  // --- Sheet/overlay state ---
  const {
    actionsSheetVisible, setActionsSheetVisible, issueSelectorVisible,
    setIssueSelectorVisible, confirmSheet, setConfirmSheet, dismissConfirmSheet,
  } = useOrderDetailSheets();

  const scrollViewRef = useRef<ScrollView | null>(null);
  const timelineYRef = useRef(0);

  // --- Interaction handlers + footer/overflow action configs ---
  const {
    resolveAndOpenConversation, handleTrackOnCarrierSite,
    handleIssueCategorySelect, isRespondingExtension, handleRespondExtension,
    handleCopyTracking, handleOpenShippingLabel, handleManualRefresh,
    footerActions, overflowActions } = useOrderDetailActions({
    orderId, backendOrder, isBuyer, isKnown, capabilities, counterparty,
    openTicket, carrierTrackingUrl, pendingExtension, normalisedStatus,
    orderMutation, mutationLocked, isMountedRef, refreshOrder,
    handleCancel, handleDeliver, scrollViewRef, timelineYRef,
    openReviewPrompt, setIssueSelectorVisible, setConfirmSheet });

  // --- Render ---

  if (isInitialLoading) {
    return (
      <OrderDetailChrome onBack={() => navigation.goBack()}>
        <OrderDetailSkeleton />
      </OrderDetailChrome>
    );
  }

  if (!backendOrder && loadError) {
    return (
      <OrderDetailChrome onBack={() => navigation.goBack()}>
        <OrderDetailLoadError
          onRetry={() => { haptics.tap(); void refreshOrder(false); }}
        />
      </OrderDetailChrome>
    );
  }

  if (!backendOrder) {
    return (
      <OrderDetailChrome onBack={() => navigation.goBack()}>
        <OrderDetailNotFound />
      </OrderDetailChrome>
    );
  }

  const fiatOpts = { displayMode: 'fiat' as const };

  return (
    <OrderDetailChrome
      onBack={() => navigation.goBack()}
      rightAction={
        <OrderDetailHeaderActions
          isRefreshing={isRefreshing}
          onRefresh={handleManualRefresh}
          onMore={() => { haptics.tap(); setActionsSheetVisible(true); }}
        />
      }
    >
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: footerActions.primary || footerActions.secondary ? 100 + insets.bottom : 40 + insets.bottom }]}
      >
        {/* Offline banner */}
        <OfflineBanner onRetry={() => { haptics.tap(); void refreshOrder(false); }} />

        {/* 2. Current order status and order number */}
        <OrderDetailStatusHeader
          shortOrderId={shortOrderId}
          statusLabel={statusLabel}
          statusExplanation={statusExplanation}
          statusColor={statusColor}
          statusSubtleColor={statusSubtleColor}
          updatedAt={backendOrder.updatedAt}
          canDispatch={capabilities?.canDispatch}
          shipByDate={capabilities?.shipByDate ?? null}
          shipped={!!backendOrder.shippedAt}
        />

        {loadError && backendOrder ? (
          <View style={styles.refreshErrorRow}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.textMuted} aria-hidden={true} />
            <Text style={[styles.refreshErrorText, themed.refreshErrorText]}>{loadError}</Text>
            <Pressable
              onPress={() => { haptics.tap(); void refreshOrder(false); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Retry refresh"
            >
              <Text style={[styles.retryLink, themed.retryLink]}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.sectionDivider, themed.sectionDivider]} />

        {/* 3. Historical item summary */}
        <OrderDetailSummary
          title={orderTitle}
          imageUrl={orderImage}
          subtitle={orderSubtitle}
          priceLabel={formatFromFiat(orderSubtotal ?? 0, 'GBP', fiatOpts)}
          listingAvailable={listingExists}
          onPress={listingExists && listingId ? () => {
            haptics.tap();
            openProductDetail(navigation, { referenceKind: 'listing', canonicalId: listingId, sourceSurface: 'OrderDetailSummary' });
          } : undefined}
        />

        <View style={[styles.sectionDivider, themed.sectionDivider]} />

        {/* 4. Role-aware counterparty */}
        {counterparty ? (
          <OrderCounterpartySection
            counterparty={counterparty}
            listingId={backendOrder.listingId}
            currentUserId={currentUser?.id}
            navigation={navigation}
            onMessage={(cp, listingId) => {
              haptics.tap();
              resolveAndOpenConversation(cp.id, listingId, cp.username);
            }}
          />
        ) : null}

        <View style={[styles.sectionDivider, themed.sectionDivider]} />

        {/* 4c. Escrow status indicator — shows when funds are held */}
        {!isCompleted && isBuyer && (normalisedStatus === 'paid' || normalisedStatus === 'shipped' || normalisedStatus === 'in transit' || normalisedStatus === 'out for delivery') ? (
          <EscrowBanner order={backendOrder} normalisedStatus={normalisedStatus} />
        ) : null}

        {/* 4c2. Pending dispatch extension — buyer approves/declines inline.
            For the seller this is a single muted status line instead.
            The action card requires the real capability so a stale pending
            extension on a delivered/completed order can't offer dead CTAs. */}
        <DispatchExtensionBanner
          extension={pendingExtension}
          isBuyer={isBuyer}
          canRespondExtension={capabilities?.canRespondExtension}
          proposedShipByLabel={proposedShipByLabel}
          isResponding={isRespondingExtension}
          onRespond={handleRespondExtension}
        />

        {/* 4d. Buyer inspection window — shown when delivered but not yet completed */}
        {!isCompleted && isBuyer && normalisedStatus === 'delivered' ? (
          <InspectionBanner
            inspectionDeadlineAt={backendOrder.inspectionDeadlineAt ?? null}
            onConfirmReceipt={() => {
              haptics.heavyPress();
              setConfirmSheet({
                visible: true,
                title: 'Everything is OK?',
                message: 'By confirming, you confirm the item matches the listing. This releases the held funds to the seller. This action cannot be undone.',
                confirmLabel: 'Confirm receipt',
                cancelLabel: 'Not yet',
                onConfirm: handleDeliver,
                variant: 'default' });
            }}
            onReportIssue={() => {
              haptics.tap();
              setIssueSelectorVisible(true);
            }}
          />
        ) : null}

        {/* 4e. Completed order — quiet completion state, operational chrome collapsed */}
        {isCompleted ? (
          <CompletedOrderSummary
            hasReview={hasReview}
            onLeaveReview={() => { haptics.tap(); openReviewPrompt(); }}
            onBuyAgain={() => {
              haptics.tap();
              if (counterparty) {
                openProfile(navigation, counterparty.id, currentUser?.id);
              } else if (backendOrder?.sellerId) {
                openProfile(navigation, backendOrder.sellerId, currentUser?.id);
              }
            }}
            onViewReceipt={() => { haptics.tap(); navigation.navigate('OrderReceipt', { orderId }); }}
            onViewSupportHistory={() => { haptics.tap(); navigation.navigate('OrderSupport', { orderId }); }}
          />
        ) : null}

        {!isCompleted ? (
          <View style={[styles.sectionDivider, themed.sectionDivider]} />
        ) : null}

        {/* 5. Tracking or order timeline — hidden when completed */}
        {!isCompleted ? (
          <OrderTrackingSection
            onTimelineLayout={(e) => { timelineYRef.current = e.nativeEvent.layout.y; }}
            packageTitle={orderTitle}
            packageImageUrl={orderImage}
            packageSubtitle={orderSubtitle}
            onPackagePress={listingExists && listingId ? () => {
              haptics.tap();
              openProductDetail(navigation, { referenceKind: 'listing', canonicalId: listingId, sourceSurface: 'OrderDetailPackage' });
            } : undefined}
            isBuyer={isBuyer}
            etaWindow={etaWindow}
            normalisedStatus={normalisedStatus}
            estimatedDeliveryDate={estimatedDeliveryDate}
            estimatedDeliveryLabel={estimatedDeliveryLabel}
            serviceName={snapshot?.serviceName ?? null}
            isStaleTracking={isStaleTracking}
            latestEventSummary={latestEventSummary}
            entries={timelineEntries}
            warningText={parcelError ?? undefined}
          />
        ) : null}

        {/* 6. Shipment details — hidden when completed */}
        {!isCompleted && showShipmentDetails ? (
          <>
            <View style={[styles.sectionDivider, themed.sectionDivider]} />
            <ShipmentDetails
              order={backendOrder}
              carrierTrackingUrl={carrierTrackingUrl}
              shipmentLastUpdated={shipmentLastUpdated}
              packageSummary={packageSummary}
              destinationSummary={snapshot?.destinationSummary}
              onCopyTracking={handleCopyTracking}
              onTrackOnCarrierSite={handleTrackOnCarrierSite}
              onOpenShippingLabel={handleOpenShippingLabel}
            />
          </>
        ) : null}

        <View style={[styles.sectionDivider, themed.sectionDivider]} />

        {/* 7. Transaction breakdown */}
        <TransactionBreakdown
          subtotal={subtotal}
          platformCharge={platformCharge}
          buyerProtectionFee={buyerProtectionFee}
          postageFee={postageFee}
          totalPaid={totalPaid}
          formatFromFiat={formatFromFiat}
          fiatOpts={fiatOpts}
        />

        <View style={[styles.sectionDivider, themed.sectionDivider]} />

        {/* 8. Support state */}
        <OrderSupportSection
          openTicket={openTicket}
          onPressOpenTicket={(ticketId) => navigation.navigate('SupportTicketDetail', { ticketId })}
          onPressGetSupport={() => navigation.navigate('OrderSupport', { orderId })}
        />
      </ScrollView>

      {/* 9. Sticky role/status action footer */}
      <OrderActionFooter
        primaryAction={footerActions.primary}
        secondaryAction={footerActions.secondary}
        bottomInset={insets.bottom}
      />

      {/* 10. Sheets layer: overflow actions, review prompt, issue selector, confirm */}
      <OrderDetailSheets
        actionsSheetVisible={actionsSheetVisible}
        orderStatus={normalisedStatus}
        role={isBuyer ? 'buyer' : 'seller'}
        orderId={orderId}
        listingAvailable={listingExists}
        overflowActions={overflowActions}
        onCloseActionsSheet={() => setActionsSheetVisible(false)}
        reviewPromptVisible={reviewPromptVisible}
        reviewItemTitle={backendOrder?.listingTitle}
        reviewItemImage={backendOrder?.listingImageUrl}
        reviewSellerName={counterparty?.username}
        onCloseReviewPrompt={closeReviewPrompt}
        onDeferReviewPrompt={deferReviewPrompt}
        onWriteReview={(rating) => {
          closeReviewPrompt();
          navigation.navigate('WriteReview', { orderId, initialRating: rating });
        }}
        issueSelectorVisible={issueSelectorVisible}
        contextualIssues={contextualIssues}
        onSelectIssue={handleIssueCategorySelect}
        onCloseIssueSelector={() => setIssueSelectorVisible(false)}
        confirmSheet={confirmSheet}
        onDismissConfirmSheet={dismissConfirmSheet}
      />
    </OrderDetailChrome>
  );
}
