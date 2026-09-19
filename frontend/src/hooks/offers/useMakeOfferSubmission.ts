import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction } from 'react';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../platform/server/queryKeys';
import { RootStackParamList } from '../../navigation/types';
import { useFormattedPrice } from '../useFormattedPrice';
import { useConnectivity } from '../useConnectivity';
import { useCurrencyContext } from '../../context/CurrencyContext';
import { useToast } from '../../context/ToastContext';
import {
  convertGbpToDisplayAmount,
  sanitizeDecimalInput } from '../../utils/currencyAuthoringFlows';
import {
  counterListingOfferOnApi,
  createListingOfferOnApi,
  lookupOfferByIdempotencyKey,
  type ListingOffer } from '../../services/listingOffersApi';
import { haptics } from '../../utils/haptics';
import { createStableId } from '../../utils/createStableId';
import { useUnknownOutcomeReconciliation } from '../useUnknownOutcomeReconciliation';
import { track } from '../../analytics';
import { t } from '../../i18n';
import { useStore } from '../../store/useStore';
import { createDmConversationOnApi } from '../../services/chatApi';

export interface UseMakeOfferSubmissionParams {
  navigation: NativeStackScreenProps<RootStackParamList, 'MakeOffer'>['navigation'];
  itemId: string;
  /** Live GBP listing price (fetched); falls back to the route param. */
  price: number;
  title: string;
  isCounterOffer: boolean;
  previousOffer: number | undefined;
  counterRound: number;
  parentOfferId: string | undefined;
  routeConversationId: string | undefined;
  listing: any;
  isMountedRef: MutableRefObject<boolean>;
  numericOffer: number;
  numericOfferGbp: number;
  setOfferPrice: Dispatch<SetStateAction<string>>;
}

export interface MakeOfferSubmissionResult {
  errorMsg: string;
  setErrorMsg: Dispatch<SetStateAction<string>>;
  isSubmitting: boolean;
  showReview: boolean;
  setShowReview: Dispatch<SetStateAction<boolean>>;
  expiryHours: number;
  setExpiryHours: Dispatch<SetStateAction<number>>;
  handleOfferChange: (value: string) => void;
  applyQuickOffer: (percentage: number) => void;
  handleReviewOffer: () => void;
  handleSendOffer: () => Promise<void>;
  handleMessageSeller: () => Promise<void>;
}

/**
 * Submission logic for MakeOfferScreen: amount validation, the review
 * step, idempotent create/counter with unknown-outcome reconciliation,
 * and the conversation resolution that returns to an existing thread
 * (route.params.conversationId) instead of opening a self-DM.
 */
