import React from 'react';
import { StyleProp, ViewStyle, ScrollView as RNScrollView } from 'react-native';

interface HorizontalRailProps {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  showsHorizontalScrollIndicator?: boolean;
  snapToInterval?: number;
  decelerationRate?: 'normal' | 'fast';
  onScroll?: (event: any) => void;
  scrollEventThrottle?: number;
  accessibilityLabel?: string;
}

/**
 * Horizontal scroll rail that works correctly inside GestureHandlerRootView.
 *
 * Uses nestedScrollEnabled so the horizontal ScrollView can scroll independently
 * of the parent vertical ScrollView on Android. The app is wrapped in
 * GestureHandlerRootView at the root, which provides the gesture context.
 */
export const HorizontalRail = React.forwardRef<RNScrollView, HorizontalRailProps>(
  function HorizontalRail(
    {
      children,
      contentContainerStyle,
      style,
      showsHorizontalScrollIndicator = false,
      snapToInterval,
      decelerationRate,
      onScroll,
      scrollEventThrottle,
      accessibilityLabel,
    },
    ref,
  ) {
    return (
      <RNScrollView
        ref={ref}
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={showsHorizontalScrollIndicator}
        contentContainerStyle={contentContainerStyle}
        style={style}
        snapToInterval={snapToInterval}
        decelerationRate={decelerationRate}
        onScroll={onScroll}
        scrollEventThrottle={scrollEventThrottle}
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </RNScrollView>
    );
  },
);
