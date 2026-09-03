import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Stroke} from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { CachedImage } from '../CachedImage';
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
    <View>
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
                  <Ionicons name="image-outline" size={24} color={colors.textMuted} />
                </View>
              )}
            </View>

            <View style={styles.identity}>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                {isStaleMark && (
                  <View style={[styles.staleBadge, { backgroundColor: colors.warningSubtle }]}>
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
            <View style={[styles.settlementBadge, { backgroundColor: colors.warningSubtle }]}>
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
                          ? colors.coownUp
                          : premiumLastNavPct < 0
                            ? colors.coownDown
                            : colors.textSecondary,
                      },
                    ]}
                  >
                    {premiumLastNavPct > 0 ? '+' : ''}{premiumLastNavPct.toFixed(1)}%
                  </Text>
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
    </View>
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
    borderWidth: StyleSheet.hairlineWidth,
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
    borderRadius: Radius.sm,
  },
  statusText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.2,
  },
  title: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  ownership: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
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
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  valueAmount: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: -0.2,
  },
  ownershipBar: {
    gap: 0,
  },
  ownershipBarBg: {
    height: 3,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  ownershipBarFill: {
    height: 3,
    borderRadius: Radius.full,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Space.sm,
    alignItems: 'center',
  },
  buyBtn: {
    flex: 1,
    minHeight: 44,
    paddingVertical: Space.smMd,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
  },
  sellBtn: {
    flex: 1,
    minHeight: 44,
    paddingVertical: Space.smMd,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Stroke.standard,
  },
  sellBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
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
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
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
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  stateItem: {
    gap: 2,
    minWidth: 70,
  },
  stateLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
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
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textTransform: 'uppercase',
  },
  markSource: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  markAge: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  markValueCol: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  markValueLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textTransform: 'uppercase',
  },
  markValue: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  localFiat: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  // ── Phase 3: NAV + premium row ──
  navRow: {
    gap: Space.xs,
    paddingTop: Space.sm,
  },
  navLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  premiumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  premiumLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  premiumValue: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  // ── Phase 3: distribution row ──
  distributionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  distributionText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  // ── Phase 3: portfolio weight label ──
  portfolioWeightLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: Space.xs,
  },
});
