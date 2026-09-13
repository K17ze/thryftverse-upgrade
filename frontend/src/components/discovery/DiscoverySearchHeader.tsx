import React, { useMemo } from 'react';
import { View } from 'react-native';

import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppSearchBar } from '../ui/AppSearchBar';
import { FlagshipHeader } from '../flagship';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { createUnifiedDiscoveryStyles } from './unifiedDiscoveryStyles';

// ============================================================================
// SEARCH HEADER — back button + search bar + camera, all in the header so the
// search bar sits right below the status bar with no extra content padding
// pushing it down.
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

  return (
    <View style={styles.headerWrap}>
      <FlagshipHeader
        title=""
        onBack={onBack}
        rightAction={
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <AnimatedPressable
              style={styles.headerBtn}
              onPress={onVisualSearch}
              accessibilityLabel="Visual search"
              accessibilityRole="button"
            >
              <AppIcon name="camera-outline" size={IconSize.md} color="textPrimary" accessible={false} />
            </AnimatedPressable>
          </View>
        }
      />
      <View style={styles.headerSearchWrap}>
        <AppSearchBar
          placeholder="Search items, people, brands…"
          value={query}
          onChangeText={onQueryChange}
          onClear={() => { onQueryChange(''); onSearchFocusChange(false); }}
          containerStyle={styles.searchBar}
          inputProps={{
            autoCapitalize: 'none',
            autoCorrect: false,
            returnKeyType: 'search',
            onFocus: () => onSearchFocusChange(true),
            onBlur: () => onSearchFocusChange(false),
            onSubmitEditing: onSubmitSearch }}
        />
      </View>
    </View>
  );
}
