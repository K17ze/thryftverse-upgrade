import React from 'react';
import { View, Text, StyleSheet, StatusBar, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Typography, Radius, Type } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';

const COVER_HEIGHT = 168;

interface BaseProps {
  coverHeight?: number;
}

/**
 * Error state — profile-level failure with retry.
 * Includes explicit Back control with correct safe-area placement.
 */
export function ProfileErrorState({ onRetry, onBack, coverHeight = COVER_HEIGHT }: BaseProps & { onRetry: () => void; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <View style={[styles.coverSkeleton, { height: coverHeight }]} />
      <View pointerEvents="box-none" style={styles.coverActionLayer}>
        <View style={[styles.topUtilityRow, { top: Math.max(insets.top + 6, 14) }]}>
          <AnimatedPressable
            style={styles.topUtilityIconBtn}
            activeOpacity={0.9}
            onPress={onBack}
            accessibilityLabel="Go back"
            accessibilityRole="button"
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Ionicons name="chevron-back" size={18} color="#fff" />
          </AnimatedPressable>
        </View>
      </View>
      <Pressable
        style={({ pressed }) => [styles.stateContainer, pressed && { opacity: 0.6 }]}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry loading profile"
      >
        <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
        <Text style={styles.stateText}>Unable to load profile</Text>
        <Text style={styles.stateSubtext}>Tap to retry</Text>
      </Pressable>
    </View>
  );
}

/**
 * Unavailable state — profile doesn't exist or was deactivated.
 * Includes explicit Back control.
 */
export function ProfileUnavailableState({ onBack, coverHeight = COVER_HEIGHT }: BaseProps & { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <View style={[styles.coverSkeleton, { height: coverHeight }]} />
      <View pointerEvents="box-none" style={styles.coverActionLayer}>
        <View style={[styles.topUtilityRow, { top: Math.max(insets.top + 6, 14) }]}>
          <AnimatedPressable
            style={styles.topUtilityIconBtn}
            activeOpacity={0.9}
            onPress={onBack}
            accessibilityLabel="Go back"
            accessibilityRole="button"
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Ionicons name="chevron-back" size={18} color="#fff" />
          </AnimatedPressable>
        </View>
      </View>
      <View style={styles.stateContainer}>
        <Ionicons name="person-outline" size={40} color={colors.textMuted} />
        <Text style={styles.stateText}>Profile unavailable</Text>
        <Text style={styles.stateSubtext}>This account may no longer be active.</Text>
      </View>
    </View>
  );
}

/**
 * Blocked-by-target state — viewer was blocked by this profile owner.
 * Retains Back and Share access via top controls.
 */
export function ProfileBlockedState({
  onBack,
  onShare,
  coverHeight = COVER_HEIGHT,
}: BaseProps & { onBack: () => void; onShare: () => void }) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <View pointerEvents="box-none" style={styles.coverActionLayer}>
        <View style={[styles.topUtilityRow, { top: Math.max(insets.top + 6, 14) }]}>
          <AnimatedPressable
            style={styles.topUtilityIconBtn}
            activeOpacity={0.9}
            onPress={onBack}
            accessibilityLabel="Go back"
            accessibilityRole="button"
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Ionicons name="chevron-back" size={18} color="#fff" />
          </AnimatedPressable>
          <View style={{ flex: 1 }} />
          <AnimatedPressable
            style={styles.topUtilityIconBtn}
            activeOpacity={0.9}
            onPress={onShare}
            accessibilityLabel="Share profile"
            accessibilityRole="button"
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Ionicons name="share-outline" size={18} color="#fff" />
          </AnimatedPressable>
        </View>
      </View>
      <View style={[styles.coverSkeleton, { height: coverHeight }]} />
      <View style={styles.stateContainer}>
        <Ionicons name="eye-off-outline" size={40} color={colors.textMuted} />
        <Text style={styles.stateText}>You've been blocked</Text>
        <Text style={styles.stateSubtext}>This user blocked you from viewing their profile.</Text>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  coverSkeleton: { backgroundColor: colors.surfaceAlt },
  coverActionLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: COVER_HEIGHT,
    zIndex: 8,
  },
  topUtilityRow: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topUtilityIconBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm + 2,
    paddingHorizontal: Space.md,
  },
  stateText: { fontSize: Type.bodyLarge.size, fontFamily: Typography.family.semibold, color: colors.textPrimary },
  stateSubtext: { fontSize: Type.body.size, fontFamily: Typography.family.regular, color: colors.textMuted, textAlign: 'center' },
});
