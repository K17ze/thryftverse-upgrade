import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import {
  authorLabel,
  formatMessageTime,
  isPending,
  type DisplayMessage } from './supportConversationViewModels';

export interface SupportMessageRowProps {
  message: DisplayMessage;
  onRetry: (messageId: string) => void;
}

export function SupportMessageRow({ message, onRetry }: SupportMessageRowProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // System message — centered, muted, no bubble
  if (message.authorRole === 'system') {
    return (
      <View style={styles.systemWrap}>
        <Text style={styles.systemText}>{message.body}</Text>
      </View>
    );
  }

  const isCustomer = message.authorRole === 'customer';
  const label = authorLabel(message.authorRole);
  const showLabel = !isCustomer && label.length > 0;
  const hasCitations = message.citations.length > 0;
  const pending = isPending(message);

  return (
    <View style={isCustomer ? styles.customerRow : styles.otherRow}>
      <View style={isCustomer ? styles.customerBubble : styles.otherBubble}>
        {showLabel && (
          <Text style={styles.authorLabel}>{label}</Text>
        )}
        <Text style={isCustomer ? styles.customerText : styles.otherText}>
          {message.body}
        </Text>
        {hasCitations && (
          <View style={styles.citationsRow}>
            {message.citations.map((citation, index) => (
              <Text
                key={citation.articleId ?? `citation-${index}`}
                style={styles.citationText}
                numberOfLines={1}
              >
                {citation.articleTitle ?? 'Source'}
              </Text>
            ))}
          </View>
        )}
        <Text style={isCustomer ? styles.customerTime : styles.otherTime}>
          {formatMessageTime(message.createdAt)}
        </Text>
      </View>
      {pending && message.status === 'sending' && (
        <View style={styles.pendingIndicator}>
          <ActivityIndicator size="small" color={colors.textMuted} />
        </View>
      )}
      {pending && message.status === 'failed' && (
        <AnimatedPressable
          onPress={() => onRetry(message.id)}
          style={styles.retryBtn}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="Retry sending message"
        >
          <Ionicons name="alert-circle" size={13} color={colors.danger} />
          <Text style={styles.retryText}>Tap to retry</Text>
        </AnimatedPressable>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ── System message ──
    systemWrap: {
      alignItems: 'center',
      paddingVertical: Space.sm,
      paddingHorizontal: Space.lg },
    systemText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: TypographyV2.meta.lineHeight + 2 },

    // ── Message rows ──
    customerRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs },
    otherRow: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs },

    // ── Message bubbles ──
    customerBubble: {
      maxWidth: '78%',
      backgroundColor: colors.brand,
      borderRadius: Radius.chat,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + Space.xs },
    otherBubble: {
      maxWidth: '78%',
      backgroundColor: colors.surface,
      borderRadius: Radius.chat,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + Space.xs },

    // ── Author label ──
    authorLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold,
      color: colors.textSecondary,
      letterSpacing: TypographyV2.meta.letterSpacing,
      marginBottom: Space.xs / 2 },

    // ── Message text ──
    customerText: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.regular,
      color: colors.textInverse,
      lineHeight: TypographyV2.body.lineHeight + 2,
      letterSpacing: TypographyV2.body.letterSpacing },
    otherText: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.regular,
      color: colors.textPrimary,
      lineHeight: TypographyV2.body.lineHeight + 2,
      letterSpacing: TypographyV2.body.letterSpacing },

    // ── Citations ──
    citationsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.xs,
      marginTop: Space.xs,
      paddingTop: Space.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle },
    citationText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      color: colors.textSecondary,
      letterSpacing: TypographyV2.meta.letterSpacing },

    // ── Timestamps ──
    customerTime: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textInverse,
      opacity: 0.7,
      marginTop: Space.xs / 2,
      alignSelf: 'flex-end' },
    otherTime: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      marginTop: Space.xs / 2,
      alignSelf: 'flex-end' },

    // ── Pending status ──
    pendingIndicator: {
      justifyContent: 'flex-end',
      paddingBottom: Space.xs,
      paddingLeft: Space.xs },
    retryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs,
      paddingRight: Space.xs,
      alignSelf: 'flex-end' },
    retryText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      color: colors.danger,
      letterSpacing: TypographyV2.meta.letterSpacing } });
}
