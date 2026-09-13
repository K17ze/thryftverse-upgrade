import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Pressable,
  ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { haptics } from '../../utils/haptics';
import { ScreenHeader } from '../ui/ScreenHeader';
import {
  orderDetailScreenStyles as styles,
  createOrderDetailThemedStyles } from './orderDetailScreenStyles';

interface OrderDetailChromeProps {
  onBack: () => void;
  rightAction?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Shared screen scaffold for OrderDetailScreen: themed SafeAreaView,
 * StatusBar, and the compact "Order" navigation header. Used by the
 * loading / error / not-found states and the populated body alike so the
 * chrome is identical across every early return.
 * Relocated verbatim from OrderDetailScreen.
 */
export function OrderDetailChrome({
  onBack,
  rightAction,
  children }: OrderDetailChromeProps) {
  const { colors, isDark } = useAppTheme();
  const themed = useMemo(() => createOrderDetailThemedStyles(colors), [colors]);

  return (
    <SafeAreaView style={[styles.container, themed.container]} edges={['top']}>
      <StatusBar barStyle={!isDark ? 'dark-content' : 'light-content'} backgroundColor={colors.background} />
      <ScreenHeader
        title="Order"
        variant="large"
        onBack={onBack}
        style={{
          paddingTop: 0,
          paddingBottom: Space.sm,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border }}
        rightAction={rightAction}
      />
      {children}
    </SafeAreaView>
  );
}

interface OrderDetailHeaderActionsProps {
  isRefreshing: boolean;
  onRefresh: () => void;
  onMore: () => void;
}

/**
 * Header right-side cluster: manual refresh (busy-aware) + overflow menu.
 * Relocated verbatim from OrderDetailScreen.
 */
export function OrderDetailHeaderActions({
  isRefreshing,
  onRefresh,
  onMore }: OrderDetailHeaderActionsProps) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.headerRight}>
      <Pressable
        style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
        onPress={onRefresh}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel="Refresh order"
        accessibilityState={{ busy: isRefreshing }}
      >
        {isRefreshing ? (
          <ActivityIndicator size="small" color={colors.textPrimary} />
        ) : (
          <Ionicons name="refresh-outline" size={22} color={colors.textPrimary} aria-hidden={true} />
        )}
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
        onPress={onMore}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel="More options"
      >
        <Ionicons name="ellipsis-horizontal" size={22} color={colors.textPrimary} aria-hidden={true} />
      </Pressable>
    </View>
  );
}

interface OrderDetailLoadErrorProps {
  onRetry: () => void;
}

/** Full-screen load-failure state (no cached order). Verbatim copy. */
export function OrderDetailLoadError({ onRetry }: OrderDetailLoadErrorProps) {
  const { colors } = useAppTheme();
  const themed = useMemo(() => createOrderDetailThemedStyles(colors), [colors]);

  return (
    <View style={styles.errorContainer}>
      <Ionicons name="cloud-offline-outline" size={28} color={colors.textMuted} aria-hidden={true} />
      <Text style={[styles.errorTitle, themed.errorTitle]}>Order could not be loaded</Text>
      <Text style={[styles.errorBody, themed.errorBody]}>Check your connection and try again.</Text>
      <Pressable
        style={({ pressed }) => [styles.retryBtn, themed.retryBtn, pressed && styles.retryBtnPressed]}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry loading order"
      >
        <Text style={[styles.retryBtnText, themed.retryBtnText]}>Retry</Text>
      </Pressable>
    </View>
  );
}

/** Full-screen not-found state (order loaded as null). Verbatim copy. */
export function OrderDetailNotFound() {
  const { colors } = useAppTheme();
  const themed = useMemo(() => createOrderDetailThemedStyles(colors), [colors]);

  return (
    <View style={styles.errorContainer}>
      <Ionicons name="document-outline" size={28} color={colors.textMuted} aria-hidden={true} />
      <Text style={[styles.errorTitle, themed.errorTitle]}>Order not found</Text>
    </View>
  );
}
