import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Elevation } from '../../theme/designTokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import Reanimated, { FadeIn } from 'react-native-reanimated';

export interface CoOwnStickyActionDockProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  animated?: boolean;
}

export function CoOwnStickyActionDock({
  children,
  style,
  animated = true,
}: CoOwnStickyActionDockProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  const content = (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom + Space.sm, Space.md),
        },
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
    width: '100%',
    minWidth: 0,
    minHeight: 72,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    ...Elevation.floating,
  },
});