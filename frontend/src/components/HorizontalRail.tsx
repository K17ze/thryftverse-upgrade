import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

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
 * Uses the gesture-handler ScrollView so that Pressable/Touchable children
 * don't steal horizontal drag gestures on Android. Drop-in replacement for
 * <ScrollView horizontal> when the rail is inside a vertical ScrollView and
 * the app is wrapped in GestureHandlerRootView.
 */
export const HorizontalRail = React.forwardRef<ScrollView, HorizontalRailProps>(
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
      <ScrollView
        ref={ref}
        horizontal
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
      </ScrollView>
    );
  },
);
