import React, { useMemo } from "react";

import { View, StyleSheet } from "react-native";

import { MarketplaceChatCard } from "./MarketplaceChatCard";

import { useAppTheme } from "../../theme/ThemeContext";
import { Space } from "../../theme/designTokens";
import { useStore } from "../../store/useStore";
import { useTranslation } from "../../i18n";

import {
  isTrustedSystemMessage,
  resolveSystemMessageProvenance } from "../../utils/systemMessageProvenance";

import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/types";

import { type Message } from "../../hooks/chat";
import { type SupportedCurrencyCode } from "../../constants/currencies";
import type { CurrencyDisplayMode } from "../../utils/currency";

export type ChatFormatPrice = (
  fiatAmount: number,
  sourceCurrency?: SupportedCurrencyCode,
  options?: { displayMode?: CurrencyDisplayMode },
) => string;

export type ChatCommerceCardNavigation = NativeStackNavigationProp<
  RootStackParamList,
  "Chat"
>;

/**
 * True when the message renders as an in-thread commerce/system card row
 * (MarketplaceChatCard) rather than a regular bubble. ChatMessageItem uses
 * this predicate to route the row; ChatCommerceCard then renders the card.
 */
export function isChatCommerceCardMessage(msg: Message): boolean {
  if (msg.type === "purchase_status") return true;
  if (msg.type === "commerce_state" && msg.commerceState) return true;
  if (msg.type === "listing_share" && msg.listing) return true;
  if (
    (msg.type === "system" || msg.isSystem) &&
    msg.senderId &&
    isTrustedSystemMessage({
      id: msg.id,
      senderId: msg.senderId ?? "",
      isSystem: msg.isSystem,
      type: msg.type === "system" ? "system" : undefined,
      systemTitle: msg.systemTitle,
      text: msg.text,
      timestamp: msg.date ?? "" })
  ) {
    return true;
  }
  if (msg.type === "offer" || msg.type === "offer_declined") return true;
  return false;
}

export interface ChatCommerceCardProps {
  message: Message;
  /** Cluster-derived vertical spacing applied to card rows. */
  spacingTop: number;
  marginBottom: number;
  isGroup: boolean;
  formatFromFiat: ChatFormatPrice;
  navigation: ChatCommerceCardNavigation;
  onAcceptOffer: (msgId: string) => void;
  onDeclineOffer: (msgId: string) => void;
  /** Buyer exit on a seller-authored offer — decline is seller-only. */
  onCancelOffer: (msgId: string) => void;
  onCounterOffer: (
    msgId: string,
    offerPrice?: number,
    originalPrice?: number,
  ) => void;
  onOfferExpired: (msgId: string) => void;
}

