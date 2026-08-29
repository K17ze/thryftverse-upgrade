/**
 * CoOwnValueStrip — the three-column Market/Fundamental/Cash value strip
 * that replaces the single-price display on AssetDetail.
 *
 * Each value uses CoOwnNumericText (tabular, aligned, true minus).
 * Missing values show "—" with a contextual label ("No current order",
 * "Not yet available"). No zeros. No fabricated data. Timestamps beside
 * data (source §11.11).
 *
 * See docs/coown/flagship-exchange-upgrade/04 §A2 + 03 §2.3.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, ExchangeLayout } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { CoOwnNumericText } from '../ui/CoOwnNumericText';

export interface CoOwnValueStripProps {
  // Market column
  last?: { price: number; ageSeconds: number | null };
  bid?: { price: number; size: number };
  ask?: { price: number; size: number };
  spread?: number;
  // Fundamental column
  nav?: { pricePerUnit: number; valuedAt: string; method: string; valuer?: string };
  premiumPct?: number | null;
  // Cash column
  nextDistribution?: string | null;
  nextReporting?: string | null;
  // Local fiat indication (optional, for the local-currency line)
  localFiat?: { symbol: string; rate: number; source: string; timestamp: string };
}

/** Format age in seconds to a human-readable string. */
function formatAge(ageSeconds: number | null): string {
  if (ageSeconds == null) return '';
  if (ageSeconds < 60) return 'just now';
  const mins = Math.floor(ageSeconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** A single value cell in the strip. */
function ValueCell({
  label,
  children,
  colors,
}: {
  label: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  return (
    <View style={styles.cell}>
      <Text
        style={[styles.cellLabel, { color: colors.textMuted }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

/** The "missing" placeholder — never zero, never fabricated. */
function MissingValue({
  caption,
  colors,
}: {
  caption: string;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  return (
    <View>
      <Text style={[styles.missingValue, { color: colors.textMuted }]}>—</Text>
      <Text
        style={[styles.missingCaption, { color: colors.textMuted }]}
        numberOfLines={1}
      >
        {caption}
      </Text>
    </View>
  );
}

export function CoOwnValueStrip({
  last,
  bid,
  ask,
  spread,
  nav,
  premiumPct,
  nextDistribution,
  nextReporting,
  localFiat,
}: CoOwnValueStripProps) {
  const { colors } = useAppTheme();

  // Build a composite accessibility label for the entire strip
  const a11yParts: string[] = [];
  if (last) a11yParts.push(`Last ${last.price} 1ZE${last.ageSeconds != null ? `, ${formatAge(last.ageSeconds)}` : ''}`);
  else a11yParts.push('Last: no trades yet');
  if (bid) a11yParts.push(`Bid ${bid.price} × ${bid.size}`);
  else a11yParts.push('Bid: no current order');
  if (ask) a11yParts.push(`Ask ${ask.price} × ${ask.size}`);
  else a11yParts.push('Ask: no current order');
  if (spread != null) a11yParts.push(`Spread ${spread}`);
  if (nav) a11yParts.push(`NAV per unit ${nav.pricePerUnit}, valued ${nav.valuedAt}`);
  else a11yParts.push('NAV: not yet available');
  if (premiumPct != null) a11yParts.push(`Premium ${premiumPct}%`);
  if (nextDistribution) a11yParts.push(`Next distribution ${nextDistribution}`);
  if (nextReporting) a11yParts.push(`Next reporting ${nextReporting}`);

  return (
    <View
      style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}
      accessibilityRole="summary"
      accessibilityLabel={`Value strip. ${a11yParts.join('. ')}`}
    >
      {/* ── Market column ── */}
      <View style={styles.column}>
        <Text style={[styles.columnHeader, { color: colors.textMuted }]}>Market</Text>

        {/* Last */}
        <ValueCell label="Last" colors={colors}>
          {last ? (
            <View>
              <CoOwnNumericText
                value={last.price}
                unit="1ZE"
                size="priceList"
                align="left"
              />
              {last.ageSeconds != null && (
                <Text style={[styles.ageLabel, { color: colors.textMuted }]}>
                  {formatAge(last.ageSeconds)}
                </Text>
              )}
            </View>
          ) : (
            <MissingValue caption="No trades yet" colors={colors} />
          )}
        </ValueCell>

        {/* Bid / Ask */}
        <View style={styles.bidAskRow}>
          <ValueCell label="Bid" colors={colors}>
            {bid ? (
              <View>
                <CoOwnNumericText
                  value={bid.price}
                  unit="1ZE"
                  size="price"
                  align="left"
                />
                <Text style={[styles.sizeLabel, { color: colors.textMuted }]}>
                  × {bid.size}
                </Text>
              </View>
            ) : (
              <MissingValue caption="No current order" colors={colors} />
            )}
          </ValueCell>

          <ValueCell label="Ask" colors={colors}>
            {ask ? (
              <View>
                <CoOwnNumericText
                  value={ask.price}
                  unit="1ZE"
                  size="price"
                  align="left"
                />
                <Text style={[styles.sizeLabel, { color: colors.textMuted }]}>
                  × {ask.size}
                </Text>
              </View>
            ) : (
              <MissingValue caption="No current order" colors={colors} />
            )}
          </ValueCell>
        </View>

        {/* Spread */}
        <ValueCell label="Spread" colors={colors}>
          {spread != null ? (
            <CoOwnNumericText
              value={spread}
              unit="1ZE"
              size="price"
              precision={2}
              align="left"
            />
          ) : (
            <MissingValue caption="—" colors={colors} />
          )}
        </ValueCell>
      </View>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* ── Fundamental column ── */}
      <View style={styles.column}>
        <Text style={[styles.columnHeader, { color: colors.textMuted }]}>Fundamental</Text>

        {/* NAV */}
        <ValueCell label="NAV / unit" colors={colors}>
          {nav ? (
            <View>
              <CoOwnNumericText
                value={nav.pricePerUnit}
                unit="1ZE"
                size="price"
                align="left"
              />
              <Text style={[styles.ageLabel, { color: colors.textMuted }]} numberOfLines={1}>
                {nav.valuedAt}
              </Text>
              {nav.valuer && (
                <Text style={[styles.sizeLabel, { color: colors.textMuted }]} numberOfLines={1}>
                  {nav.valuer}
                </Text>
              )}
            </View>
          ) : (
            <MissingValue caption="Not yet available" colors={colors} />
          )}
        </ValueCell>

        {/* Premium / discount */}
        <ValueCell label="Premium / discount" colors={colors}>
          {premiumPct != null ? (
            <CoOwnNumericText
              value={premiumPct}
              unit="pct"
              size="price"
              signed
              direction={premiumPct > 0 ? 'up' : premiumPct < 0 ? 'down' : 'flat'}
              align="left"
            />
          ) : (
            <MissingValue caption="Needs last + NAV" colors={colors} />
          )}
        </ValueCell>
      </View>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* ── Cash column ── */}
      <View style={styles.column}>
        <Text style={[styles.columnHeader, { color: colors.textMuted }]}>Cash</Text>

        {/* Next distribution */}
        <ValueCell label="Next distribution" colors={colors}>
          {nextDistribution ? (
            <Text style={[styles.textValue, { color: colors.textPrimary }]} numberOfLines={1}>
              {nextDistribution}
            </Text>
          ) : (
            <MissingValue caption="Not scheduled" colors={colors} />
          )}
        </ValueCell>

        {/* Next reporting */}
        <ValueCell label="Next reporting" colors={colors}>
          {nextReporting ? (
            <Text style={[styles.textValue, { color: colors.textPrimary }]} numberOfLines={1}>
              {nextReporting}
            </Text>
          ) : (
            <MissingValue caption="Not scheduled" colors={colors} />
          )}
        </ValueCell>
      </View>

      {/* Local fiat indication — optional, full width below */}
      {localFiat && (
        <View style={[styles.localFiatRow, { borderTopColor: colors.border }]}>
          <Text style={[styles.localFiatLabel, { color: colors.textMuted }]}>
            Indicative local
          </Text>
          <CoOwnNumericText
            value={last ? last.price * localFiat.rate : 0}
            unit={localFiat.symbol}
            size="price"
            precision={2}
            align="right"
            showUnit
          />
          <Text style={[styles.localFiatSource, { color: colors.textMuted }]} numberOfLines={1}>
            {localFiat.source} · {localFiat.timestamp}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  column: {
    flex: 1,
    padding: Space.sm,
    gap: Space.xs,
  },
  columnHeader: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginBottom: Space.xs,
  },
  cell: {
    minHeight: ExchangeLayout.valueStripRowHeight - 16,
    gap: 2,
  },
  cellLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  bidAskRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  ageLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: 1,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  sizeLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: 1,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  missingValue: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: TypographyV2.priceList.fontFamily,
  },
  missingCaption: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: 1,
  },
  textValue: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  localFiatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  localFiatLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  localFiatSource: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textAlign: 'right',
  },
});

export default CoOwnValueStrip;
