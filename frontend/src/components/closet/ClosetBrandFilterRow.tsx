import React from 'react';
import { Text, ScrollView } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { closetStyles, useClosetThemedStyles } from './closetStyles';

interface ClosetBrandFilterRowProps {
  brands: string[];
  activeBrand: string | null;
  /** `null` selects the "All" chip; a brand toggles that brand. */
  onSelectBrand: (brand: string | null) => void;
}

/** Horizontal brand filter chips — only rendered when >1 brand exists. */
export function ClosetBrandFilterRow({
  brands,
  activeBrand,
  onSelectBrand,
}: ClosetBrandFilterRowProps) {
  const t = useClosetThemedStyles();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={closetStyles.brandChipScroll}
      contentContainerStyle={closetStyles.brandChipContent}
    >
      <AnimatedPressable
        style={[
          closetStyles.brandChip,
          t.brandChip,
          !activeBrand && closetStyles.brandChipActive,
          !activeBrand && t.brandChipActive,
        ]}
        onPress={() => onSelectBrand(null)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ selected: !activeBrand }}
        accessibilityLabel="All brands"
      >
        <Text
          style={[
            closetStyles.brandChipText,
            t.brandChipText,
            !activeBrand && closetStyles.brandChipTextActive,
            !activeBrand && t.brandChipTextActive,
          ]}
        >
          All
        </Text>
      </AnimatedPressable>
      {brands.map((brand) => (
        <AnimatedPressable
          key={brand}
          style={[
            closetStyles.brandChip,
            t.brandChip,
            activeBrand === brand && closetStyles.brandChipActive,
            activeBrand === brand && t.brandChipActive,
          ]}
          onPress={() => onSelectBrand(brand)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityState={{ selected: activeBrand === brand }}
          accessibilityLabel={`Filter by brand ${brand}`}
        >
          <Text
            style={[
              closetStyles.brandChipText,
              t.brandChipText,
              activeBrand === brand && closetStyles.brandChipTextActive,
              activeBrand === brand && t.brandChipTextActive,
            ]}
          >
            {brand}
          </Text>
        </AnimatedPressable>
      ))}
    </ScrollView>
  );
}
