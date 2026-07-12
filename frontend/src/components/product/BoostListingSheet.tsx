import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';
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
      <Text style={styles.title}>Boost your listing</Text>
      <Text style={styles.subtitle}>
        Promoted listings appear higher in search and feed results, reaching more buyers.
      </Text>

      <ScrollView
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {isCurrentlyBoosted && (
          <View style={styles.activeBoostBanner}>
            <Ionicons name="rocket-outline" size={16} color={Colors.brand} />
            <Text style={styles.activeBoostText}>
              Currently boosted until {new Date(currentBoostedUntil!).toLocaleDateString()}
            </Text>
          </View>
        )}

        {BOOST_TIERS.map((tier) => {
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
                isSelected && styles.tierRowSelected,
                pressed && styles.tierRowPressed,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${tier.label} boost for £${tier.priceGbp.toFixed(2)}`}
            >
              <View style={styles.tierInfo}>
                <View style={styles.tierHeader}>
                  <Text style={styles.tierLabel}>{tier.label}</Text>
                  <Text style={styles.tierPrice}>£{tier.priceGbp.toFixed(2)}</Text>
                </View>
                <Text style={styles.tierDescription}>{tier.description}</Text>
              </View>
              {isSelected ? (
                <Ionicons name="checkmark-circle" size={22} color={Colors.brand} />
              ) : (
                <Ionicons name="radio-button-off" size={22} color={Colors.textMuted} />
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
    fontSize: 18,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
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
    gap: 6,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: `${Colors.brand}12`,
    marginBottom: Space.sm,
  },
  activeBoostText: {
    fontSize: 12,
    fontFamily: Typography.family.medium,
    color: Colors.brand,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    marginBottom: Space.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  tierRowSelected: {
    borderColor: Colors.brand,
    backgroundColor: `${Colors.brand}08`,
  },
  tierRowPressed: {
    opacity: 0.7,
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
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  tierPrice: {
    fontSize: 16,
    fontFamily: Typography.family.bold,
    color: Colors.brand,
  },
  tierDescription: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
  },
  footer: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.md,
  },
  boostBtn: {
    width: '100%',
  },
});
