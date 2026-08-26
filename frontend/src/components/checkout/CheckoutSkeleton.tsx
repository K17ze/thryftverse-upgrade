import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type ThemeColors } from '../../theme/ThemeContext';
import { Space, FontFamily, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';

// CheckoutSkeleton — matches the final checkout layout geometry so the
// loading-to-populated transition has no layout shift. Per AGENTS.md §14:
// "Skeletons should resemble the final layout."
export function CheckoutSkeleton({ colors }: { colors: ThemeColors }) {
  const insets = useSafeAreaInsets();
  const skeletonStyles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingBottom: Space.sm,
      paddingTop: insets.top,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
    },
    headerSpacer: {
      width: Control.hit,
    },
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      gap: Space.md,
    },
    itemSummaryBlock: {
      flexDirection: 'row',
      gap: Space.md,
      paddingVertical: Space.sm,
    },
    skeletonImage: {
      width: 72,
      height: 72,
      borderRadius: RadiusRoleValue.mediaThumbnail,
      backgroundColor: colors.surfaceAlt,
    },
    skeletonTextCol: {
      flex: 1,
      gap: Space.xs + 2,
      paddingVertical: Space.xs,
    },
    skeletonLine: {
      height: 14,
      borderRadius: RadiusRoleValue.compactControl,
      backgroundColor: colors.surfaceAlt,
    },
    skeletonLineShort: {
      width: '60%',
    },
    skeletonLineMedium: {
      width: '80%',
    },
    skeletonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      paddingVertical: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    skeletonIcon: {
      width: 22,
      height: 22,
      borderRadius: RadiusRoleValue.pillAvatar,
      backgroundColor: colors.surfaceAlt,
    },
    skeletonRowText: {
      flex: 1,
      gap: Space.xs,
    },
    skeletonFooter: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: Space.md,
      paddingTop: Space.sm + 2,
      paddingBottom: Math.max(insets.bottom, Space.md),
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
      gap: Space.sm,
    },
    skeletonPayBtn: {
      height: 52,
      borderRadius: RadiusRoleValue.pillAvatar,
      backgroundColor: colors.surfaceAlt,
    },
    skeletonTotalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Space.xs,
    },
  }), [colors, insets.top, insets.bottom]);

  return (
    <View style={skeletonStyles.container}>
      <View style={skeletonStyles.header}>
        <View style={{ width: Control.hit, height: Control.hit, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="close" size={22} color={colors.textPrimary} aria-hidden={true} />
        </View>
        <Text style={skeletonStyles.headerTitle}>Checkout</Text>
        <View style={skeletonStyles.headerSpacer} />
      </View>
      <View style={skeletonStyles.scrollContent}>
        {/* Item summary skeleton */}
        <View style={skeletonStyles.itemSummaryBlock}>
          <View style={skeletonStyles.skeletonImage} />
          <View style={skeletonStyles.skeletonTextCol}>
            <View style={[skeletonStyles.skeletonLine, skeletonStyles.skeletonLineMedium]} />
            <View style={[skeletonStyles.skeletonLine, skeletonStyles.skeletonLineShort]} />
          </View>
        </View>
        {/* Delivery address row skeleton */}
        <View style={skeletonStyles.skeletonRow}>
          <View style={skeletonStyles.skeletonIcon} />
          <View style={skeletonStyles.skeletonRowText}>
            <View style={[skeletonStyles.skeletonLine, skeletonStyles.skeletonLineShort]} />
            <View style={[skeletonStyles.skeletonLine, { width: '90%' }]} />
          </View>
        </View>
        {/* Delivery method row skeleton */}
        <View style={skeletonStyles.skeletonRow}>
          <View style={skeletonStyles.skeletonIcon} />
          <View style={skeletonStyles.skeletonRowText}>
            <View style={[skeletonStyles.skeletonLine, skeletonStyles.skeletonLineShort]} />
            <View style={[skeletonStyles.skeletonLine, { width: '70%' }]} />
          </View>
        </View>
        {/* Payment method row skeleton */}
        <View style={skeletonStyles.skeletonRow}>
          <View style={skeletonStyles.skeletonIcon} />
          <View style={skeletonStyles.skeletonRowText}>
            <View style={[skeletonStyles.skeletonLine, skeletonStyles.skeletonLineShort]} />
            <View style={[skeletonStyles.skeletonLine, { width: '80%' }]} />
          </View>
        </View>
      </View>
      {/* Footer skeleton */}
      <View style={skeletonStyles.skeletonFooter}>
        <View style={skeletonStyles.skeletonTotalRow}>
          <View style={[skeletonStyles.skeletonLine, { width: 50 }]} />
          <View style={[skeletonStyles.skeletonLine, { width: 90 }]} />
        </View>
        <View style={skeletonStyles.skeletonPayBtn} />
      </View>
    </View>
  );
}
