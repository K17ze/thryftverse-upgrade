/**
 * SustainabilityImpact — environmental impact section for the product page.
 *
 * Fetches real impact data from the backend (`fetchListingImpact`) and
 * surfaces it with full methodology disclosure per AGENTS.md §11 (truthful
 * UI). Fail-closed: renders nothing when the backend reports no data.
 *
 * Per AGENTS.md §4: flat canvas section, hairline dividers, no card-on-card.
 * The methodology disclosure is a simple expandable Pressable — the one
 * permitted contained interaction.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { Space, Radius, Type, Typography, Stroke } from '../../../theme/designTokens';
import { fetchListingImpact, type ListingImpactResponse } from '../../../services/impactApi';

export interface SustainabilityImpactProps {
  listingId: string;
}

export function SustainabilityImpact({ listingId }: SustainabilityImpactProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [data, setData] = useState<ListingImpactResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchListingImpact(listingId)
      .then((res) => {
        if (cancelled) return;
        if (res.available) setData(res);
        else setData(null);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.textMuted} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>
            Loading environmental impact…
          </Text>
        </View>
      </View>
    );
  }

  if (!data) return null;

  const isNetPositive = data.co2eAvoidedKg > 0;
  const summaryLine = isNetPositive
    ? `Estimated ${data.co2eAvoidedKg} kg CO₂e avoided by buying this pre-owned item`
    : `Shipping this item produces ${Math.abs(data.co2eAvoidedKg)} kg CO₂e more than resale avoids`;

  const waterSuffix = data.waterSavedL > 0
    ? ` · ${data.waterSavedL} L water saved`
    : '';

  return (
    <View style={styles.container}>
      <Text
        style={[styles.header, { color: colors.textPrimary }]}
        accessibilityRole="header"
      >
        Environmental impact
      </Text>

      <Text style={[styles.summary, { color: colors.textPrimary }]}>
        {summaryLine}
        {waterSuffix}
      </Text>

      {/* Methodology disclosure — expandable */}
      <Pressable
        onPress={toggleExpanded}
        style={({ pressed }) => [
          styles.disclosureTrigger,
          pressed && { opacity: 0.6 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Hide methodology' : 'Show methodology'}
      >
        <Text style={[styles.disclosureLabel, { color: colors.textSecondary }]}>
          Methodology
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={colors.textSecondary}
        />
      </Pressable>

      {expanded ? (
        <View
          style={[
            styles.methodology,
            {
              borderTopColor: colors.borderSubtle,
              borderBottomColor: colors.borderSubtle,
            },
          ]}
        >
          <MethodRow label="Production avoided" value={`${data.co2eProductionAvoidedKg} kg CO₂e`} colors={colors} styles={styles} />
          <MethodRow label="End-of-life avoided" value={`${data.co2eEolAvoidedKg} kg CO₂e`} colors={colors} styles={styles} />
          <MethodRow
            label="Shipping"
            value={`${data.co2eShippingKg} kg CO₂e (${data.distanceKm} km, ${data.carrierMode})`}
            colors={colors}
            styles={styles}
          />
          <MethodRow label="Packaging" value={`${data.co2ePackagingKg} kg CO₂e`} colors={colors} styles={styles} />
          <MethodRow
            label="Displacement rate"
            value={data.displacementRate.toString()}
            colors={colors}
            styles={styles}
            hint="applied to avoided emissions"
          />
          <MethodRow
            label="Rebound effect"
            value={data.reboundEffect.toString()}
            colors={colors}
            styles={styles}
            hint="accounted for in net figure"
          />
          <MethodRow label="Methodology version" value={data.methodologyVersion} colors={colors} styles={styles} />
          <MethodRow label="Data sources" value={data.factorSources.join(', ')} colors={colors} styles={styles} />
        </View>
      ) : null}

      <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
        Estimate based on material composition and verified emissions factors. Not a precise measurement.
      </Text>
    </View>
  );
}

function MethodRow({
  label,
  value,
  hint,
  colors,
  styles,
}: {
  label: string;
  value: string;
  hint?: string;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={[styles.methodRow, { borderBottomColor: colors.borderSubtle }]}>
      <Text style={[styles.methodLabel, { color: colors.textSecondary }]}>
        {label}
        {hint ? <Text style={styles.methodHint}> ({hint})</Text> : null}
      </Text>
      <Text
        style={[styles.methodValue, { color: colors.textPrimary }]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: Space.md,
      paddingTop: Space.md,
      paddingBottom: Space.sm,
      gap: Space.sm,
    },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.xs,
    },
    loadingText: {
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight,
      fontFamily: Typography.family.regular,
    },
    header: {
      fontSize: Type.bodyStrong.size,
      lineHeight: Type.bodyStrong.lineHeight,
      fontFamily: Typography.family.semibold,
    },
    summary: {
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight + 2,
      fontFamily: Typography.family.medium,
    },
    disclosureTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.xs,
    },
    disclosureLabel: {
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight,
      fontFamily: Typography.family.semibold,
    },
    methodology: {
      borderTopWidth: Stroke.hairline,
      borderBottomWidth: Stroke.hairline,
      paddingVertical: Space.xs,
    },
    methodRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: Space.sm,
      paddingVertical: Space.sm - 2,
      borderBottomWidth: Stroke.hairline,
    },
    methodLabel: {
      flexShrink: 1,
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight,
      fontFamily: Typography.family.regular,
    },
    methodHint: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
    },
    methodValue: {
      flexShrink: 0,
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight,
      fontFamily: Typography.family.medium,
      textAlign: 'right',
      fontVariant: ['tabular-nums'],
    },
    disclaimer: {
      fontSize: Type.meta.size,
      lineHeight: Type.meta.lineHeight + 2,
      fontFamily: Typography.family.regular,
    },
  });
}
