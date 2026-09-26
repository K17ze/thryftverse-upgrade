import React from 'react';
import { View } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { SkeletonLoader } from '../SkeletonLoader';
import { Radius, Space } from '../../theme/designTokens';
import { createFilterStyles } from './filterStyles';

// Skeleton placeholder shown while catalog options are still syncing.
// Row-shaped bars match the hairline option rows the content settles into.
function FilterLoadingStateBase() {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createFilterStyles(colors), [colors]);

  return (
    <View style={styles.loadingStateWrap}>
      <View style={styles.loadingSection}>
        <SkeletonLoader width="32%" height={Space.md - 2} borderRadius={Radius.md - 1} style={{ marginBottom: Space.sm + Space.xs }} />
        <View style={styles.loadingRowsWrap}>
          {[76, 62, 70, 56].map((width, index) => (
            <SkeletonLoader key={`filter_sort_loading_${index}`} width={`${width}%`} height={14} borderRadius={Radius.sm} />
          ))}
        </View>
      </View>

      <View style={styles.loadingSection}>
        <SkeletonLoader width="24%" height={Space.md - 2} borderRadius={Radius.md - 1} style={{ marginBottom: Space.sm + Space.xs }} />
        <View style={styles.loadingRowsWrap}>
          {[68, 58, 72, 64, 52].map((width, index) => (
            <SkeletonLoader key={`filter_brand_loading_${index}`} width={`${width}%`} height={14} borderRadius={Radius.sm} />
          ))}
        </View>
      </View>
    </View>
  );
}

const FilterLoadingState = React.memo(FilterLoadingStateBase);
FilterLoadingState.displayName = 'FilterLoadingState';
export { FilterLoadingState };
