import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Space, Radius, Control, IconGrammar } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { useFormattedPrice } from '../../hooks/useFormattedPrice';
import { t } from '../../i18n';
import type { ListingOffer, ListingOfferStatus } from '../../services/listingOffersApi';

export type OfferRowAction = 'accept' | 'counter' | 'decline' | 'cancel';

/**
 * Effective display status. The backend expires offers lazily on write/read
 * of specific resources, so a `pending` row whose `expiresAt` has already
 * passed must render as expired — and must not offer actions the server
 * would reject with 410.
 */
export function effectiveOfferStatus(offer: ListingOffer, nowMs: number): ListingOfferStatus {
  if (offer.status === 'pending' && Date.parse(offer.expiresAt) <= nowMs) {
    return 'expired';
  }
  return offer.status;
}

/**
 * Actions derived from the server's actual authorization rules
 * (POST /offers/:id/accept|decline|cancel|counter):
 *   - Only the seller can accept or decline.
 *   - Only the buyer can cancel.
 *   - Either participant can counter, but only when the pending offer was
 *     made by the OTHER party (`offeredByUserId !== actor`).
 *
 * The legacy client-side `offerStateMachine.getQuickActions` is deliberately
 * not used here — it predates the server contract and would grant the buyer
 * an "accept" the server always rejects.
 */
export function resolveOfferActions(
  offer: ListingOffer,
  currentUserId: string | undefined,
  nowMs: number,
): OfferRowAction[] {
  if (!currentUserId) return [];
  if (effectiveOfferStatus(offer, nowMs) !== 'pending') return [];
  const isSeller = offer.sellerId === currentUserId;
  const isBuyer = offer.buyerId === currentUserId;
  const ownMove = offer.offeredByUserId === currentUserId;
  if (isSeller && !ownMove) return ['accept', 'counter', 'decline'];
  if (isBuyer && !ownMove) return ['counter', 'cancel'];
  if (isBuyer && ownMove) return ['cancel'];
  return [];
}

export interface OfferRowProps {
  offer: ListingOffer;
  /** 'received' — the viewer sells the listing; 'sent' — the viewer buys. */
  direction: 'received' | 'sent';
  currentUserId: string | undefined;
  /** Resolved listing title; undefined while the record is loading. */
  listingTitle?: string | null;
  listingImageUri?: string | null;
  /** Resolved counterparty display name, or an honest role fallback. */
  counterpartyLabel: string;
  /** Shared clock from the parent screen so all rows tick together. */
  nowMs: number;
  /** True while a mutation for this offer is in flight. */
  isActing: boolean;
  onPress: (offer: ListingOffer) => void;
  onAction: (offer: ListingOffer, action: OfferRowAction) => void;
}

function actionLabel(action: OfferRowAction): string {
  switch (action) {
    case 'accept':
      return t('offers.action.accept');
    case 'counter':
      return t('offers.action.counter');
    case 'decline':
      return t('offers.action.decline');
    case 'cancel':
      return t('offers.action.cancel');
  }
}

/**
 * Flat offer row for the Offers surface. Hairline-separated list row —
 * no card, no pill chrome. Status is a single glyph + word in a semantic
 * colour; money is tabular-nums; expiry counts down against a shared clock.
 */
