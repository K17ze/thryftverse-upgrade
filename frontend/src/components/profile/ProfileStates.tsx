import React from 'react';
import { View, Text, StyleSheet, StatusBar, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActiveTheme, Colors } from '../../constants/colors';
import { Space } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';

const BG = Colors.background;
const MUTED = Colors.textMuted;
const TEXT = Colors.textPrimary;
const SURFACE_ALT = Colors.surfaceAlt;

const COVER_HEIGHT = 176;

interface BaseProps {
  coverHeight?: number;
}

/**
 * Error state — profile-level failure with retry. Retains Back access via top controls.
 */
export function ProfileErrorState({ onRetry, coverHeight = COVER_HEIGHT }: BaseProps & { onRetry: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.container}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={BG} />
      <View style={[styles.coverSkeleton, { height: coverHeight }]} />
      <Pressable
        style={styles.stateContainer}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry loading profile"
      >
        <Ionicons name="cloud-offline-outline" size={40} color={MUTED} />
        <Text style={styles.stateText}>Unable to load profile</Text>
        <Text style={styles.stateSubtext}>Tap to retry</Text>
      </Pressable>
    </View>
  );
}

/**
 * Unavailable state — profile doesn't exist or was deactivated.
 */
export function ProfileUnavailableState({ coverHeight = COVER_HEIGHT }: BaseProps) {
  return (
    <View style={styles.container}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={BG} />
      <View style={[styles.coverSkeleton, { height: coverHeight }]} />
      <View style={styles.stateContainer}>
        <Ionicons name="person-outline" size={40} color={MUTED} />
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
  return (
    <View style={styles.container}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={BG} />
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
            <Ionicons name="arrow-back" size={18} color="#fff" />
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
        <Ionicons name="eye-off-outline" size={40} color={MUTED} />
        <Text style={styles.stateText}>You've been blocked</Text>
        <Text style={styles.stateSubtext}>This user blocked you from viewing their profile.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  coverSkeleton: { backgroundColor: SURFACE_ALT },
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
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: Space.md,
  },
  stateText: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: TEXT },
  stateSubtext: { fontSize: 14, fontFamily: 'Inter_400Regular', color: MUTED, textAlign: 'center' },
});
