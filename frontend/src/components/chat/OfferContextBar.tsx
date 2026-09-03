import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Space, Radius, Stroke, Control, IconGrammar } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';

import type { Offer, OfferAction } from '../../domain/offerStateMachine';
import { getQuickActions, timeUntilExpiry } from '../../domain/offerStateMachine';

export interface OfferContextBarProps {
  offer: Offer;
  currentUserId: string;
  onAction: (offer: Offer, action: OfferAction) => void;
}

/**
 * Compact negotiation bar shown above the chat input while an offer
 * is live. Shows the current amount, status, a subtle expiry countdown,
 * and the context-aware quick actions for the viewing party.
 *
 * Flat composition — hairline border, no card-on-card, no decorative
 * chrome. Status emphasis comes from a single leading glyph and the
 * status word, not from coloured fills.
 */
export function OfferContextBar({ offer, currentUserId, onAction }: OfferContextBarProps) {
  const { colors } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const actions = getQuickActions(offer, currentUserId);
  const formattedAmount = formatFromFiat(offer.amount, 'GBP', {
    displayMode: 'fiat',
  });

  // Live countdown — ticks every second while the offer is live.
  const [msRemaining, setMsRemaining] = useState(() => timeUntilExpiry(offer));
  useEffect(() => {
    setMsRemaining(timeUntilExpiry(offer));
    const target = new Date(offer.expiresAt).getTime();
    const interval = setInterval(() => {
      setMsRemaining(Math.max(0, target - Date.now()));
    }, 1000);
    return () => clearInterval(interval);
  }, [offer.id, offer.expiresAt]);

  const statusLabel = statusWord(offer.status);
  const expiryLabel = formatCountdown(msRemaining);
  const expiryTone = resolveExpiryTone(msRemaining, offer.status, colors);

  const primary = actions.find((a) => a.type === 'accept');
  const secondary = actions.filter((a) => a.type !== 'accept');

  return (
    <View
      style={styles.root}
      accessibilityRole="summary"
      accessibilityLabel={`Offer ${formattedAmount}, ${statusLabel}, expires in ${expiryLabel}`}
    >
      <View style={styles.headRow}>
        <View style={styles.amountCol}>
          <Text style={styles.amount}>{formattedAmount}</Text>
          <View style={styles.statusRow}>
            <Ionicons
              name={statusGlyph(offer.status)}
              size={IconGrammar.badge}
              color={statusColor(offer.status, colors)}
            />
            <Text style={[styles.status, { color: statusColor(offer.status, colors) }]}>
              {statusLabel}
            </Text>
          </View>
        </View>
        {!isTerminalStatus(offer.status) && (
          <View style={styles.expiryCol}>
            <Ionicons
              name={expiryTone.icon}
              size={IconGrammar.badge}
              color={expiryTone.color}
            />
            <Text style={[styles.expiry, { color: expiryTone.color }]}>
              {expiryLabel}
            </Text>
          </View>
        )}
      </View>

      {actions.length > 0 && (
        <View style={styles.actionsRow}>
          {secondary.map((action) => (
            <AnimatedPressable
              key={action.type}
              style={styles.secondaryBtn}
              onPress={() => onAction(offer, action)}
              activeOpacity={0.85}
              scaleValue={0.97}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <Text style={styles.secondaryBtnText}>{action.label}</Text>
            </AnimatedPressable>
          ))}
          {primary && (
            <AnimatedPressable
              style={styles.primaryBtn}
              onPress={() => onAction(offer, primary)}
              activeOpacity={0.85}
              scaleValue={0.97}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel={primary.label}
            >
              <Text style={styles.primaryBtnText}>{primary.label}</Text>
            </AnimatedPressable>
          )}
        </View>
      )}
    </View>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────

function statusWord(status: Offer['status']): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'countered':
      return 'Counter';
    case 'accepted':
      return 'Accepted';
    case 'rejected':
      return 'Declined';
    case 'expired':
      return 'Expired';
    case 'withdrawn':
      return 'Withdrawn';
  }
}

function statusGlyph(status: Offer['status']): keyof typeof Ionicons.glyphMap {
  switch (status) {
    case 'pending':
      return 'hourglass-outline';
    case 'countered':
      return 'swap-horizontal-outline';
    case 'accepted':
      return 'checkmark-circle-outline';
    case 'rejected':
      return 'close-circle-outline';
    case 'expired':
      return 'time-outline';
    case 'withdrawn':
      return 'remove-circle-outline';
  }
}

function statusColor(
  status: Offer['status'],
  colors: ReturnType<typeof useAppTheme>['colors'],
): string {
  switch (status) {
    case 'accepted':
      return colors.success;
    case 'rejected':
    case 'withdrawn':
      return colors.textMuted;
    case 'expired':
      return colors.warning;
    case 'countered':
      return colors.brand;
    case 'pending':
    default:
      return colors.textSecondary;
  }
}

function isTerminalStatus(status: Offer['status']): boolean {
  return (
    status === 'accepted' ||
    status === 'rejected' ||
    status === 'expired' ||
    status === 'withdrawn'
  );
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'expired';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  if (minutes > 0) return `${minutes}m ${seconds}s left`;
  return `${seconds}s left`;
}

function resolveExpiryTone(
  ms: number,
  status: Offer['status'],
  colors: ReturnType<typeof useAppTheme>['colors'],
): { color: string; icon: keyof typeof Ionicons.glyphMap } {
  if (isTerminalStatus(status) || ms <= 0) {
    return { color: colors.textMuted, icon: 'time-outline' };
  }
  if (ms <= 60 * 60 * 1000) {
    return { color: colors.danger, icon: 'timer-outline' };
  }
  if (ms <= 12 * 60 * 60 * 1000) {
    return { color: colors.warning, icon: 'timer-outline' };
  }
  return { color: colors.textSecondary, icon: 'time-outline' };
}

// ── styles ───────────────────────────────────────────────────────────────

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    root: {
      backgroundColor: colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      gap: Space.sm,
    },
    headRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: Space.sm,
    },
    amountCol: {
      flex: 1,
      gap: Space.xxs,
    },
    amount: {
      fontSize: TypographyV2.priceList.size,
      lineHeight: TypographyV2.priceList.lineHeight,
      fontFamily: TypographyV2.priceList.fontFamily,
      letterSpacing: TypographyV2.priceList.letterSpacing,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    status: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },
    expiryCol: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingTop: Space.xxs,
    },
    expiry: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      fontVariant: ['tabular-nums'],
    },
    actionsRow: {
      flexDirection: 'row',
      gap: Space.sm,
    },
    primaryBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: Control.hit,
      borderRadius: Radius.md,
      backgroundColor: colors.brand,
    },
    primaryBtnText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textInverse,
    },
    secondaryBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: Control.hit,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceAlt,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
    },
    secondaryBtnText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary,
    },
  });
