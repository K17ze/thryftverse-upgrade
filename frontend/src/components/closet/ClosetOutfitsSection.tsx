import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { EmptyState } from '../EmptyState';
import { AppButton } from '../ui/AppButton';
import { FlagshipEmptyGraphic } from '../flagship';
import { OutfitCard } from '../outfit/OutfitCard';
import { Space } from '../../theme/designTokens';
import type { ClosetOutfitLike } from '../../domain/closet';
import { closetStyles } from './closetStyles';

type OutfitCardData = ClosetOutfitLike & { thumbs: string[] };

interface ClosetOutfitsSectionProps {
  outfits: OutfitCardData[];
  /** True when the user has no outfits at all (vs. an empty search result). */
  hasAnyOutfits: boolean;
  searchQuery: string;
  onCreateOutfit: () => void;
  onPressOutfit: () => void;
  onLongPressOutfit: (outfit: OutfitCardData) => void;
}

/** Outfits tab body — 2-column outfit cards over the two empty states. */
export function ClosetOutfitsSection({
  outfits,
  hasAnyOutfits,
  searchQuery,
  onCreateOutfit,
  onPressOutfit,
  onLongPressOutfit,
}: ClosetOutfitsSectionProps) {
  const { colors } = useAppTheme();
  const { width: SCREEN_W } = useWindowDimensions();

  if (outfits.length === 0) {
    if (!hasAnyOutfits) {
      return (
        <EmptyState
          graphic={<FlagshipEmptyGraphic variant="bag" size={120} />}
          title="No outfits yet"
          subtitle="Combine items from your closet into styled outfits."
          ctaLabel="Create Outfit"
          onCtaPress={onCreateOutfit}
        />
      );
    }
    return (
      <EmptyState
        icon="search-outline"
        title="No outfits found"
        subtitle={`No outfits matching "${searchQuery}".`}
      />
    );
  }

  return (
    <>
      <View style={closetStyles.outfitsGrid}>
        {outfits.map((outfit) => (
          <OutfitCard
            key={outfit.id}
            name={outfit.name}
            itemIds={outfit.itemIds}
            thumbnailUris={outfit.thumbs}
            backgroundColor={outfit.backgroundColor}
            onPress={onPressOutfit}
            onLongPress={() => onLongPressOutfit(outfit)}
            style={{ width: (SCREEN_W - Space.md * 2 - Space.sm) / 2 }}
          />
        ))}
      </View>
      <AppButton
        title="Create Outfit"
        icon={<Ionicons name="add" size={16} color={colors.background} />}
        onPress={onCreateOutfit}
        style={closetStyles.createCollectionBtn}
      />
    </>
  );
}
