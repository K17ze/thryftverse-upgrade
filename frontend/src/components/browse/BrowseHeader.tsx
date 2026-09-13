import React from 'react';
import { View, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { IconSize } from '../../theme/designTokens';
import { AppIcon } from '../common/AppIcon';
import { AppIconButton } from '../common/AppIconButton';
import type { BrowseStyles } from './browseStyles';
import type { GridDensity } from '../../hooks/browse/useBrowseGridDensity';

interface BrowseHeaderProps {
  styles: BrowseStyles;
  title: string;
  displayCount: number;
  backendLoading: boolean;
  gridDensity: GridDensity;
  onToggleGridDensity: (density: GridDensity) => void;
}

export function BrowseHeader({
  styles,
  title,
  displayCount,
  backendLoading,
  gridDensity,
  onToggleGridDensity }: BrowseHeaderProps) {
  const navigation = useNavigation<any>();

  return (
    <>
      {/* Heavy Typography Header */}
      <View style={styles.header}>
        <AppIconButton
          name="back"
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
        />
        <View style={styles.headerActions}>
          <AppIconButton
            name={gridDensity === 'comfortable' ? 'grid-outline' : 'grid'}
            onPress={() => onToggleGridDensity(gridDensity === 'comfortable' ? 'compact' : 'comfortable')}
            accessibilityLabel={gridDensity === 'comfortable' ? 'Switch to compact 3 column grid' : 'Switch to comfortable 2 column grid'}
            selected={true}
          />
          <AppIconButton
            name="search"
            onPress={() => navigation.navigate('UnifiedDiscovery')}
            accessibilityLabel="Search listings"
          />
        </View>
      </View>

      <View style={styles.titleContainer}>
        <Text style={styles.hugeTitle} accessibilityRole="header">{title}</Text>
        <View style={styles.itemCountPill} accessibilityLiveRegion="polite" accessibilityLabel={backendLoading ? 'Loading items' : `${displayCount} items`}>
          <AppIcon name="bag-handle-outline" size={IconSize.micro} color="textMuted" accessible={false} />
          <Text style={styles.itemCountText}>{backendLoading ? 'Loading…' : `${displayCount} items`}</Text>
        </View>
      </View>
    </>
  );
}
