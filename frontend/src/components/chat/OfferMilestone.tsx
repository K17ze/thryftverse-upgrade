import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Space, Radius, Stroke, IconGrammar } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';

import type { Message } from '../../domain/conversation';

export interface OfferMilestoneProps {
  message: Message;
  /** Whether the milestone sits on the current user's side of the thread. */
  isMe: boolean;
  /** Optional group sender label for multi-party threads. */
  senderLabel?: string;
}

type MilestoneStatus = 'pending' | 'countered' | 'accepted' | 'declined' | 'expired' | 'cancelled';

/**
 * Structured offer-event message for the chat transcript. Renders the
 * offer amount, resolved status, and timestamp as a single flat block —
 * no card-on-card, no decorative chrome.
 *
 * Status emphasis comes from a single leading glyph and the status word
 * colour, mapped to semantic tokens:
 *   accepted  → success
 *   declined  → muted (not danger — a declined offer is not an error)
 *   expired   → warning
 *   withdrawn → muted
 *   countered → brand
 *   pending   → textSecondary
 */
export function OfferMilestone({ message, isMe, senderLabel }: OfferMilestoneProps) {
  const { colors } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const offer = message.offer;
  const amount = offer?.offerPrice ?? 0;
  const originalPrice = offer?.originalPrice ?? 0;
  const rawStatus = offer?.status;
  const status: MilestoneStatus =
    rawStatus === 'countered' ||
    rawStatus === 'accepted' ||
    rawStatus === 'declined' ||
    rawStatus === 'expired' ||
    rawStatus === 'cancelled' ||
    rawStatus === 'pending'
      ? rawStatus
      : 'pending';

  const formattedAmount = formatFromFiat(amount, 'GBP', {
    displayMode: 'fiat',
  });
  const formattedOriginal = originalPrice
    ? formatFromFiat(originalPrice, 'GBP', { displayMode: 'fiat' })
    : null;

  const discountPct =
    originalPrice > amount
      ? Math.round(((originalPrice - amount) / originalPrice) * 100)
      : 0;

  const tone = resolveTone(status, colors);
  const timeLabel = message.timestamp ? formatMilestoneTime(message.timestamp) : null;

  return (
    <View
      style={[styles.root, isMe && styles.rootMe]}
      accessibilityRole="summary"
      accessibilityLabel={`Offer ${formattedAmount}, ${tone.word}`}
    >
      {senderLabel && !isMe ? (
        <Text style={styles.sender}>{senderLabel}</Text>
      ) : null}
      <View style={styles.amountRow}>
        <Text style={styles.amount} numberOfLines={1}>{formattedAmount}</Text>
        {formattedOriginal ? (
          <Text style={styles.strike} numberOfLines={1}>{formattedOriginal}</Text>
        ) : null}
        {discountPct >= 5 ? (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>-{discountPct}%</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.statusRow}>
        <Ionicons name={tone.icon} size={IconGrammar.badge} color={tone.color} />
        <Text style={[styles.statusText, { color: tone.color }]}>{tone.word}</Text>
        {timeLabel ? (
          <Text style={styles.time}>{timeLabel}</Text>
        ) : null}
      </View>
    </View>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────

function resolveTone(
  status: MilestoneStatus,
  colors: ReturnType<typeof useAppTheme>['colors'],
): { word: string; color: string; icon: keyof typeof Ionicons.glyphMap } {
  switch (status) {
    case 'accepted':
      return { word: 'Accepted', color: colors.success, icon: 'checkmark-circle-outline' };
    case 'declined':
      return { word: 'Declined', color: colors.textMuted, icon: 'close-circle-outline' };
    case 'expired':
      return { word: 'Expired', color: colors.warning, icon: 'time-outline' };
    case 'cancelled':
      return { word: 'Withdrawn', color: colors.textMuted, icon: 'remove-circle-outline' };
    case 'countered':
      return { word: 'Counter', color: colors.brand, icon: 'swap-horizontal-outline' };
    case 'pending':
    default:
      return { word: 'Pending', color: colors.textSecondary, icon: 'hourglass-outline' };
  }
}

function formatMilestoneTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  const displayMinutes = minutes < 10 ? `0${minutes}` : String(minutes);
  return `${displayHours}:${displayMinutes} ${period}`;
}

// ── styles ───────────────────────────────────────────────────────────────

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    root: {
      width: '85%',
      maxWidth: 340,
      minWidth: 0,
      gap: Space.sm,
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      padding: Space.smMd,
      marginHorizontal: Space.md,
    },
    rootMe: {
      alignSelf: 'flex-end',
    },
    sender: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.textSecondary,
    },
    amountRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: Space.sm,
      flexWrap: 'wrap',
    },
    amount: {
      fontSize: TypographyV2.priceList.size,
      lineHeight: TypographyV2.priceList.lineHeight,
      fontFamily: TypographyV2.priceList.fontFamily,
      letterSpacing: TypographyV2.priceList.letterSpacing,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    strike: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      textDecorationLine: 'line-through',
      fontVariant: ['tabular-nums'],
    },
    discountBadge: {
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xxs,
      borderRadius: Radius.full,
      backgroundColor: colors.successSubtle,
    },
    discountText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.success,
      fontVariant: ['tabular-nums'],
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    statusText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },
    time: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      marginLeft: 'auto',
      fontVariant: ['tabular-nums'],
    },
  });
