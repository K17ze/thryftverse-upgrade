import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated from 'react-native-reanimated';
import { Colors } from '../../constants/colors';
import { Space, Elevation } from '../../theme/designTokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { FadeIn } from 'react-native-reanimated';

export interface CommerceStickyDockProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  bottomInset?: number;
  showTopBorder?: boolean;
  animated?: boolean;
}

export function CommerceStickyDock({
  children,
  style,
  bottomInset,
  showTopBorder = true,
  animated = true,
}: CommerceStickyDockProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const safeBottom = bottomInset ?? insets.bottom;

  const content = (
    <View
      style={[
        styles.container,
        showTopBorder && styles.topBorder,
        { paddingBottom: Math.max(safeBottom, Space.sm) + Space.xs },
        style,
      ]}
    >
      {children}
    </View>
  );

  if (animated && !reducedMotion) {
    return (
      <Reanimated.View entering={FadeIn.duration(200)} style={styles.wrapper}>
        {content}
      </Reanimated.View>
    );
  }

  return <View style={styles.wrapper}>{content}</View>;
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  container: {
    backgroundColor: Colors.background,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    ...Elevation.floating,
  },
  topBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
});
