import React, { useMemo } from "react";

import { View, StyleSheet } from "react-native";

import { MarketplaceChatCard } from "./MarketplaceChatCard";

import { useAppTheme } from "../../theme/ThemeContext";
import { Space } from "../../theme/designTokens";

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
  onCounterOffer,
  onOfferExpired }: ChatCommerceCardProps) {
  const { colors } = useAppTheme();

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
            carrier: msg.commerceState.carrier }}
          onViewOrder={() => {
            navigation.navigate("OrderDetail", { orderId: msg.commerceState!.orderId });
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

  // Offer message — use MarketplaceChatCard
  if (msg.type === "offer" || msg.type === "offer_declined") {
    const isMe = msg.sender === "me";
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
          onDecline={() => onDeclineOffer(msg.id)}
          onCounter={() => onCounterOffer(msg.id, msg.offer?.price, msg.offer?.originalPrice)}
          onExpire={() => onOfferExpired(msg.id)}
        />
      </View>
    );
  }

  return null;
}