export function OfferRow({
  offer,
  direction,
  currentUserId,
  listingTitle,
  listingImageUri,
  counterpartyLabel,
  nowMs,
  isActing,
  onPress,
  onAction,
}: OfferRowProps) {
  const { colors } = useAppTheme();
  const { formatFromFiat } = useFormattedPrice();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const status = effectiveOfferStatus(offer, nowMs);
  const tone = statusTone(status, colors);
  const actions = resolveOfferActions(offer, currentUserId, nowMs);
  const amount = formatFromFiat(offer.offerPriceGbp, 'GBP', { displayMode: 'fiat' });
  const counterpartyWord = direction === 'received' ? t('offers.row.from') : t('offers.row.to');
  const timeLeft = status === 'pending' ? formatTimeLeft(offer.expiresAt, nowMs) : null;
  const awaitingMyResponse = offer.offeredByUserId !== currentUserId;

  const metaParts: string[] = [`${counterpartyWord} ${counterpartyLabel}`];
  if (offer.counterRound > 0) metaParts.push(t('offers.row.round', { round: offer.counterRound }));
  if (status === 'pending' && !awaitingMyResponse) metaParts.push(t('offers.row.awaitingReply'));

  const a11y = `${listingTitle ?? t('offers.row.listingFallback')} — offer ${amount}, ${tone.word}, ${metaParts.join(', ')}${timeLeft ? `, ${timeLeft}` : ''}`;

  return (
    <View style={styles.row}>
      <AnimatedPressable
        style={styles.rowMain}
        onPress={() => onPress(offer)}
        disabled={isActing}
        activeOpacity={0.7}
        scaleValue={0.99}
        hapticFeedback={isActing ? undefined : "light"}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityHint={t('offers.row.openHint')}
        accessibilityState={{ disabled: isActing }}
      >
        {listingImageUri ? (
          <CachedImage uri={listingImageUri} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]} accessible={false}>
            <Ionicons name="pricetag-outline" size={IconGrammar.standard} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {listingTitle ?? t('offers.row.listingFallback')}
          </Text>
          <View style={styles.metaRow}>
            <Ionicons name={tone.icon} size={IconGrammar.badge} color={tone.color} />
            <Text style={[styles.metaStatus, { color: tone.color }]}>{tone.word}</Text>
            <Text style={styles.meta} numberOfLines={1}>
              {` · ${metaParts.join(' · ')}`}
            </Text>
          </View>
        </View>
        <View style={styles.trailing}>
          <Text style={styles.amount} numberOfLines={1}>{amount}</Text>
          {timeLeft ? (
            <Text style={[styles.expiry, { color: expiryToneColor(offer.expiresAt, nowMs, colors) }]}>
              {timeLeft}
            </Text>
          ) : null}
        </View>
      </AnimatedPressable>

      {actions.length > 0 ? (
        <View style={styles.actionsRow}>
          {actions.map((action) => (
            <Pressable
              key={action}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
              onPress={() => onAction(offer, action)}
              disabled={isActing}
              accessibilityRole="button"
              accessibilityLabel={`${actionLabel(action)} — ${listingTitle ?? t('offers.row.listingFallback')}, ${amount}`}
              accessibilityState={{ disabled: isActing, busy: isActing }}
            >
              <Text
                style={[
                  styles.actionText,
                  action === 'accept' && { color: colors.brand, fontFamily: TypographyV2.bodyStrong.fontFamily },
                  action === 'counter' && { color: colors.textPrimary },
                  (action === 'decline' || action === 'cancel') && { color: colors.textSecondary },
                ]}
              >
                {actionLabel(action)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ── helpers ────────────────────────────────────────────────────────────

function statusTone(
  status: ListingOfferStatus,
  colors: ThemeColors,
): { word: string; color: string; icon: keyof typeof Ionicons.glyphMap } {
  switch (status) {
    case 'accepted':
      return { word: t('offers.status.accepted'), color: colors.success, icon: 'checkmark-circle-outline' };
    case 'declined':
      return { word: t('offers.status.declined'), color: colors.textMuted, icon: 'close-circle-outline' };
    case 'expired':
      return { word: t('offers.status.expired'), color: colors.warning, icon: 'time-outline' };
    case 'cancelled':
      return { word: t('offers.status.cancelled'), color: colors.textMuted, icon: 'remove-circle-outline' };
    case 'countered':
      return { word: t('offers.status.countered'), color: colors.brand, icon: 'swap-horizontal-outline' };
    case 'pending':
    default:
      return { word: t('offers.status.pending'), color: colors.textSecondary, icon: 'hourglass-outline' };
  }
}

function formatTimeLeft(expiresAt: string, nowMs: number): string {
  const ms = Date.parse(expiresAt) - nowMs;
  if (!Number.isFinite(ms) || ms <= 0) return t('offers.status.expired');
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return t('offers.row.minutesLeft', { count: Math.max(1, minutes) });
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return t('offers.row.hoursMinutesLeft', { hours, minutes: minutes % 60 });
  const days = Math.floor(hours / 24);
  return t('offers.row.daysHoursLeft', { days, hours: hours % 24 });
}

function expiryToneColor(expiresAt: string, nowMs: number, colors: ThemeColors): string {
  const ms = Date.parse(expiresAt) - nowMs;
  if (!Number.isFinite(ms) || ms <= 0) return colors.textMuted;
  if (ms <= 60 * 60 * 1000) return colors.danger;
  if (ms <= 12 * 60 * 60 * 1000) return colors.warning;
  return colors.textMuted;
}

// ── styles ─────────────────────────────────────────────────────────────

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowMain: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.smMd,
      paddingHorizontal: Space.md,
      paddingVertical: Space.smMd,
      minHeight: Control.hit + Space.md,
    },
    thumb: {
      width: 44,
      height: 44,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceAlt,
    },
    thumbFallback: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: {
      flex: 1,
      gap: Space.xxs,
      minWidth: 0,
    },
    title: {
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    metaStatus: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },
    meta: {
      flexShrink: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      color: colors.textSecondary,
    },
    trailing: {
      alignItems: 'flex-end',
      gap: Space.xxs,
    },
    amount: {
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    expiry: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      fontVariant: ['tabular-nums'],
    },
    actionsRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: Space.lg,
      paddingHorizontal: Space.md,
      paddingBottom: Space.xs,
    },
    actionBtn: {
      minHeight: Control.hit,
      justifyContent: 'center',
      paddingHorizontal: Space.xs,
    },
    actionBtnPressed: {
      opacity: 0.6,
    },
    actionText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary,
    },
  });
