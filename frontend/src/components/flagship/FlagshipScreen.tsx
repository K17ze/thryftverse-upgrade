import React from 'react';
import {
  View,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { KeyboardStickyView } from '../../platform/keyboard/KeyboardProvider';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export interface FlagshipScreenProps {
  children: React.ReactNode;
  header?: React.ReactNode;
  stickyFooter?: React.ReactNode;
  scrollEnabled?: boolean;
  keyboardAvoiding?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  onScroll?: (y: number) => void;
  scrollRef?: React.RefObject<any>;
  /** Extra bottom padding for scroll content when a sticky footer is present.
   *  Use this when the child screen owns its own ScrollView (scrollEnabled={false})
   *  and needs to ensure the last form field clears the footer. */
  footerInsetHeight?: number;
  /** When true, the scroll content also respects the bottom safe-area inset
   *  (useful for full-bleed scroll surfaces without a sticky footer). */
  respectBottomInset?: boolean;
}

export const FlagshipScreen = React.forwardRef<View, FlagshipScreenProps>(function FlagshipScreen({
  children,
  header,
  stickyFooter,
  scrollEnabled = true,
  keyboardAvoiding = false,
  style,
  contentStyle,
  onScroll,
  scrollRef,
  footerInsetHeight,
  respectBottomInset = false,
}, ref) {
  const { colors, isDark } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);

  // Stable JS callback reference for the worklet → JS bridge.
  // NOTE: The ref is mutated on the JS thread on every render, but it must
  // NEVER be read directly inside a Reanimated worklet. Reanimated freezes
  // objects captured by a worklet closure; mutating `.current` afterwards
  // triggers a synchronous `Log.w` on the Android UI thread
  // (`NativeProxy.synchronouslyUpdateUIProps`), which blocks input dispatch
  // and causes ANRs (input dispatch timeout 5s+).
  // The worklet below calls a stable `runOnJS` wrapper instead, so the ref
  // is only ever resolved on the JS thread and is never part of the worklet
  // closure.
  const jsOnScrollRef = React.useRef(onScroll);
  jsOnScrollRef.current = onScroll;

  const handleScrollY = React.useCallback((y: number) => {
    jsOnScrollRef.current?.(y);
  }, []);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
      // Marshal the JS callback off the UI thread. The ref is resolved on
      // the JS thread inside `handleScrollY`, never inside the worklet.
      runOnJS(handleScrollY)(event.contentOffset.y);
    },
  });

  const headerBorderStyle = useAnimatedStyle(() => {
    if (reducedMotion) {
      return { borderBottomWidth: 0, borderBottomColor: colors.border, shadowOpacity: 0 };
    }
    return {
      borderBottomWidth: interpolate(
        scrollY.value,
        [0, 10],
        [0, StyleSheet.hairlineWidth],
        Extrapolation.CLAMP
      ),
      borderBottomColor: colors.border,
      shadowOpacity: interpolate(
        scrollY.value,
        [0, 20],
        [0, 0.04],
        Extrapolation.CLAMP
      ),
    };
  });

  // Bottom inset for scroll content. When a sticky footer is present it owns
  // its own bottom safe-area padding (FlagshipStickyFooter), so we only add
  // the system inset when explicitly requested for full-bleed scroll surfaces.
  const bottomInset = respectBottomInset ? insets.bottom : 0;
  const trailingSpace = footerInsetHeight ?? (stickyFooter ? Space.xxl : Space.xl);

  const innerContent = (
    <View style={[styles.container, { backgroundColor: colors.background }, style]}>
      {header && (
        <Reanimated.View style={[styles.headerWrap, headerBorderStyle]}>
          {header}
        </Reanimated.View>
      )}
      {scrollEnabled ? (
        <Reanimated.ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, contentStyle]}
          keyboardShouldPersistTaps="handled"
          onScroll={scrollHandler}
          scrollEventThrottle={16}
        >
          {children}
          <View style={{ height: trailingSpace + bottomInset }} />
        </Reanimated.ScrollView>
      ) : (
        <View style={[styles.content, contentStyle]}>{children}</View>
      )}
      {stickyFooter && (
        <View style={[styles.stickyFooter, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          {stickyFooter}
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView ref={ref} style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {keyboardAvoiding ? (
        <KeyboardStickyView style={{ flex: 1 }}>
          {innerContent}
        </KeyboardStickyView>
      ) : (
        innerContent
      )}
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerWrap: {
    zIndex: 10,
  },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  content: {
    flex: 1,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  stickyFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.md,
  },
});
