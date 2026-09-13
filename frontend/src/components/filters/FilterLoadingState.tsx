import React from 'react';
import { View } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { SkeletonLoader } from '../SkeletonLoader';
import { Radius, Space } from '../../theme/designTokens';
import { createFilterStyles } from './filterStyles';

// Skeleton placeholder shown while catalog options are still syncing.
function FilterLoadingStateBase() {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createFilterStyles(colors), [colors]);

  return (
    <View style={styles.loadingStateWrap}>
      <View style={styles.loadingSection}>
        <SkeletonLoader width="32%" height={Space.md - 2} borderRadius={Radius.md - 1} style={{ marginBottom: Space.sm + Space.xs }} />
        <View style={styles.loadingChipRow}>
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonLoader key={`filter_sort_loading_${index}`} width={Space.xxl + Space.xxl + Space.lg} height={Space.xl + Space.sm + 2} borderRadius={Radius.xl + 1} />
          ))}
        </View>
      </View>

      <View style={styles.loadingSection}>
        <SkeletonLoader width="24%" height={Space.md - 2} borderRadius={Radius.md - 1} style={{ marginBottom: Space.sm + Space.xs }} />
        <View style={styles.loadingChipWrap}>
          {Array.from({ length: 8 }).map((_, index) => (
            <SkeletonLoader key={`filter_brand_loading_${index}`} width={Space.xxl + Space.xxl + Space.sm} height={Space.xl + Space.sm + 2} borderRadius={Radius.xl + 1} />
          ))}
        </View>
      </View>
    </View>
  );
}

const FilterLoadingState = React.memo(FilterLoadingStateBase);
FilterLoadingState.displayName = 'FilterLoadingState';
export { FilterLoadingState };
