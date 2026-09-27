import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppSearchBar } from '../ui/AppSearchBar';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { PressScale } from '../../theme/designTokens';
import { createUnifiedDiscoveryStyles } from './unifiedDiscoveryStyles';

// ============================================================================
// SEARCH HEADER — one quiet row: back glyph + a single-line search field.
// No filled container and no separate chrome row (Depop/Instagram grammar):
// the field's only boundary is a 1pt baseline that darkens on focus, the
// camera lives at the field's trailing edge, and FlagshipScreen's own scroll
// hairline separates the header once the feed moves.
// ============================================================================

interface Props {
  query: string;
  onQueryChange: (query: string) => void;
  onSearchFocusChange: (focused: boolean) => void;
  onSubmitSearch: () => void;
  onBack: () => void;
  onVisualSearch: () => void;
}

export function DiscoverySearchHeader({
  query,
  onQueryChange,
  onSearchFocusChange,
  onSubmitSearch,
  onBack,
  onVisualSearch }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createUnifiedDiscoveryStyles(colors), [colors]);
  const [isFocused, setIsFocused] = useState(false);

  const handleFocusChange = (focused: boolean) => {
    setIsFocused(focused);
    onSearchFocusChange(focused);
  };

  return (
    <View style={styles.headerRow}>
      <AnimatedPressable
        style={styles.headerBtn}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        accessibilityHint="Returns to the previous screen"
        scaleValue={PressScale.icon}
        hapticFeedback="light"
        activeOpacity={0.62}
      >
        <AppIcon concept="back" size={IconSize.lg} color="textPrimary" accessible={false} />
      </AnimatedPressable>
      <View style={[styles.searchFieldWrap, isFocused && styles.searchFieldWrapFocused]}>
        <AppSearchBar
          placeholder="Search items, people, brands…"
          value={query}
          onChangeText={onQueryChange}
          onClear={() => { onQueryChange(''); onSearchFocusChange(false); }}
          onCameraPress={onVisualSearch}
          containerStyle={styles.searchField}
          inputProps={{
            autoCapitalize: 'none',
            autoCorrect: false,
            returnKeyType: 'search',
            onFocus: () => handleFocusChange(true),
            onBlur: () => handleFocusChange(false),
            onSubmitEditing: onSubmitSearch }}
        />
      </View>
    </View>
  );
}
