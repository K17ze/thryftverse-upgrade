import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Typography, Space, Radius, Type } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { BottomSheet } from '../BottomSheet';
import { AppButton } from '../ui/AppButton';
import { haptics } from '../../utils/haptics';

export interface BoostTier {
  id: string;
  label: string;
  durationHours: number;
  priceGbp: number;
  description: string;
}

export const BOOST_TIERS: BoostTier[] = [
  { id: 'boost_24h', label: '24 hours', durationHours: 24, priceGbp: 2.99, description: 'Quick visibility boost' },
  { id: 'boost_3d', label: '3 days', durationHours: 72, priceGbp: 6.99, description: 'Extended reach' },
  { id: 'boost_7d', label: '7 days', durationHours: 168, priceGbp: 12.99, description: 'Maximum exposure' },
];

export interface BoostListingSheetProps {
  visible: boolean;
  listing: {
    id: string;
    title: string;
    price: number;
    image?: string;
  } | null;
  /** Current boost expiry ISO string, if listing is already boosted */
  currentBoostedUntil?: string | null;
  onClose: () => void;
  onBoost: (params: { listingId: string; tier: BoostTier }) => void;
}

export function BoostListingSheet({
  visible,
  listing,
  currentBoostedUntil,
  onClose,
  onBoost,
}: BoostListingSheetProps) {
  const { colors } = useAppTheme();
  const [selectedTierId, setSelectedTierId] = useState<string>(BOOST_TIERS[1].id);

  const selectedTier = BOOST_TIERS.find((t) => t.id === selectedTierId) ?? BOOST_TIERS[1];
  const isCurrentlyBoosted = currentBoostedUntil
    ? new Date(currentBoostedUntil).getTime() > Date.now()
    : false;

  const handleBoost = () => {
    if (!listing) return;
    haptics.tap();
    onBoost({ listingId: listing.id, tier: selectedTier });
  };

  return (
    <BottomSheet visible={visible} onDismiss={onClose} snapPoint={0.6}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        Boost your listing
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Promoted listings appear higher in search and feed results, reaching more buyers.
      </Text>

      <ScrollView
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {isCurrentlyBoosted && (
          <View style={[styles.activeBoostBanner, { backgroundColor: `${colors.brand}12` }]}>
            <Ionicons name="rocket-outline" size={16} color={colors.brand} />
            <Text style={[styles.activeBoostText, { color: colors.brand }]}>
              Currently boosted until {new Date(currentBoostedUntil!).toLocaleDateString()}
            </Text>
          </View>
        )}

        {/* Tier selection — flat rows with hairline separators.
            Per AGENTS.md: flat canvas, no cards. Selection state
            communicated by radio icon, not border. */}
        {BOOST_TIERS.map((tier, index) => {
          const isSelected = tier.id === selectedTierId;
          return (
            <Pressable
              key={tier.id}
              onPress={() => {
                haptics.selection();
                setSelectedTierId(tier.id);
              }}
              style={({ pressed }) => [
                styles.tierRow,
                index < BOOST_TIERS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${tier.label} boost for £${tier.priceGbp.toFixed(2)}`}
            >
              <View style={styles.tierInfo}>
                <View style={styles.tierHeader}>
                  <Text style={[styles.tierLabel, { color: colors.textPrimary }]}>
                    {tier.label}
                  </Text>
                  <Text style={[styles.tierPrice, { color: colors.brand }]}>
                    £{tier.priceGbp.toFixed(2)}
                  </Text>
                </View>
                <Text style={[styles.tierDescription, { color: colors.textSecondary }]}>
                  {tier.description}
                </Text>
              </View>
              {isSelected ? (
                <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
              ) : (
                <Ionicons name="radio-button-off" size={22} color={colors.textMuted} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <AppButton
          title={`Boost for £${selectedTier.priceGbp.toFixed(2)}`}
          variant="primary"
          size="lg"
          style={styles.boostBtn}
          onPress={handleBoost}
          accessibilityLabel={`Confirm boost for ${selectedTier.label} at £${selectedTier.priceGbp.toFixed(2)}`}
          hapticFeedback="light"
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.subtitle.letterSpacing,
    textAlign: 'center',
    marginBottom: Space.xs,
  },
  subtitle: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    paddingHorizontal: Space.lg,
    marginBottom: Space.md,
  },
  listContent: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.md,
  },
  activeBoostBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    marginBottom: Space.sm,
  },
  activeBoostText: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.medium,
  },
  // ── Tier rows — flat, hairline separators ──
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.md,
    minHeight: 44,
  },
  tierInfo: {
    flex: 1,
    gap: 2,
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tierLabel: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  tierPrice: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.bold,
    fontVariant: ['tabular-nums'],
  },
  tierDescription: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    fontFamily: Typography.family.regular,
  },
  footer: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.md,
  },
  boostBtn: {
    width: '100%',
  },
});
