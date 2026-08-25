import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Type, FontFamily } from '../../theme/designTokens';
import type { SupportMessage as SupportMessageType } from '../../contracts/support';
import { SupportEvidenceRow } from './SupportEvidenceRow';

export interface SupportMessageProps {
  message: SupportMessageType;
  /** True when this message was authored by the current user (customer). */
  isOwn: boolean;
  /** Optional callback forwarded to citation rows. */
  onPressCitation?: (citation: SupportMessageType['citations'][number]) => void;
}

function authorLabel(role: SupportMessageType['authorRole']): string {
  switch (role) {
    case 'customer':
      return '';
    case 'agent_ai':
      return 'AI assistant';
    case 'agent_human':
      return 'Support specialist';
    case 'system':
      return '';
  }
}

function formatTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * SupportMessage — individual message rendering for a support conversation.
 *
 * - Customer messages: right-aligned, brand-filled bubble.
 * - AI messages: left-aligned, surface bubble with an "AI assistant" label.
 * - Human operator messages: left-aligned, surface bubble with a
 *   "Support specialist" label.
 * - System messages: centered, muted, no bubble.
 *
 * Citations render as a compact evidence row beneath the message body —
 * never a separate card. No typing animation, no bouncing, no decorative
 * chrome.
 */
export function SupportMessage({ message, isOwn, onPressCitation }: SupportMessageProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // ── System message — centered, muted, no bubble ──
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

  return (
    <View style={isCustomer ? styles.customerRow : styles.otherRow}>
      <View style={isCustomer ? styles.customerBubble : styles.otherBubble}>
        {showLabel && <Text style={styles.authorLabel}>{label}</Text>}
        <Text style={isCustomer ? styles.customerText : styles.otherText}>
          {message.body}
        </Text>
        {hasCitations && (
          <SupportEvidenceRow
            citations={message.citations}
            onPressCitation={onPressCitation}
          />
        )}
        <Text style={isCustomer ? styles.customerTime : styles.otherTime}>
          {formatTime(message.createdAt)}
        </Text>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ── System ──
    systemWrap: {
      alignItems: 'center',
      paddingVertical: Space.sm,
      paddingHorizontal: Space.lg,
    },
    systemText: {
      fontSize: Type.caption.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: Type.caption.lineHeight + 2,
    },

    // ── Rows ──
    customerRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
    },
    otherRow: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
    },

    // ── Bubbles ──
    customerBubble: {
      maxWidth: '78%',
      backgroundColor: colors.brand,
      borderRadius: Radius.chat,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + Space.xs,
    },
    otherBubble: {
      maxWidth: '78%',
      backgroundColor: colors.surface,
      borderRadius: Radius.chat,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + Space.xs,
    },

    // ── Author label ──
    authorLabel: {
      fontSize: Type.meta.size,
      fontFamily: FontFamily.semibold,
      color: colors.textSecondary,
      letterSpacing: Type.meta.letterSpacing,
      marginBottom: Space.xs / 2,
    },

    // ── Body text ──
    customerText: {
      fontSize: Type.body.size,
      fontFamily: FontFamily.regular,
      color: colors.textInverse,
      lineHeight: Type.body.lineHeight + 2,
      letterSpacing: Type.body.letterSpacing,
    },
    otherText: {
      fontSize: Type.body.size,
      fontFamily: FontFamily.regular,
      color: colors.textPrimary,
      lineHeight: Type.body.lineHeight + 2,
      letterSpacing: Type.body.letterSpacing,
    },

    // ── Timestamp ──
    customerTime: {
      fontSize: Type.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textInverse,
      opacity: 0.7,
      marginTop: Space.xs / 2,
      alignSelf: 'flex-end',
    },
    otherTime: {
      fontSize: Type.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      marginTop: Space.xs / 2,
      alignSelf: 'flex-end',
    },
  });
}
