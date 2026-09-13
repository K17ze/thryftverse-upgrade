import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { useCurrencyContext } from '../../context/CurrencyContext';
import { formatCountdownSentence } from '../../utils/auctionDetailLogic';
import { openProductDetail } from '../../platform/product/openProductDetail';
import { RootStackParamList } from '../../navigation/types';
import { BidSheet } from '../ui/BidSheet';
import { BuyNowSheet } from '../ui/BuyNowSheet';
import { FullscreenMediaViewer } from '../product/FullscreenMediaViewer';
import { SaveToCollectionModal } from '../closet/SaveToCollectionModal';
import { ShareSheet } from '../ShareSheet';
import { ConfirmationSheet } from '../ConfirmationSheet';
import { AuctionOverflowSheet } from '../auction/AuctionOverflowSheet';
import { AuctionBidHistorySheet } from '../auction/AuctionBidHistorySheet';
import { AuctionRulesSheet } from '../auction/AuctionRulesSheet';
import { AuctionSellerActions } from '../auction/AuctionSellerActions';
import type { AuctionConfirmationRequest } from '../../hooks/useAuctionDetail';
import type { ProductSocialState } from '../../platform/product';
import type { AuctionEffectiveState } from '../../hooks/useServerClock';
import type {
  AuctionBidActivity,
  AuctionDetail,
  AuctionDetailResponse,
  BuyNowResult,
} from '../../services/marketApi';
import type { AuctionDetailPresentation } from '../../hooks/auctiondetail/useAuctionDetailPresentation';

type NavT = NativeStackNavigationProp<RootStackParamList>;

interface Props {
  auction: AuctionDetail;
  derived: AuctionDetailPresentation;
  effectiveState: AuctionEffectiveState | null;
  social: ProductSocialState;
  // Clocks / activity
  minuteClock: number;
  serverNow: string | null;
  bidActivity: AuctionBidActivity[];
  bidActivityError: boolean;
  initialBidAmount?: number;
  // Sheet visibility
  overflowVisible: boolean;
  bidSheetVisible: boolean;
  buyNowSheetVisible: boolean;
  bidHistorySheetVisible: boolean;
  sellerActionsVisible: boolean;
  rulesSheetVisible: boolean;
  mediaViewerVisible: boolean;
  fullscreenMediaIndex: number;
  // Handlers
  onDismissOverflow: () => void;
  onToggleWatch: () => void;
  onOpenCollectionPicker: () => void;
  onToggleLike: () => void;
  onDismissBidSheet: () => void;
  onSubmitBid: (gbpAmount: number, idempotencyKey: string, maxBidGbp?: number) => Promise<void>;
  onReviewBuyNow: () => void;
  onDismissBuyNowSheet: () => void;
  onSubmitBuyNow: (gbpAmount: number, idempotencyKey: string) => Promise<BuyNowResult>;
  onRefreshDetail: () => Promise<AuctionDetailResponse | null>;
  onDismissBidHistory: () => void;
  onRetryBidHistory: () => void;
  onDismissSellerActions: () => void;
  onViewBids: () => void;
  onCancelAuction: () => void;
  isCancelLoading: boolean;
  onDismissRules: () => void;
  onMediaIndexChange: (index: number) => void;
  onCloseMediaViewer: () => void;
  cancelAuctionConfirmation: AuctionConfirmationRequest | null;
  onDismissConfirmation: () => void;
}

/**
 * All auction-detail sheets and modals in one place — rendered outside
 * the a11y-hidden scroll content so they stay reachable while open.
 * Order preserved from the screen: overflow, bid, buy-now, bid history,
 * seller actions, rules, fullscreen media, collection picker, share,
 * and the destructive-action confirmation sheet.
 */
