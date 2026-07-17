import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { CoOwnNumericText } from '../ui/CoOwnNumericText';
import type { CoOwnPositionState as CanonicalCoOwnPositionState } from '../../data/coOwnModels';

export type CoOwnPositionStatus = 'open' | 'closed' | 'paused';

/** Phase 3: mark source + age for the position row. */
export interface CoOwnPositionMark {
  source: 'last' | 'nav' | 'mid';
  price: number;
  ageSeconds: number | null;
  /** True if mark is stale (>24h). */
  isStale?: boolean;
}

/**
 * Phase 3: reserved/pending split — aligned to the canonical model.
 * `outstandingUnits` is included per the canonical CoOwnPositionState.
 * Re-exported from coOwnModels.ts for single-source-of-truth.
 */
export type CoOwnPositionState = CanonicalCoOwnPositionState;

export interface CoOwnPositionCardProps {
  imageUri?: string | null;
  title: string;
  unitsOwned: number;
  totalUnits: number;
  ownershipPct: number;
  currentValueLabel: string;
  avgEntryLabel?: string;
  unrealizedLabel?: string;
  realizedLabel?: string;
  status: CoOwnPositionStatus;
  sellable: boolean;
  onPress?: () => void;
  onBuyMore?: () => void;
  onSell?: () => void;
  index?: number;
  // ── Phase 3: exchange-grade additions (all optional — fail closed) ──
  /** Mark source + age. */
  mark?: CoOwnPositionMark;
  /** Mark value label (e.g. "6,200.00 1ZE"). */
  markValueLabel?: string;
  /** Local-fiat indication for mark value. */
  localFiatLabel?: string;
  /** NAV per unit label. */
  navPerUnitLabel?: string;
  /** NAV valuation date. */
  navValuedAt?: string;
  /** Premium of last/NAV percentage. */
  premiumLastNavPct?: number | null;
  /** Reserved/pending split. */
  positionState?: CoOwnPositionState;
  /** Outstanding units (labelled denominator). */
  outstandingUnits?: number;
  /** Distributions received label. */
  distributionsLabel?: string;
  /** Portfolio weight (fraction of total portfolio). */
  portfolioWeightPct?: number;
  /** Doc 10 §3.3: settlement state for pending units. */
  settlementState?: 'settling' | 'settled';
  /** Settlement ETA label (e.g. "ETA 2h"). */
  settlementEtaLabel?: string;
}

