import React from 'react';
import { View } from 'react-native';

import { SkeletonLoader } from '../SkeletonLoader';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { createConvertStyles } from './convertStyles';

// -- Loading skeleton --
// Content skeleton shown while the available 1ZE balance hydrates.
export function ConvertSkeleton() {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createConvertStyles(colors), [colors]);

  return (
    <View style={styles.skeletonContainer}>
      <SkeletonLoader
        width="60%"
        height={32}
        borderRadius={Radius.md}
        style={{ marginBottom: Space.lg }}
      />
      <SkeletonLoader
        width="100%"
        height={80}
        borderRadius={Radius.lg}
        style={{ marginBottom: Space.md }}
      />
      <SkeletonLoader
        width="100%"
        height={56}
        borderRadius={Radius.md}
        style={{ marginBottom: Space.sm }}
      />
      <SkeletonLoader width="100%" height={56} borderRadius={Radius.md} />
    </View>
  );
}
