import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { SlideInDown } from 'react-native-reanimated';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Radius, Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { AnimatedPressable } from '../../components/AnimatedPressable';
import { useUpdateCheck } from './useUpdateCheck';
import { Sentry } from '../monitoring/sentry';

/**
 * Non-intrusive banner that appears when an OTA update is available.
 *
 * Rendered once near the app root (inside the theme provider). When
 * expo-updates reports an available update, a slim banner slides in from
 * the bottom with an "Update" button. Tapping it fetches the new bundle
 * and reloads the app.
 *
 * Design principles:
 * - One-line message, one action — no verbose copy.
 * - Slides in from the bottom (above the tab bar / safe area).
 * - Respects reduced motion (no slide animation).
 * - Uses theme tokens for all colours and spacing.
 * - Gracefully renders nothing when no update is available or when
 *   expo-updates is not installed.
 *
 * @returns The banner element, or null when no update is available.
 */
export function UpdateManager(): React.ReactElement | null {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const { isUpdateAvailable, isFetching, fetchAndReload } = useUpdateCheck();

  const handleUpdate = useCallback(() => {
    Sentry.addBreadcrumb?.({
      category: 'ui.action',
      message: 'OTA update: user tapped update',
      level: 'info' });
    fetchAndReload();
  }, [fetchAndReload]);

  if (!isUpdateAvailable) return null;

  const styles = createStyles(colors);
  const entering = reducedMotion ? undefined : SlideInDown.duration(280).springify().damping(20);

  return (
    <Reanimated.View
      entering={entering}
      style={styles.container}
      accessibilityRole="alert"
      accessibilityLabel="A new version is available"
    >
      <View style={styles.content}>
        <Ionicons name="arrow-down-circle-outline" size={20} color={colors.brand} style={styles.icon} />
        <Text style={styles.message} numberOfLines={1}>
          A new version is available
        </Text>
      </View>

      {isFetching ? (
        <ActivityIndicator size="small" color={colors.brand} accessibilityLabel="Downloading update" />
      ) : (
        <AnimatedPressable
          style={styles.button}
          onPress={handleUpdate}
          accessibilityRole="button"
          accessibilityLabel="Update now"
          accessibilityHint="Downloads the latest version and restarts the app"
          activeOpacity={0.85}
          scaleValue={0.96}
          autoHaptic
        >
          <Text style={styles.buttonText}>Update</Text>
        </AnimatedPressable>
      )}
    </Reanimated.View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      backgroundColor: colors.surfaceElevated,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1 },
    icon: {
      marginRight: Space.sm },
    message: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary },
    button: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs + 2,
      backgroundColor: colors.brandSubtle,
      borderRadius: Radius.full },
    buttonText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.brand } });
}
