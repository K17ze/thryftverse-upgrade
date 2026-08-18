import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import type { ThemeColors } from '../../theme/ThemeContext';
import { Space, Typography, Radius, Type, Control } from '../../theme/designTokens';

export type ListingMode = 'sell_now' | 'co_own' | 'auction';

interface ListingModeSelectorProps {
  mode: ListingMode;
  onChange: (mode: ListingMode) => void;
}

const MODES: { key: ListingMode; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; description: string }[] = [
  { key: 'sell_now', label: 'Sell now', icon: 'pricetag-outline', description: 'List at a fixed price for immediate purchase.' },
  { key: 'auction', label: 'Auction', icon: 'hammer-outline', description: 'Let buyers bid over a set duration.' },
  { key: 'co_own', label: 'Co-Own', icon: 'people-outline', description: 'Offer fractional shares to investors.' },
];

/**
 * Returns the display label for a listing mode.
 */
export function getListingModeLabel(mode: ListingMode): string {
  return MODES.find((m) => m.key === mode)?.label ?? 'Sell now';
}

/**
 * Returns the mode labels for use by the parent's bottom sheet picker.
 */
export function getListingModeOptions(): string[] {
  return MODES.map((m) => m.label);
}

/**
 * Maps a display label back to a ListingMode.
 */
export function getListingModeFromLabel(label: string): ListingMode {
  return MODES.find((m) => m.label === label)?.key ?? 'sell_now';
}

/**
 * Returns the description for a listing mode.
 */
export function getListingModeDescription(mode: ListingMode): string {
  return MODES.find((m) => m.key === mode)?.description ?? '';
}

/**
 * Returns the icon name for a listing mode.
 */
export function getListingModeIcon(mode: ListingMode): React.ComponentProps<typeof Ionicons>['name'] {
  return MODES.find((m) => m.key === mode)?.icon ?? 'pricetag-outline';
}

/**
 * Compact "Selling format" disclosure row.
 *
 * Per audit 04: "Do not make fixed-price / auction / Co-Own look like three
 * equal tabs if 90% of users use one mode. Recommended: default `Sell`;
 * compact 'Selling format' row; sheet: Fixed price / Auction / Co-Own;
 * after selection, only relevant fields render."
 *
 * This component renders a single compact row showing the current format
 * with a chevron. The parent opens a BottomSheetPicker to change the format.
 * The three-equal-tabs pattern is replaced by progressive disclosure.
 */
export function ListingModeSelector({ mode, onChange }: ListingModeSelectorProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const activeMode = MODES.find((m) => m.key === mode);
  const description = activeMode?.description ?? '';

  return (
    <View style={styles.container}>
      <Pressable
        style={({ pressed }) => [styles.formatRow, pressed && { opacity: 0.6 }]}
        onPress={() => onChange(mode)}
        accessibilityRole="button"
        accessibilityLabel={`Selling format: ${activeMode?.label ?? 'Sell now'}. Tap to change.`}
        accessibilityHint="Opens format options"
      >
        <View style={styles.formatRowLeft}>
          <Ionicons
            name={activeMode?.icon ?? 'pricetag-outline'}
            size={18}
            color={colors.textSecondary}
            style={styles.formatIcon}
          />
          <View style={styles.formatTextWrap}>
            <Text style={styles.formatLabel}>Selling format</Text>
            <Text style={styles.formatValue}>
              {activeMode?.label ?? 'Sell now'}
            </Text>
          </View>
        </View>
        <View style={styles.formatRowRight}>
          <Text style={styles.formatChange}>Change</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </View>
      </Pressable>
      {description ? (
        <Text style={styles.modeDescription}>{description}</Text>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: Space.md,
    },
    // ── Compact format row ──
    // Per audit 04: progressive disclosure, not three equal tabs.
    // Flat inline row — no surface fill, no border (per §4 surface budget).
    // The row reads as a labeled value with a "Change" affordance.
    formatRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm,
      minHeight: Control.hit + Space.sm,
    },
    formatRowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm + 2,
      flexShrink: 1,
    },
    formatIcon: {
      flexShrink: 0,
    },
    formatTextWrap: {
      flexShrink: 1,
      gap: Space.xs / 2,
    },
    formatLabel: {
      fontSize: Type.label.size,
      lineHeight: Type.label.lineHeight,
      fontFamily: Typography.family.semibold,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: Type.label.letterSpacing,
    },
    formatValue: {
      fontSize: Type.bodyStrong.size,
      lineHeight: Type.bodyStrong.lineHeight,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    formatRowRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      flexShrink: 0,
    },
    formatChange: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      color: colors.brand,
    },
    modeDescription: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      marginTop: Space.xs,
      paddingHorizontal: Space.xs,
    },
  });
}
