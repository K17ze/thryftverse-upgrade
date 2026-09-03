import { useCallback, useEffect, useState } from 'react';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import type { Listing } from '../../services/listingsApi';
import type { SellerTrustSummary } from '../../platform/product';
import { useStore } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';
import { useHaptic } from '../useHaptic';
import { useSignupWall } from '../useSignupWall';
import { createDmConversationOnApi } from '../../services/chatApi';
import { trackListingInteraction } from '../../services/listingsApi';
import { enablePriceAlert, disablePriceAlert, getPriceAlertStatus } from '../../services/priceAlertsApi';
import { ProductAnalytics } from '../../platform/product';
import { track } from '../../analytics/track';
import { openProfile } from '../../navigation/openProfile';

type ItemDetailNav = NativeStackNavigationProp<RootStackParamList>;

export interface ItemDetailActionsContext {
  /** The resolved listing (null while loading). Actions no-op when null. */
  listing: Listing | null;
  /** Resolved seller trust summary. */
  seller: SellerTrustSummary | null;
  /** Current user id (for owner checks + profile navigation). */
  currentUserId: string | undefined;
  /** Navigation prop from the screen. */
  navigation: ItemDetailNav;
}

export interface ItemDetailActionsResult {
  /** Whether the listing is wishlisted. */
  isFav: boolean;
  /** Whether the listing is saved to any collection. */
  isSavedToCollection: boolean;
  /** Toggle the wishlist (fav) state with auth wall + analytics. */
  handleToggleFav: () => void;
  /** Double-tap gesture: heavy haptic + optimistic fav. */
  handleDoubleTap: () => void;
  /** Open the share sheet + fire share analytics. */
  handleShare: () => void;
  /** Whether the share sheet is visible (owned by the hook). */
  shareVisible: boolean;
  /** Close the share sheet. */
  closeShare: () => void;
  /** Navigate to the seller profile. */
  handleViewSeller: () => void;
  /** Start a DM conversation with the seller, then navigate to Chat. */
  handleMessageSeller: () => Promise<void>;
  /** Navigate to the report flow for this listing. */
  handleReport: () => void;
  /** Navigate to checkout (buy now). */
  handleBuyNow: () => void;
  /** Fire make-offer analytics (caller owns the sheet visibility state). */
  handleMakeOffer: () => void;
  /** Enquire (brokered tier) — open a DM with the seller. */
  handleEnquire: () => Promise<void>;
  /** Request viewing (brokered tier) — open a DM with the seller. */
  handleRequestViewing: () => Promise<void>;
  /** True while a DM conversation is being resolved. */
  isResolvingConversation: boolean;
  /** Toggle the price-drop alert for this listing. */
  handleTogglePriceAlert: () => Promise<void>;
  /** Current price-alert enabled state. */
  priceAlertEnabled: boolean;
  /** True while the price-alert toggle is in flight. */
  priceAlertLoading: boolean;
}

/**
 * Owns the action orchestration for the item detail screen: share, save /
 * wishlist, report, navigate-to-seller, message-seller, buy-now, make-offer,
 * and the price-drop alert toggle. Each action wires the auth wall, haptics,
 * analytics and toast feedback so the screen only has to bind handlers to
 * its visual affordances.
 */