export function AuctionDetailSheets({
  auction,
  derived,
  effectiveState,
  social,
  minuteClock,
  serverNow,
  bidActivity,
  bidActivityError,
  initialBidAmount,
  overflowVisible,
  bidSheetVisible,
  buyNowSheetVisible,
  bidHistorySheetVisible,
  sellerActionsVisible,
  rulesSheetVisible,
  mediaViewerVisible,
  fullscreenMediaIndex,
  onDismissOverflow,
  onToggleWatch,
  onOpenCollectionPicker,
  onToggleLike,
  onDismissBidSheet,
  onSubmitBid,
  onReviewBuyNow,
  onDismissBuyNowSheet,
  onSubmitBuyNow,
  onRefreshDetail,
  onDismissBidHistory,
  onRetryBidHistory,
  onDismissSellerActions,
  onViewBids,
  onCancelAuction,
  isCancelLoading,
  onDismissRules,
  onMediaIndexChange,
  onCloseMediaViewer,
  cancelAuctionConfirmation,
  onDismissConfirmation,
}: Props) {
  const navigation = useNavigation<NavT>();
  const { formatFromFiat } = useFormattedPrice();
  const { currencyCode, fxRates } = useCurrencyContext();

  const {
    isSeller,
    isLive,
    isUpcoming,
    liveMsToEnd,
    liveMsToStart,
    countdown,
    auctionFulfilment,
    auctionMediaItems,
  } = derived;

  return (
    <>
      {/* ── Overflow sheet — Watchlist, Save to collection, wishlist (lower-frequency
          actions kept off the hero per spec 04 §1). ── */}
      <AuctionOverflowSheet
        visible={overflowVisible}
        onDismiss={onDismissOverflow}
        isWatched={auction.isWatched}
        isUpcoming={isUpcoming}
        isSavedToCollection={social.isSavedToCollection}
        isLiked={social.isLiked}
        onToggleWatch={onToggleWatch}
        onShare={social.openShare}
        onOpenCollectionPicker={onOpenCollectionPicker}
        onToggleLike={onToggleLike}
      />

      {/* ── Bid transaction sheet ── */}
      <BidSheet
        visible={bidSheetVisible}
        onDismiss={onDismissBidSheet}
        auction={{
          id: auction.id,
          title: auction.title,
          imageUrl: auction.imageUrl,
          currentBidGbp: auction.currentBidGbp,
          minimumNextBidGbp: auction.minimumNextBidGbp,
          endsAt: auction.endsAt,
          sellerName: auction.seller.displayName ?? auction.seller.username,
          effectiveState: effectiveState ?? 'upcoming',
          isSeller,
          countdownText: isLive && liveMsToEnd > 0
            ? `Ends in ${formatCountdownSentence(liveMsToEnd)}`
            : isUpcoming && liveMsToStart > 0
              ? `Starts in ${formatCountdownSentence(liveMsToStart)}`
              : countdown.text,
        }}
        currencyCode={currencyCode}
        fxRates={fxRates}
        formatFromFiat={formatFromFiat}
        onSubmitBid={onSubmitBid}
        onRefreshDetail={onRefreshDetail}
        onReviewBuyNow={onReviewBuyNow}
        serverClockMs={minuteClock}
        initialBidAmount={initialBidAmount}
      />

      {/* ── Buy Now transaction sheet ── */}
      <BuyNowSheet
        visible={buyNowSheetVisible}
        onDismiss={onDismissBuyNowSheet}
        auction={{
          id: auction.id,
          title: auction.title,
          imageUrl: auction.imageUrl,
          buyNowPriceGbp: auction.buyNowPriceGbp,
          sellerName: auction.seller.displayName ?? auction.seller.username,
          effectiveState: effectiveState ?? 'upcoming',
          isSeller,
        }}
        currencyCode={currencyCode}
        fxRates={fxRates}
        formatFromFiat={formatFromFiat}
        onSubmitBuyNow={onSubmitBuyNow}
        onRefreshDetail={onRefreshDetail}
      />

      {/* ── Bid history bottom sheet ── */}
      <AuctionBidHistorySheet
        visible={bidHistorySheetVisible}
        onDismiss={onDismissBidHistory}
        bidActivity={bidActivity}
        bidActivityError={bidActivityError}
        bidCount={auction.bidCount}
        serverNow={serverNow}
        formatFromFiat={formatFromFiat}
        onRetry={onRetryBidHistory}
      />

      <AuctionSellerActions
        visible={sellerActionsVisible && isSeller}
        title={auction.title}
        bidCount={auction.bidCount}
        onDismiss={onDismissSellerActions}
        onViewBids={onViewBids}
        onViewListing={auction.listingId ? () => openProductDetail(navigation, {
          referenceKind: 'listing', canonicalId: auction.listingId!, sourceSurface: 'AuctionSellerActions',
        }) : undefined}
        onViewOrder={auctionFulfilment?.orderId ? () => navigation.navigate('OrderDetail', { orderId: auctionFulfilment.orderId! }) : undefined}
        onViewAll={() => navigation.navigate('SellerAuctionCentre')}
        onCancel={isLive || isUpcoming ? onCancelAuction : undefined}
        cancelPending={isCancelLoading}
      />

      {/* ── How bidding works bottom sheet ── */}
      <AuctionRulesSheet
        visible={rulesSheetVisible}
        onDismiss={onDismissRules}
      />

      {/* ── Fullscreen media viewer ── */}
      <FullscreenMediaViewer
        media={auctionMediaItems}
        initialIndex={fullscreenMediaIndex}
        visible={mediaViewerVisible}
        onActiveIndexChange={onMediaIndexChange}
        onClose={onCloseMediaViewer}
      />

      {/* ── PRODUCT-01: Save to collection + share (shared social actions) ── */}
      <SaveToCollectionModal
        visible={social.collectionModalVisible}
        itemId={auction.id}
        onClose={social.closeCollectionPicker}
      />
      <ShareSheet
        visible={social.shareVisible}
        onDismiss={social.closeShare}
        url={`https://thryftverse.com/auction/${auction.id}`}
        title={auction.title}
        contentType="auction"
        contentId={auction.id}
      />

      <ConfirmationSheet
        visible={!!cancelAuctionConfirmation}
        onDismiss={onDismissConfirmation}
        title={cancelAuctionConfirmation?.title ?? ''}
        message={cancelAuctionConfirmation?.message}
        confirmLabel={cancelAuctionConfirmation?.confirmLabel}
        cancelLabel={cancelAuctionConfirmation?.cancelLabel}
        onConfirm={() => {
          const req = cancelAuctionConfirmation;
          onDismissConfirmation();
          if (req) void req.onConfirm();
        }}
        variant={cancelAuctionConfirmation?.variant ?? 'danger'}
      />
    </>
  );
}