export function CoOwnPositionCard({
  imageUri,
  title,
  unitsOwned,
  totalUnits,
  ownershipPct,
  currentValueLabel,
  avgEntryLabel,
  unrealizedLabel,
  realizedLabel,
  status,
  sellable,
  onPress,
  onBuyMore,
  onSell,
  index = 0,
  mark,
  markValueLabel,
  localFiatLabel,
  navPerUnitLabel,
  navValuedAt,
  premiumLastNavPct,
  positionState,
  outstandingUnits,
  distributionsLabel,
  portfolioWeightPct,
  settlementState,
  settlementEtaLabel,
}: CoOwnPositionCardProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();

  const statusLabel = status === 'open' ? 'Active' : status === 'paused' ? 'Paused' : 'Closed';
  const statusColor = status === 'open' ? colors.success : status === 'paused' ? colors.textSecondary : colors.textMuted;

  // Mark source label + age
  const markSourceLabel = mark
    ? mark.source === 'last'
      ? 'Last'
      : mark.source === 'nav'
        ? 'NAV'
        : 'Mid'
    : null;
  const markAgeLabel = mark?.ageSeconds != null ? formatAge(mark.ageSeconds) : null;
  const isStaleMark = mark?.isStale ?? false;
  const markColor = isStaleMark ? colors.textMuted : colors.textPrimary;

  // Position state: settled/reserved/pending
  const settledUnits = positionState?.settled ?? unitsOwned;
  const reservedUnits = positionState?.reservedForSale ?? 0;
  const pendingInUnits = positionState?.pendingIn ?? 0;
  const pendingOutUnits = positionState?.pendingOut ?? 0;
  const sellableUnits = settledUnits - reservedUnits;

  // Outstanding denominator — prefer positionState.outstandingUnits, then the
  // separate prop, then fall back to totalUnits
  const outstandingLabel = (positionState?.outstandingUnits ?? outstandingUnits ?? totalUnits).toLocaleString('en-GB');

  return (
    <Reanimated.View entering={reducedMotion ? undefined : FadeInDown.delay(Math.min(index, 8) * 40).duration(250)}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${settledUnits} settled units, ${ownershipPct}% of ${outstandingLabel} outstanding, ${statusLabel}`}
      >
        <View style={[styles.root, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.mediaRow}>
            <View style={styles.imageWrap}>
              {imageUri ? (
                <CachedImage uri={imageUri} style={styles.image} contentFit="cover" transition={250} />
              ) : (
                <View style={[styles.image, styles.imageFallback, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name="cube-outline" size={24} color={colors.textMuted} />
                </View>
              )}
            </View>

            <View style={styles.identity}>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                {isStaleMark && (
                  <View style={[styles.staleBadge, { backgroundColor: colors.warning + '22' }]}>
                    <Text style={[styles.staleBadgeText, { color: colors.warning }]}>Stale mark</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>{title}</Text>
              <Text style={[styles.ownership, { color: colors.textSecondary }]}>
                {settledUnits} of {totalUnits} units · {ownershipPct}%
              </Text>
            </View>
          </View>

          {/* Phase 3: position state — settled/reserved/pending split */}
          {positionState && (
            <View style={[styles.stateRow, { borderColor: colors.border }]}>
              <StateItem label="Settled" value={settledUnits} colors={colors} />
              {reservedUnits > 0 && <StateItem label="Reserved" value={reservedUnits} colors={colors} />}
              {pendingInUnits > 0 && <StateItem label="Pending in" value={pendingInUnits} colors={colors} />}
              {pendingOutUnits > 0 && <StateItem label="Pending out" value={pendingOutUnits} colors={colors} />}
            </View>
          )}

          {/* Doc 10 §3.3: settlement state badge for pending units */}
          {settlementState && settlementState === 'settling' && pendingInUnits > 0 && (
            <View style={[styles.settlementBadge, { backgroundColor: colors.warning + '12' }]}>
              <Ionicons name="hourglass-outline" size={11} color={colors.warning} />
              <Text style={[styles.settlementBadgeText, { color: colors.warning }]} numberOfLines={1}>
                Settling{settlementEtaLabel ? ` · ${settlementEtaLabel}` : ''} · {pendingInUnits} units pending
              </Text>
            </View>
          )}

          {/* Phase 3: mark source + age + value */}
          {mark && markValueLabel && (
            <View style={[styles.markRow, { borderColor: colors.border }]}>
              <View style={styles.markSourceCol}>
                <Text style={[styles.markLabel, { color: colors.textMuted }]}>Mark</Text>
                <Text style={[styles.markSource, { color: markColor }]}>
                  {markSourceLabel} {mark.price.toFixed(2)}
                  {markAgeLabel && (
                    <Text style={[styles.markAge, { color: colors.textMuted }]}> · {markAgeLabel}</Text>
                  )}
                </Text>
              </View>
              <View style={styles.markValueCol}>
                <Text style={[styles.markValueLabel, { color: colors.textMuted }]}>Mark value</Text>
                <Text style={[styles.markValue, { color: markColor }]} numberOfLines={1}>
                  {markValueLabel}
                </Text>
                {localFiatLabel && (
                  <Text style={[styles.localFiat, { color: colors.textMuted }]} numberOfLines={1}>
                    {localFiatLabel}
                  </Text>
                )}
              </View>
            </View>
          )}

          <View style={[styles.valueRow, { borderColor: colors.border }]}>
            <View style={styles.valueItem}>
              <Text style={[styles.valueLabel, { color: colors.textMuted }]} numberOfLines={1}>Cost basis</Text>
              <Text style={[styles.valueAmount, { color: colors.textSecondary }]} numberOfLines={1}>{avgEntryLabel ?? '—'}</Text>
            </View>
            {unrealizedLabel ? (
              <View style={styles.valueItem}>
                <Text style={[styles.valueLabel, { color: colors.textMuted }]} numberOfLines={1}>Unrealised</Text>
                <Text style={[styles.valueAmount, { color: colors.textSecondary }]} numberOfLines={1}>{unrealizedLabel}</Text>
              </View>
            ) : null}
            {realizedLabel ? (
              <View style={styles.valueItem}>
                <Text style={[styles.valueLabel, { color: colors.textMuted }]} numberOfLines={1}>Realised</Text>
                <Text style={[styles.valueAmount, { color: colors.textSecondary }]} numberOfLines={1}>{realizedLabel}</Text>
              </View>
            ) : null}
          </View>

          {/* Phase 3: NAV + premium of last/NAV — the truth-telling line */}
          {navPerUnitLabel && (
            <View style={styles.navRow}>
              <Text style={[styles.navLabel, { color: colors.textMuted }]} numberOfLines={1}>
                NAV/unit {navPerUnitLabel}
                {navValuedAt && ` · ${navValuedAt}`}
              </Text>
              {premiumLastNavPct != null && (
                <View style={styles.premiumRow}>
                  <Text style={[styles.premiumLabel, { color: colors.textMuted }]}>Premium last/NAV</Text>
                  <Text
                    style={[
                      styles.premiumValue,
                      {
                        color: premiumLastNavPct > 0
                          ? colors.success
                          : premiumLastNavPct < 0
                            ? colors.danger
                            : colors.textSecondary,
                      },
                    ]}
                  >
                    {premiumLastNavPct > 0 ? '+' : ''}{premiumLastNavPct.toFixed(1)}%
                  </Text>
                  <Text style={[styles.premiumNote, { color: colors.textMuted }]}>← information</Text>
                </View>
              )}
            </View>
          )}

          {/* Phase 3: distributions received */}
          {distributionsLabel && (
            <View style={styles.distributionRow}>
              <Ionicons name="cash-outline" size={12} color={colors.textMuted} />
              <Text style={[styles.distributionText, { color: colors.textSecondary }]} numberOfLines={1}>
                Distributions received: {distributionsLabel}
              </Text>
            </View>
          )}

          {/* Ownership bar — portfolio weight when available, else ownership % */}
          <View style={styles.ownershipBar}>
            <View style={[styles.ownershipBarBg, { backgroundColor: colors.surfaceAlt }]}>
              <View
                style={[
                  styles.ownershipBarFill,
                  {
                    width: `${Math.min(portfolioWeightPct ?? ownershipPct, 100)}%`,
                    backgroundColor: colors.brand,
                  },
                ]}
              />
            </View>
            {portfolioWeightPct != null && (
              <Text style={[styles.portfolioWeightLabel, { color: colors.textMuted }]}>
                {portfolioWeightPct.toFixed(2)}% of your portfolio
              </Text>
            )}
          </View>

          <View style={styles.actionRow}>
            {onBuyMore ? (
              <Pressable
                onPress={(e) => { e.stopPropagation(); onBuyMore(); }}
                style={[styles.buyBtn, { backgroundColor: colors.brand }]}
                accessibilityRole="button"
                accessibilityLabel={`Buy more units of ${title}`}
              >
                <Text style={[styles.buyBtnText, { color: colors.background }]}>Buy more</Text>
              </Pressable>
            ) : null}
            {onSell ? (
              <Pressable
                onPress={(e) => { e.stopPropagation(); onSell(); }}
                style={[styles.sellBtn, { borderColor: colors.border, opacity: sellable ? 1 : 0.4 }]}
                disabled={!sellable}
                accessibilityRole="button"
                accessibilityLabel={sellable ? `Sell units of ${title}` : `Sell unavailable for ${title}`}
              >
                <Text style={[styles.sellBtnText, { color: colors.textPrimary }]}>
                  {sellable ? 'Sell' : 'No sellable'}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={(e) => { e.stopPropagation(); onPress?.(); }}
              style={styles.detailBtn}
              accessibilityRole="button"
              accessibilityLabel={`View ${title} details`}
            >
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Reanimated.View>
  );
}

/** Format age in seconds to a human-readable string. */
function formatAge(ageSeconds: number): string {
  if (ageSeconds < 60) return 'just now';
  const mins = Math.floor(ageSeconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** A position state item — label + value. */
function StateItem({
  label,
  value,
  colors,
}: {
  label: string;
  value: number;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  return (
    <View style={styles.stateItem}>
      <Text style={[styles.stateLabel, { color: colors.textMuted }]}>{label}</Text>
      <CoOwnNumericText
        value={value}
        unit="units"
        size="price"
        align="left"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    padding: Space.md,
    gap: Space.sm,
  },
  mediaRow: {
    flexDirection: 'row',
    gap: Space.md,
  },
  imageWrap: {
    width: 72,
    height: 72,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  image: {
    width: 72,
    height: 72,
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    flex: 1,
    gap: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.2,
  },
  title: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  ownership: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  valueRow: {
    flexDirection: 'row',
    gap: Space.md,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  valueItem: {
    flex: 1,
    gap: 2,
  },
  valueLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  valueAmount: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.2,
  },
  ownershipBar: {
    gap: 0,
  },
  ownershipBarBg: {
    height: 3,
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  ownershipBarFill: {
    height: 3,
    borderRadius: 1.5,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Space.sm,
    alignItems: 'center',
  },
  buyBtn: {
    flex: 1,
    minHeight: 44,
    paddingVertical: Space.sm + 4,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  sellBtn: {
    flex: 1,
    minHeight: 44,
    paddingVertical: Space.sm + 4,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  sellBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  detailBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Phase 3: stale mark badge ──
  staleBadge: {
    paddingHorizontal: Space.xs + 2,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    marginLeft: Space.xs,
  },
  staleBadgeText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.meta.letterSpacing,
  },
  // ── Phase 3: position state row ──
  stateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.md,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  // Doc 10 §3.3: settlement badge
  settlementBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 1,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
    marginTop: Space.xs,
  },
  settlementBadgeText: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.meta.letterSpacing,
  },
  stateItem: {
    gap: 2,
    minWidth: 70,
  },
  stateLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
  // ── Phase 3: mark row ──
  markRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Space.md,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  markSourceCol: {
    flex: 1,
    gap: 2,
  },
  markLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.meta.letterSpacing,
    textTransform: 'uppercase',
  },
  markSource: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  markAge: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
  markValueCol: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  markValueLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.meta.letterSpacing,
    textTransform: 'uppercase',
  },
  markValue: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  localFiat: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
  // ── Phase 3: NAV + premium row ──
  navRow: {
    gap: Space.xs,
    paddingTop: Space.sm,
  },
  navLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
  premiumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  premiumLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
  premiumValue: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  premiumNote: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
  // ── Phase 3: distribution row ──
  distributionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  distributionText: {
    flex: 1,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
  // ── Phase 3: portfolio weight label ──
  portfolioWeightLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
    marginTop: Space.xs,
  },
});