export function useItemDetailActions(
  ctx: ItemDetailActionsContext,
): ItemDetailActionsResult {
  const { listing: item, seller, currentUserId, navigation } = ctx;

  const isFav = useStore((state) => state.isWishlisted(item?.id ?? ''));
  const toggleFav = useStore((state) => state.toggleWishlist);
  const isItemSavedAnywhere = useStore((state) => state.isItemSavedAnywhere);
  const upsertConversation = useStore((state) => state.upsertConversation);
  const { show } = useToast();
  const haptic = useHaptic();
  const { requireAuth } = useSignupWall();

  const [isResolvingConversation, setIsResolvingConversation] = useState(false);
  const [priceAlertEnabled, setPriceAlertEnabled] = useState(false);
  const [priceAlertLoading, setPriceAlertLoading] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);

  // Fetch initial price-alert status from the backend. Default to off if
  // the endpoint is unavailable.
  useEffect(() => {
    if (!item?.id) return;
    let cancelled = false;
    getPriceAlertStatus(item.id)
      .then((enabled) => { if (!cancelled) setPriceAlertEnabled(enabled); })
      .catch(() => { /* endpoint may not exist yet — default to off */ });
    return () => { cancelled = true; };
  }, [item?.id]);

  const handleToggleFav = useCallback(() => {
    if (!item) return;
    if (!requireAuth('save_item')) return;
    toggleFav(item.id);
    ProductAnalytics.itemSave(item.id);
    track('item_favorited', { listing_id: item.id, action: isFav ? 'unsave' : 'save' });
    if (!isFav) {
      trackListingInteraction(item.id, 'save').catch(() => {});
      show('Added to wishlist', 'success');
    }
  }, [item, requireAuth, toggleFav, isFav, show]);

  const handleDoubleTap = useCallback(() => {
    haptic.heavy();
    if (item && !isFav) {
      if (!requireAuth('save_item')) return;
      toggleFav(item.id);
      show('Added to wishlist', 'success');
    }
  }, [haptic, item, isFav, requireAuth, toggleFav, show]);

  const handleShare = useCallback(() => {
    setShareVisible(true);
    if (item) {
      ProductAnalytics.itemShare(item.id);
      trackListingInteraction(item.id, 'share').catch(() => {});
    }
  }, [item]);

  const closeShare = useCallback(() => {
    setShareVisible(false);
  }, []);

  const handleViewSeller = useCallback(() => {
    if (!item || !seller) return;
    ProductAnalytics.sellerProfileOpen(item.id, seller.id);
    openProfile(navigation, seller.id, currentUserId);
  }, [item, seller, navigation, currentUserId]);

  const handleMessageSeller = useCallback(async () => {
    if (!item || !seller) return;
    if (!requireAuth('message_seller')) return;
    if (isResolvingConversation) return;
    ProductAnalytics.sellerMessageStart(item.id);
    setIsResolvingConversation(true);
    try {
      const conversation = await createDmConversationOnApi({
        recipientUserId: seller.id,
        itemId: item.id,
      });
      upsertConversation(conversation);
      navigation.navigate('Chat', {
        conversationId: conversation.id,
        partnerUserId: seller.id,
      });
    } catch {
      show('Could not start conversation. Try again.', 'error');
    } finally {
      setIsResolvingConversation(false);
    }
  }, [item, seller, requireAuth, isResolvingConversation, upsertConversation, navigation, show]);

  const handleReport = useCallback(() => {
    if (!item) return;
    navigation.navigate('Report', { type: 'item', targetId: item.id });
  }, [item, navigation]);

  const handleBuyNow = useCallback(() => {
    if (!item) return;
    if (!requireAuth('purchase')) return;
    ProductAnalytics.checkoutStart(item.id);
    // Do not fire a success haptic before the purchase has actually
    // completed. "Buy now" navigates to checkout — it does not complete
    // the purchase. A medium impact acknowledges the primary-action press;
    // the success pattern belongs in the Checkout confirmation flow.
    haptic.medium();
    navigation.navigate('Checkout', { itemId: item.id });
  }, [item, requireAuth, haptic, navigation]);

  const handleMakeOffer = useCallback(() => {
    if (!item) return;
    if (!requireAuth('purchase')) return;
    ProductAnalytics.offerStart(item.id);
  }, [item, requireAuth]);

  // Shared helper for the brokered-tier dock actions (enquire / request
  // viewing). Both open a DM conversation with the seller using the
  // listing's sellerId, following the same createDmConversationOnApi →
  // Chat navigation pattern as handleMessageSeller.
  const startSellerConversation = useCallback(async (sellerId: string) => {
    if (!item) return;
    if (!requireAuth('message_seller')) return;
    if (isResolvingConversation) return;
    ProductAnalytics.sellerMessageStart(item.id);
    setIsResolvingConversation(true);
    try {
      const conversation = await createDmConversationOnApi({
        recipientUserId: sellerId,
        itemId: item.id,
      });
      upsertConversation(conversation);
      haptic.light();
      navigation.navigate('Chat', {
        conversationId: conversation.id,
        partnerUserId: sellerId,
      });
    } catch {
      show('Could not start conversation. Try again.', 'error');
    } finally {
      setIsResolvingConversation(false);
    }
  }, [item, requireAuth, isResolvingConversation, upsertConversation, haptic, navigation, show]);

  const handleEnquire = useCallback(async () => {
    const sellerId = item?.sellerId ?? item?.seller?.id;
    if (!sellerId) return;
    await startSellerConversation(sellerId);
  }, [item, startSellerConversation]);

  const handleRequestViewing = useCallback(async () => {
    const sellerId = item?.sellerId ?? item?.seller?.id;
    if (!sellerId) return;
    await startSellerConversation(sellerId);
  }, [item, startSellerConversation]);

  const handleTogglePriceAlert = useCallback(async () => {
    if (!item?.id || priceAlertLoading) return;
    const next = !priceAlertEnabled;
    setPriceAlertLoading(true);
    setPriceAlertEnabled(next);
    try {
      if (next) {
        await enablePriceAlert(item.id);
        show('Price drop alerts enabled for this item', 'success');
      } else {
        await disablePriceAlert(item.id);
        show('Price drop alerts disabled', 'info');
      }
    } catch {
      setPriceAlertEnabled(!next);
      show('Could not update price alert. Try again.', 'error');
    } finally {
      setPriceAlertLoading(false);
    }
  }, [item?.id, priceAlertEnabled, priceAlertLoading, show]);

  return {
    isFav,
    isSavedToCollection: item ? isItemSavedAnywhere(item.id) : false,
    handleToggleFav,
    handleDoubleTap,
    handleShare,
    shareVisible,
    closeShare,
    handleViewSeller,
    handleMessageSeller,
    handleReport,
    handleBuyNow,
    handleMakeOffer,
    handleEnquire,
    handleRequestViewing,
    isResolvingConversation,
    handleTogglePriceAlert,
    priceAlertEnabled,
    priceAlertLoading,
  };
}
