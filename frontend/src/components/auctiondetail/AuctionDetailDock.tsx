import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { FontFamily, LetterSpacing } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { haptics } from '../../utils/haptics';
import { HapticPatterns } from '../../utils/hapticPatterns';
import { formatCountdownSentence } from '../../utils/auctionDetailLogic';
import { CommerceDetailStateDock } from '../commerce/detail';
import { RootStackParamList } from '../../navigation/types';
import type { AuctionDetail } from '../../services/marketApi';
import type { AuctionDetailPresentation } from '../../hooks/auctiondetail/useAuctionDetailPresentation';

type NavT = NativeStackNavigationProp<RootStackParamList>;

export interface AuctionDetailDockTransactions {
  isSubmittingBid: boolean;
  watchToggling: boolean;
  isBuyNowLoading: boolean;
  isPayLoading: boolean;
  isAcceptHighestBidLoading: boolean;
  isAcceptSecondChanceLoading: boolean;
  isDeclineSecondChanceLoading: boolean;
  openBidSheet: () => void;
  toggleWatch: () => Promise<void>;
  openBuyNowSheet: () => void;
  acceptHighestBid: () => Promise<void>;
  payNow: () => Promise<void>;
  acceptSecondChance: () => Promise<void>;
  declineSecondChance: () => Promise<void>;
}

interface Props {
  auction: AuctionDetail;
  derived: AuctionDetailPresentation;
  transactions: AuctionDetailDockTransactions;
  onOpenSellerActions: () => void;
}

/**
 * Zone G — sticky action dock. Shared shell dock.
 *
 * Per spec 02_AUCTION §4: the body owns the detailed terminal result;
 * the dock contains the action only. Do not repeat "You won", "Auction
 * closed", "Sold" or "Ended without bids" in both the body and the dock.
 */
