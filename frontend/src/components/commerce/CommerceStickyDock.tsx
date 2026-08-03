import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Elevation, DockConstants } from '../../theme/designTokens';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { SlideInDown } from 'react-native-reanimated';

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
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const safeBottom = bottomInset ?? insets.bottom;

  const content = (
    <View
      style={[
        styles.container,
        showTopBorder && styles.topBorder,
        { paddingBottom: Math.max(safeBottom + Space.sm, Space.md) },
        style,
      ]}
    >
      {children}
    </View>
  );

  if (animated && !reducedMotion) {
    return (
      <Reanimated.View
        entering={SlideInDown.duration(280)}
        style={styles.wrapper}
      >
        {content}
      </Reanimated.View>
    );
  }

  return <View style={styles.wrapper}>{content}</View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
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
    minHeight: DockConstants.baseHeight,
    backgroundColor: colors.background,
    paddingHorizontal: Space.md,
    paddingTop: DockConstants.dockTopPadding,
    ...Elevation.floating,
  },
  topBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