export function useMakeOfferSubmission(params: UseMakeOfferSubmissionParams): MakeOfferSubmissionResult {
  const {
    navigation,
    itemId,
    price,
    title,
    isCounterOffer,
    previousOffer,
    counterRound,
    parentOfferId,
    routeConversationId,
    listing,
    isMountedRef,
    numericOffer,
    numericOfferGbp,
    setOfferPrice } = params;
  const { formatFromFiat } = useFormattedPrice();
  const { currencyCode, fxRates } = useCurrencyContext();
  const { show } = useToast();
  const queryClient = useQueryClient();
  const upsertConversation = useStore((state) => state.upsertConversation);
  const { isOffline } = useConnectivity();
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expiryHours, setExpiryHours] = useState(48);
  const [showReview, setShowReview] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  // Hard re-entrancy guard — isSubmitting state is async and the confirm
  // button can be double-tapped inside a single frame.
  const submittingRef = useRef(false);
  const { reconcile } = useUnknownOutcomeReconciliation();

  const handleOfferChange = (value: string) => {
    setOfferPrice(sanitizeDecimalInput(value));
    if (errorMsg) setErrorMsg('');
  };

  // Validation only — used by the "Review offer" button to advance to
  // the confirmation step without submitting.
  const validateOffer = useCallback((): string | null => {
    if (!numericOffer || !Number.isFinite(numericOfferGbp) || numericOfferGbp <= 0) {
      return t('makeOffer.error.invalidAmount');
    }
    if (numericOfferGbp > price * 2) {
      return t('makeOffer.error.tooHigh');
    }
    // Server counter cap is round 10 (POST /offers/:id/counter → 409 past
    // it) — fail here with an honest message instead of a dead submission.
    if (isCounterOffer && counterRound + 1 > 10) {
      return t('makeOffer.error.counterDepthExceeded');
    }
    if (!listing?.sellerId) {
      return t('makeOffer.error.couldNotLoadSeller');
    }
    return null;
  }, [numericOffer, numericOfferGbp, price, listing, formatFromFiat, isCounterOffer, counterRound]);

  const handleReviewOffer = useCallback(() => {
    const validationError = validateOffer();
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }
    haptics.tap();
    setErrorMsg('');
    setShowReview(true);
  }, [validateOffer, haptics]);

  // Resolve a real DM conversation via the backend before navigating to Chat.
  // Replaces fabricated IDs like `offer_${sellerId}_${itemId}`.
  // When the flow was launched from inside a conversation (counter-offers
  // from Chat or Offers carry route.params.conversationId) we go straight
  // back to it — creating a DM to listing.sellerId would self-DM a seller
  // who is countering their own received offer.
  const resolveAndOpenOfferConversation = useCallback(async (
    sellerId: string,
    focusQuery: string,
    offerPayload?: any,
  ) => {
    if (routeConversationId) {
      navigation.navigate('Chat', {
        conversationId: routeConversationId,
        focusQuery,
        offerPayload,
      });
      return;
    }
    try {
      const conversation = await createDmConversationOnApi({
        recipientUserId: sellerId,
        itemId,
      });
      upsertConversation(conversation);
      navigation.navigate('Chat', {
        conversationId: conversation.id,
        focusQuery,
        partnerUserId: sellerId,
        offerPayload,
      });
    } catch {
      show('Could not open chat. Try again.', 'error');
    }
  }, [itemId, routeConversationId, navigation, upsertConversation, show]);

  const handleSendOffer = async () => {
    // Re-entrancy: a double-tap inside one frame or a retry while the
    // reconciliation poll is still running must not submit twice.
    if (submittingRef.current) return;
    // The review step already validated, but re-check defensively.
    const validationError = validateOffer();
    if (validationError) {
      setErrorMsg(validationError);
      setShowReview(false);
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      // Persist the offer server-side so expiry, accept/decline and counter
      // chains are authoritative across devices. The server computes
      // expires_at — the frontend only suggests an expiryHours window.
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = createStableId(isCounterOffer ? 'counter' : 'offer');
      }
      if (isCounterOffer && !parentOfferId) {
        throw new Error(t('makeOffer.error.originalOfferUnavailable'));
      }
      const offer = isCounterOffer
        ? await counterListingOfferOnApi(parentOfferId!, {
          offerPriceGbp: numericOfferGbp,
          expiryHours,
          conversationId: routeConversationId,
          idempotencyKey: idempotencyKeyRef.current })
        : await createListingOfferOnApi({
          listingId: itemId,
          offerPriceGbp: numericOfferGbp,
          expiryHours,
          conversationId: routeConversationId,
          idempotencyKey: idempotencyKeyRef.current,
          metadata: {
            originalPriceGbp: price,
            source: 'initial' } });

      // The listing's active-offer count changed — mark its cached detail
      // stale so the item-detail social-proof line and manage-listing
      // metrics refetch rather than serving the pre-offer count.
      void queryClient.invalidateQueries({ queryKey: queryKeys.listing.detail(itemId) });

      track('offer_submitted', { item_id: itemId, offer_amount: numericOfferGbp });

      const offerText = isCounterOffer
        ? t('makeOffer.chat.counterOfferText', { amount: formatFromFiat(numericOfferGbp, 'GBP'), previousAmount: formatFromFiat(previousOffer ?? 0, 'GBP'), hours: expiryHours })
        : t('makeOffer.chat.offerText', { amount: formatFromFiat(numericOfferGbp, 'GBP'), title, hours: expiryHours });

      await resolveAndOpenOfferConversation(
        listing.sellerId,
        offerText,
        {
          offerId: offer.id,
          price: numericOfferGbp,
          originalPrice: price,
          expiresAt: offer.expiresAt,
          counterRound: offer.counterRound,
        },
      );
      show(t('makeOffer.toast.openingChat'), 'info');
    } catch (err) {
      const isNetworkError = isOffline || (err instanceof Error && /network|fetch|timeout/i.test(err.message));

      if (isNetworkError && idempotencyKeyRef.current) {
        // Lost response during offer submission — the server may have
        // committed. Poll for the authoritative status instead of telling
        // the user the offer failed (which invites an unsafe retry).
        setErrorMsg(t('makeOffer.error.checking'));
        const idempotencyKey = idempotencyKeyRef.current;
        const result = await reconcile<ListingOffer>({
          lookup: () => lookupOfferByIdempotencyKey(idempotencyKey),
          onAcknowledged: async (offer) => {
            idempotencyKeyRef.current = null;
            void queryClient.invalidateQueries({ queryKey: queryKeys.listing.detail(itemId) });
            const offerText = isCounterOffer
              ? t('makeOffer.chat.counterOfferText', { amount: formatFromFiat(numericOfferGbp, 'GBP'), previousAmount: formatFromFiat(previousOffer ?? 0, 'GBP'), hours: expiryHours })
              : t('makeOffer.chat.offerText', { amount: formatFromFiat(numericOfferGbp, 'GBP'), title, hours: expiryHours });
            await resolveAndOpenOfferConversation(
              listing.sellerId,
              offerText,
              {
                offerId: offer.id,
                price: numericOfferGbp,
                originalPrice: price,
                expiresAt: offer.expiresAt,
                counterRound: offer.counterRound,
              },
            );
            show(t('makeOffer.toast.openingChat') as string, 'info');
          },
          onSafeToRetry: () => {
            idempotencyKeyRef.current = null;
            setErrorMsg('');
            show(t('makeOffer.error.noOfferCreated'), 'info');
          },
          onUnresolved: () => {
            setErrorMsg(t('makeOffer.error.checkHistory'));
          },
          shouldContinue: () => isMountedRef.current });
        if (result.outcome === 'acknowledged' || result.outcome === 'safe_to_retry' || result.outcome === 'unresolved') {
          return;
        }
      }

      const message = isNetworkError
        ? t('makeOffer.error.offline')
        : err instanceof Error ? err.message : t('makeOffer.error.couldNotSubmit');
      setErrorMsg(message);
      // Deterministic failure (4xx, validation, conflict): the key's hash
      // no longer represents intent — regenerate so a retry after editing
      // the amount doesn't hit IDEMPOTENCY_PAYLOAD_MISMATCH. Network
      // failures keep the key so a resend reconciles as the same offer.
      if (!isNetworkError) {
        idempotencyKeyRef.current = null;
      }
      // Stay on review step so the user can retry without re-entering details.
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const applyQuickOffer = (percentage: number) => {
    const gbpAmount = price * percentage;
    const displayAmount = convertGbpToDisplayAmount(gbpAmount, currencyCode, fxRates);
    setOfferPrice((Number.isFinite(displayAmount) ? displayAmount : gbpAmount).toFixed(2));
    if (errorMsg) setErrorMsg('');
    haptics.tap();
  };

  const handleMessageSeller = useCallback(async () => {
    if (!listing?.sellerId) return;
    await resolveAndOpenOfferConversation(listing.sellerId, title);
    show(t('makeOffer.toast.openingSellerChat'), 'info');
  }, [itemId, navigation, listing?.sellerId, show, title, resolveAndOpenOfferConversation]);

  return {
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
    handleMessageSeller };
}
