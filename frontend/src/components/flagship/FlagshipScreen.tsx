import React from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';

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
}

export function FlagshipScreen({
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
}: FlagshipScreenProps) {
  const { colors, isDark } = useAppTheme();
  const scrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
      if (onScroll) {
        onScroll(event.contentOffset.y);
      }
    },
  });

  const headerBorderStyle = useAnimatedStyle(() => ({
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
  }));

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
          <View style={{ height: footerInsetHeight ?? (stickyFooter ? Space.xxl : Space.xl) }} />
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {keyboardAvoiding && Platform.OS === 'ios' ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          {innerContent}
        </KeyboardAvoidingView>
      ) : (
        innerContent
      )}
    </SafeAreaView>
  );
}

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