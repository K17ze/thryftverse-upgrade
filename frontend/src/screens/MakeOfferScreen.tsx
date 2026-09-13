import React, { useRef } from 'react';
import { ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useA11yAudit } from '../hooks/useA11yAudit';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { haptics } from '../utils/haptics';
import { t } from '../i18n';
import {
  MakeOfferItemSummary,
  MakeOfferPriceSection,
  MakeOfferExpirySection,
  MakeOfferSummarySection,
  MakeOfferErrorBlock,
  MakeOfferReviewSheet,
  MakeOfferFooter,
  makeOfferScreenStyles as styles } from '../components/offers';
import {
  useMakeOfferListing,
  useMakeOfferSubmission } from '../hooks/offers';


type Props = NativeStackScreenProps<RootStackParamList, 'MakeOffer'>;

export default function MakeOfferScreen({ navigation, route }: Props) {
  const a11yRef = useRef<any>(null);
  useA11yAudit(a11yRef, 'MakeOfferScreen');
  const { itemId, price, title } = route.params ?? {};
  const reducedMotionEnabled = useReducedMotion();
  const isCounterOffer = route.params?.counterOffer ?? false;
  const previousOffer = route.params?.previousOffer;
  const counterRound = route.params?.counterRound ?? 0;
  const parentOfferId = route.params?.parentOfferId;
  // Set when the offer flow was opened from inside a conversation (e.g. a
  // counter from Chat or the Offers surface). Threaded into the create/
  // counter payload so listing_offers.conversation_id links the
  // negotiation to that thread (feeds the chat context-bar offer badge).
  const routeConversationId = route.params?.conversationId;

  const {
    listing,
    isLoading,
    offerPrice,
    setOfferPrice,
    isMountedRef,
    numericOffer,
    numericOfferGbp,
    platformChargeGbp,
    total,
    discountPct,
    itemImageUri } = useMakeOfferListing({
    itemId,
    price,
    isCounterOffer,
    previousOffer });

  const {
    errorMsg,
    setErrorMsg,
    isSubmitting,
    showReview,
    setShowReview,
    expiryHours,
    setExpiryHours,
    handleOfferChange,
    applyQuickOffer,
    handleReviewOffer,
    handleSendOffer,
    handleMessageSeller } = useMakeOfferSubmission({
    navigation,
    itemId,
    price,
    title,
    isCounterOffer,
    previousOffer,
    parentOfferId,
    routeConversationId,
    listing,
    isMountedRef,
    numericOffer,
    numericOfferGbp,
    setOfferPrice });

  return (
    <FlagshipScreen
      ref={a11yRef}
      header={
        <FlagshipHeader
          title={isCounterOffer ? t('makeOffer.header.counterOffer') : t('makeOffer.header.makeOffer')}
          onBack={() => navigation.goBack()}
          backIcon="close"
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <MakeOfferItemSummary
          title={title}
          price={price}
          itemImageUri={itemImageUri}
          onMessageSeller={handleMessageSeller}
        />

        <MakeOfferPriceSection
          isCounterOffer={isCounterOffer}
          previousOffer={previousOffer}
          price={price}
          listing={listing}
          offerPrice={offerPrice}
          numericOfferGbp={numericOfferGbp}
          discountPct={discountPct}
          onChangeOffer={handleOfferChange}
          onQuickOffer={applyQuickOffer}
        />

        <MakeOfferExpirySection
          expiryHours={expiryHours}
          onSelect={(hours) => { setExpiryHours(hours); haptics.tap(); }}
        />

        <MakeOfferSummarySection
          numericOfferGbp={numericOfferGbp}
          platformChargeGbp={platformChargeGbp}
          total={total}
        />

        {!!errorMsg && !showReview && (
          <MakeOfferErrorBlock
            message={errorMsg}
            onRetry={() => {
              setErrorMsg('');
              if (showReview) {
                void handleSendOffer();
              }
            }}
          />
        )}
      </ScrollView>

      {/* ── Review overlay ──
            Full-screen confirmation step shown before the offer is
            submitted. Displays the offer amount, listing, and seller
            so the user can verify before committing. One dominant
            action (Confirm), one cancel (Back). */}
      {showReview && (
        <MakeOfferReviewSheet
          isCounterOffer={isCounterOffer}
          previousOffer={previousOffer}
          itemImageUri={itemImageUri}
          title={title}
          price={price}
          numericOfferGbp={numericOfferGbp}
          platformChargeGbp={platformChargeGbp}
          total={total}
          expiryHours={expiryHours}
          errorMsg={errorMsg}
          isSubmitting={isSubmitting}
          onDismiss={() => { if (!isSubmitting) setShowReview(false); }}
          onRetry={() => { setErrorMsg(''); void handleSendOffer(); }}
          onConfirm={handleSendOffer}
        />
      )}

      {/* ── Sticky footer ──
            Full-width CTA. In the compose phase, the button advances to
            the review step. In the review phase, the review sheet has its
            own confirm button. Per Design.md dock-geometry: single-action
            height, brand fill, full width. */}
      {!showReview && (
        <MakeOfferFooter
          isLoading={isLoading}
          isCounterOffer={isCounterOffer}
          total={total}
          numericOffer={numericOffer}
          numericOfferGbp={numericOfferGbp}
          title={title}
          isSubmitting={isSubmitting}
          onReview={handleReviewOffer}
        />
      )}
    </FlagshipScreen>
  );
}