export function ChatCommerceCard({
  message: msg,
  spacingTop,
  marginBottom,
  isGroup,
  formatFromFiat,
  navigation,
  onAcceptOffer,
  onDeclineOffer,
  onCancelOffer,
  onCounterOffer,
  onOfferExpired }: ChatCommerceCardProps) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const currentUserId = useStore((s) => s.currentUser?.id);

  const styles = useMemo(() => StyleSheet.create({
    statusWrap: {
      marginVertical: Space.xs,
      paddingHorizontal: Space.md,
      alignItems: "center" },

    msgRow: {
      flexDirection: "column",
      width: "100%",
      gap: Space.xs,
      paddingHorizontal: 0 },

    msgRowRight: {
      alignItems: "stretch" } }), [colors]);

  // Purchase status message — inline centered event
  if (msg.type === "purchase_status") {
    return (
      <View key={msg.id} style={styles.statusWrap}>
        <MarketplaceChatCard type="purchase_status" text={msg.text} />
      </View>
    );
  }

  // Commerce state card — rich order status with tracking
  if (msg.type === "commerce_state" && msg.commerceState) {
    return (
      <View
        key={msg.id}
        style={[
          styles.msgRow,
          { marginTop: spacingTop, marginBottom },
        ]}
      >
        <MarketplaceChatCard
          type="commerce_state"
          commerceState={{
            type: msg.commerceState.stateType,
            orderId: msg.commerceState.orderId,
            orderShortId: msg.commerceState.orderShortId,
            itemTitle: msg.commerceState.itemTitle,
            itemImage: msg.commerceState.itemImage,
            trackingNumber: msg.commerceState.trackingNumber,
            carrier: msg.commerceState.carrier,
            extensionDays: msg.commerceState.extensionDays,
            proposedShipBy: msg.commerceState.proposedShipBy,
            refundedAmountGbp: msg.commerceState.refundedAmountGbp }}
          onViewOrder={() => {
            const state = msg.commerceState!;
            // Review prompt cards deep-link straight into the review flow;
            // everything else (confirm receipt, extension response, label)
            // lands on the order detail where those actions live.
            if (state.stateType === 'feedback_prompt') {
              navigation.navigate("WriteReview", { orderId: state.orderId });
              return;
            }
            navigation.navigate("OrderDetail", { orderId: state.orderId });
          }}
        />
      </View>
    );
  }

  // System message — only render trusted styling if provenance is verified
  if (
    (msg.type === "system" || msg.isSystem) &&
    msg.senderId &&
    isTrustedSystemMessage({
      id: msg.id,
      senderId: msg.senderId ?? "",
      isSystem: msg.isSystem,
      type: msg.type === "system" ? "system" : undefined,
      systemTitle: msg.systemTitle,
      text: msg.text,
      timestamp: msg.date ?? "" })
  ) {
    const provenance = resolveSystemMessageProvenance({
      id: msg.id,
      senderId: msg.senderId ?? "",
      isSystem: msg.isSystem,
      type: msg.type === "system" ? "system" : undefined,
      systemTitle: msg.systemTitle,
      text: msg.text,
      timestamp: msg.date ?? "" });
    return (
      <View key={msg.id} style={styles.statusWrap}>
        <MarketplaceChatCard
          type="system"
          systemTitle={msg.systemTitle}
          text={msg.text}
          systemVerified={provenance.isProtected}
        />
      </View>
    );
  }

  // Shared listing card — the product share surface. Tapping opens the
  // real listing; Make offer routes into the offer flow for that item.
  if (msg.type === "listing_share" && msg.listing) {
    const listing = msg.listing;
    const listingId = listing.id;
    return (
      <View
        key={msg.id}
        style={[
          styles.msgRow,
          msg.sender === "me" && styles.msgRowRight,
          { marginTop: spacingTop, marginBottom },
        ]}
      >
        <MarketplaceChatCard
          type="listing_share"
          isMe={msg.sender === "me"}
          senderLabel={isGroup && msg.sender !== "me" ? msg.senderLabel : undefined}
          listing={{
            id: listing.id,
            title: listing.title,
            price: listing.price,
            originalPrice: listing.originalPrice,
            image: listing.image ?? listing.images?.[0] ?? '',
            brand: listing.brand ?? undefined,
            size: listing.size ?? undefined,
            condition: listing.condition ?? undefined,
            sellerUsername: listing.sellerUsername ?? undefined,
            sellerRating: listing.sellerRating ?? undefined,
            isSold: listing.isSold === true }}
          formattedPrice={formatFromFiat(listing.price, 'GBP', { displayMode: "fiat" })}
          onViewListing={() =>
            navigation.navigate("ItemDetail", { itemId: listingId })}
        />
      </View>
    );
  }

  // Offer message — use MarketplaceChatCard
  if (msg.type === "offer" || msg.type === "offer_declined") {
    const isMe = msg.sender === "me";
    // The recipient's exit action depends on their role: a buyer facing a
    // seller-authored counter can only cancel (decline is seller-only
    // server-side). Fall back to the message-side heuristic when the offer
    // payload lacks buyerId on legacy rows.
    const viewerIsOfferBuyer = msg.offer?.buyerId
      ? msg.offer.buyerId === currentUserId
      : false;
    // Author-side retract: the pending offer/counter was authored by the
    // viewer — a buyer cancels their offer, a seller withdraws their
    // counter (the decline route is seller-only server-side). Authoring is
    // read from offeredByUserId, not message sender: the card message
    // keeps the original sender when a counter lands.
    const viewerIsOfferAuthor = msg.offer?.offeredByUserId
      ? msg.offer.offeredByUserId === currentUserId
      : isMe;
    const withdrawAction = viewerIsOfferAuthor
      ? (viewerIsOfferBuyer ? () => onCancelOffer(msg.id) : () => onDeclineOffer(msg.id))
      : undefined;
    const withdrawActionLabel = viewerIsOfferBuyer
      ? t('offers.action.cancel')
      : t('offers.action.withdraw');
    const waitingLabel = viewerIsOfferBuyer
      ? t('offers.waiting.forSeller')
      : t('offers.waiting.forBuyer');
    return (
      <View
        key={msg.id}
        style={[
          styles.msgRow,
          isMe && styles.msgRowRight,
          { marginTop: spacingTop, marginBottom },
        ]}
        accessibilityLiveRegion="polite"
      >
        <MarketplaceChatCard
          type="offer"
          isMe={isMe}
          senderLabel={isGroup && !isMe ? msg.senderLabel : undefined}
          offer={msg.offer ? {
            price: msg.offer.price ?? msg.offer.offerPrice ?? msg.offer.amount ?? 0,
            originalPrice: msg.offer.originalPrice ?? msg.offer.price ?? msg.offer.offerPrice ?? 0,
            status: msg.offer.status,
            expiresAt: msg.offer.expiresAt,
            counterRound: msg.offer.counterRound,
          } : undefined}
          formattedPrice={formatFromFiat(msg.offer?.price ?? msg.offer?.offerPrice ?? msg.offer?.amount ?? 0, 'GBP', {
            displayMode: "fiat" })}
          formattedOriginalPrice={formatFromFiat(
            msg.offer?.originalPrice ?? msg.offer?.price ?? msg.offer?.offerPrice ?? 0, 'GBP',
            { displayMode: "fiat" },
          )}
          onAccept={() => onAcceptOffer(msg.id)}
          onDecline={viewerIsOfferBuyer ? () => onCancelOffer(msg.id) : () => onDeclineOffer(msg.id)}
          declineLabel={viewerIsOfferBuyer ? t('offers.action.cancel') : undefined}
          onWithdraw={withdrawAction}
          withdrawLabel={withdrawActionLabel}
          waitingLabel={waitingLabel}
          viewerAuthoredPending={viewerIsOfferAuthor}
          onCounter={() => onCounterOffer(msg.id, msg.offer?.price, msg.offer?.originalPrice)}
          onExpire={() => onOfferExpired(msg.id)}
        />
      </View>
    );
  }

  return null;
}