export function AuctionDetailDock({
  auction,
  derived,
  transactions,
  onOpenSellerActions,
}: Props) {
  const { colors } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();
  const navigation = useNavigation<NavT>();

  const {
    isTerminal,
    viewerState,
    isSeller,
    isPostEnd,
    presentation,
    isReserveNotMet,
    isAwaitingPayment,
    isPaymentExpired,
    isSecondChanceOffered,
    isSecondChanceRecipient,
    isUpcoming,
    isLive,
    showBidControls,
    stateAction,
    buyNowAvailable,
    auctionFulfilment,
    terminalAmountText,
    paymentDeadlineCountdown,
    priceText,
    priceLabel,
    liveMsToEnd,
    liveMsToStart,
    auctionMediaItems,
  } = derived;

  const {
    isSubmittingBid,
    watchToggling,
    isBuyNowLoading,
    isPayLoading,
    isAcceptHighestBidLoading,
    isAcceptSecondChanceLoading,
    isDeclineSecondChanceLoading,
    openBidSheet,
    toggleWatch: handleToggleWatch,
    openBuyNowSheet,
    acceptHighestBid: handleAcceptHighestBid,
    payNow: handlePayNow,
    acceptSecondChance: handleAcceptSecondChance,
    declineSecondChance: handleDeclineSecondChance,
  } = transactions;

  // Terminal — dock carries the next valid action only.
  // The body terminal result module already shows the result
  // message and value; the dock must not duplicate it.
  if (isTerminal) {
    // Determine the next valid action for each terminal state.
    let terminalAction: { label: string; onPress: () => void; accessibilityLabel: string } | undefined;

    if (viewerState === 'won') {
      // Winner — only expose the backend-backed fulfilment action.
      terminalAction = auctionFulfilment?.orderId
        ? {
            label: auctionFulfilment.buyerNextAction ?? 'View order',
            onPress: () => {
              navigation.navigate('OrderDetail', { orderId: auctionFulfilment.orderId! });
            },
            accessibilityLabel: auctionFulfilment.buyerNextAction ?? 'View auction order',
          }
        : {
            label: 'View purchases',
            onPress: () => navigation.navigate('MyOrders'),
            accessibilityLabel: 'Purchases',
          };
    } else if (viewerState === 'lost' || (isSeller && auction.bidCount === 0)) {
      terminalAction = {
        label: 'Discover similar',
        onPress: () => navigation.navigate('AuctionHome'),
        accessibilityLabel: 'Discover similar auctions',
      };
    } else if (isSeller && auction.bidCount > 0) {
      // Seller with a sale — fulfilment next step.
      terminalAction = auctionFulfilment?.orderId
        ? {
            label: auctionFulfilment.sellerNextAction ?? 'View order',
            onPress: () => {
              navigation.navigate('OrderDetail', { orderId: auctionFulfilment.orderId! });
            },
            accessibilityLabel: auctionFulfilment.sellerNextAction ?? 'View sale order',
          }
        : {
            label: 'Seller centre',
            onPress: () => navigation.navigate('SellerAuctionCentre'),
            accessibilityLabel: 'Open seller auction centre',
          };
    } else {
      // Not participating (or any other terminal state) — offer
      // discovery as the next valid step so the dock is never
      // empty in a terminal state.
      terminalAction = {
        label: 'Discover similar',
        onPress: () => navigation.navigate('AuctionHome'),
        accessibilityLabel: 'Discover similar auctions',
      };
    }

    return terminalAction ? (
      <CommerceDetailStateDock
        primaryAction={terminalAction}
      />
    ) : null;
  }

  // ── Post-end lifecycle states ──
  // reserve_not_met, awaiting_payment, payment_expired,
  // second_chance_offered. The body status banner communicates the
  // state; the dock carries the single next valid action. Uses
  // presentation.stateLabel for the dock badge so the dock and
  // banner stay in sync.
  if (isPostEnd) {
    const postEndBadge = presentation ? (
      <Text style={[styles.dockStateBadge, { color: colors.textPrimary }]}>
        {presentation.stateLabel}
      </Text>
    ) : undefined;

    // Reserve not met — seller can accept highest bid; others get discovery.
    if (isReserveNotMet) {
      if (isSeller && auction.bidCount > 0) {
        return (
          <CommerceDetailStateDock
            stateBadge={postEndBadge}
            value={terminalAmountText}
            valueLabel="Highest bid"
            primaryAction={{
              label: isAcceptHighestBidLoading ? 'Accepting…' : 'Accept highest bid',
              onPress: () => { haptics.press(); void handleAcceptHighestBid(); },
              loading: isAcceptHighestBidLoading,
              disabled: isAcceptHighestBidLoading,
              accessibilityLabel: 'Accept the highest bid',
            }}
            secondaryAction={{
              label: 'Manage',
              onPress: () => navigation.navigate('SellerAuctionCentre'),
              accessibilityLabel: 'Manage auction in seller centre',
              primary: false,
            }}
          />
        );
      }
      return (
        <CommerceDetailStateDock
          stateBadge={postEndBadge}
          value={terminalAmountText}
          valueLabel="Highest bid"
          primaryAction={{
            label: 'Discover similar',
            onPress: () => navigation.navigate('AuctionHome'),
            accessibilityLabel: 'Discover similar auctions',
          }}
        />
      );
    }

    // Awaiting payment — winner pays; seller/others wait.
    if (isAwaitingPayment) {
      if (viewerState === 'won') {
        return (
          <CommerceDetailStateDock
            stateBadge={postEndBadge}
            value={terminalAmountText}
            valueLabel="Amount due"
            subtitle={paymentDeadlineCountdown && !paymentDeadlineCountdown.isExpired
              ? `Pay within ${paymentDeadlineCountdown.text}`
              : undefined}
            primaryAction={{
              label: isPayLoading ? 'Processing…' : 'Pay now',
              onPress: () => { haptics.press(); void handlePayNow(); },
              loading: isPayLoading,
              disabled: isPayLoading,
              accessibilityLabel: 'Pay for this auction now',
            }}
            secondaryAction={auctionFulfilment?.orderId
              ? {
                  label: 'View order',
                  onPress: () => navigation.navigate('OrderDetail', { orderId: auctionFulfilment.orderId! }),
                  accessibilityLabel: 'View auction order',
                  primary: false,
                }
              : undefined}
          />
        );
      }
      if (isSeller) {
        return (
          <CommerceDetailStateDock
            stateBadge={postEndBadge}
            value={terminalAmountText}
            valueLabel="Highest bid"
            subtitle="Awaiting buyer payment"
            primaryAction={{
              label: 'Manage auction',
              onPress: onOpenSellerActions,
              accessibilityLabel: 'Manage this auction',
            }}
          />
        );
      }
      return (
        <CommerceDetailStateDock
          stateBadge={postEndBadge}
          value={terminalAmountText}
          valueLabel="Final bid"
          primaryAction={{
            label: 'Discover similar',
            onPress: () => navigation.navigate('AuctionHome'),
            accessibilityLabel: 'Discover similar auctions',
          }}
        />
      );
    }

    // Payment expired / second chance offered — recipient gets
    // accept/decline; everyone else gets discovery.
    if (isPaymentExpired || isSecondChanceOffered) {
      if (isSecondChanceRecipient) {
        return (
          <CommerceDetailStateDock
            stateBadge={postEndBadge}
            value={terminalAmountText}
            valueLabel="Second chance"
            subtitle={paymentDeadlineCountdown && !paymentDeadlineCountdown.isExpired
              ? `${paymentDeadlineCountdown.text} to decide`
              : undefined}
            primaryAction={{
              label: isAcceptSecondChanceLoading ? 'Accepting…' : 'Accept second chance',
              onPress: () => { haptics.press(); void handleAcceptSecondChance(); },
              loading: isAcceptSecondChanceLoading,
              disabled: isAcceptSecondChanceLoading,
              accessibilityLabel: 'Accept the second chance offer',
            }}
            secondaryAction={{
              label: isDeclineSecondChanceLoading ? 'Declining…' : 'Decline',
              onPress: () => { haptics.tap(); void handleDeclineSecondChance(); },
              loading: isDeclineSecondChanceLoading,
              disabled: isDeclineSecondChanceLoading,
              accessibilityLabel: 'Decline the second chance offer',
              primary: false,
            }}
          />
        );
      }
      return (
        <CommerceDetailStateDock
          stateBadge={postEndBadge}
          value={terminalAmountText}
          valueLabel="Final bid"
          primaryAction={{
            label: 'Discover similar',
            onPress: () => navigation.navigate('AuctionHome'),
            accessibilityLabel: 'Discover similar auctions',
          }}
        />
      );
    }
  }

  // Seller view — calm state, no primary action.
  if (isSeller) {
    return (
      <CommerceDetailStateDock
        stateBadge={
          <Text style={[styles.dockStateBadge, { color: colors.textPrimary }]}>
            Seller view
          </Text>
        }
        subtitle={
          isUpcoming
            ? 'Your auction is scheduled'
            : `${auction.bidCount} ${auction.bidCount === 1 ? 'bid' : 'bids'} so far`
        }
        primaryAction={{
          label: 'Manage auction',
          onPress: onOpenSellerActions,
          accessibilityLabel: 'Manage this auction',
        }}
      />
    );
  }

  // Live bidder — current/min next bid + Place bid (+ optional Buy now).
  if (showBidControls && stateAction && stateAction.primary.type !== 'none') {
    const dockValue = isLive && auction.minimumNextBidGbp > 0
      ? formatFromFiat(auction.minimumNextBidGbp, 'GBP')
      : priceText;
    const dockValueLabel = isLive && auction.minimumNextBidGbp > 0
      ? 'Min next bid'
      : priceLabel;
    // Show countdown as subtitle when live so urgency follows the
    // user as they scroll — they don't need to scroll up to see
    // time remaining. Uses the same per-second format as the
    // primary state sentence for consistency.
    const dockSubtitle = isLive && liveMsToEnd > 0
      ? `Ends in ${formatCountdownSentence(liveMsToEnd)}`
      : isUpcoming && liveMsToStart > 0
        ? `Starts in ${formatCountdownSentence(liveMsToStart)}`
        : undefined;
    const primaryType = stateAction.primary.type;
    // For upcoming state, use "Notify me" as the primary label to
    // make the notification intent explicit (P4-10 spec).
    const primaryLabel = isUpcoming && primaryType === 'watchAuction'
      ? (auction.isWatched ? 'Watching' : 'Notify me')
      : stateAction.primary.label;
    return (
      <CommerceDetailStateDock
        value={dockValue}
        valueLabel={dockValueLabel}
        subtitle={dockSubtitle}
        thumbnailUri={auctionMediaItems[0]?.uri}
        showProtectionStrip={auction.buyerProtection ?? false}
        primaryAction={{
          label: primaryLabel,
          onPress: () => {
            if (primaryType === 'placeBid' || primaryType === 'increaseBid' || primaryType === 'bidAgain') {
              HapticPatterns.bidPlaced();
              openBidSheet();
            } else if (primaryType === 'watchAuction') {
              haptics.selection();
              void handleToggleWatch();
            } else if (primaryType === 'viewSimilar') {
              haptics.tap();
              navigation.navigate('MainTabs', { screen: 'Explore' });
            } else if (primaryType === 'viewResult') {
              // Result continuation: won auction → navigate to checkout
              // to complete payment, or to order detail if already paid.
              haptics.tap();
              if (auction.listingId) {
                navigation.navigate('Checkout', { itemId: auction.listingId });
              }
            } else if (primaryType === 'viewOutcome') {
              // Seller result continuation: navigate to seller auction
              // centre to view sale outcome and arrange shipping.
              haptics.tap();
              navigation.navigate('SellerAuctionCentre');
            } else if (primaryType === 'viewPerformance') {
              haptics.tap();
              navigation.navigate('SellerAuctionCentre');
            }
          },
          loading: isSubmittingBid || watchToggling,
          disabled: isSubmittingBid || watchToggling,
          accessibilityLabel: primaryLabel,
        }}
        secondaryAction={
          buyNowAvailable && stateAction.secondary.type === 'buyNow'
            ? {
                // Per spec 02_AUCTION §6: button labels are
                // "Place bid", "Bid again", "Increase bid", "Buy
                // now". Price stays above buttons or inside the
                // transaction surface, not in the button label.
                label: isBuyNowLoading ? 'Processing…' : 'Buy now',
                onPress: () => { haptics.press(); openBuyNowSheet(); },
                disabled: isBuyNowLoading,
                loading: isBuyNowLoading,
                accessibilityLabel: `Buy now for ${formatFromFiat(auction.buyNowPriceGbp ?? 0, 'GBP')}`,
              }
            : undefined
        }
      />
    );
  }

  return null;
}

const styles = StyleSheet.create({
  dockStateBadge: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: LetterSpacing.normal,
    fontVariant: ['tabular-nums'],
  },
});
