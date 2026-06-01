import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { Headline, Meta } from '../ui/Text';
import { CachedImage } from '../CachedImage';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

interface ChatHeaderProps {
  variant: 'dm' | 'group';
  onBack: () => void;
  title: string;
  subtitle?: string;
  avatarUrl?: string | null;
  rightAction?: React.ReactNode;
  onTitlePress?: () => void;
  isOnline?: boolean;
  style?: ViewStyle;
}

function OnlineRing() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.6);

  React.useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.6, { duration: 1200 }),
      -1,
      true
    );
    opacity.value = withRepeat(
      withTiming(0, { duration: 1200 }),
      -1,
      true
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={styles.onlineRingContainer}>
      <Reanimated.View style={[styles.onlineRingPulse, animStyle]} />
      <View style={styles.onlineRingDot} />
    </View>
  );
}

export function ChatHeader({
  variant,
  onBack,
  title,
  subtitle,
  avatarUrl,
  rightAction,
  onTitlePress,
  isOnline = false,
  style,
}: ChatHeaderProps) {
  const TitleWrap = onTitlePress ? AnimatedPressable : View;
  const titleWrapProps = onTitlePress
    ? {
        onPress: onTitlePress,
        accessibilityRole: 'button' as const,
        accessibilityLabel: `Open ${title} profile`,
        accessibilityHint: 'Opens profile and trust details',
        activeOpacity: 0.85,
        hapticFeedback: 'light' as const,
      }
    : {};

  return (
    <View style={[styles.wrapper, style]}>
      <BlurView
        intensity={ActiveTheme === 'light' ? 70 : 50}
        tint={ActiveTheme === 'light' ? 'light' : 'dark'}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.header}>
        <AnimatedPressable
          style={styles.backBtn}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Returns to the previous screen"
          activeOpacity={0.7}
          scaleValue={0.92}
          hapticFeedback="light"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </AnimatedPressable>

        <TitleWrap
          style={[styles.identityWrap, variant === 'dm' && styles.identityWrapDm]}
          {...titleWrapProps}
        >
          {variant === 'dm' && (
            <View style={styles.avatarWrap}>
              {avatarUrl ? (
                <CachedImage
                  uri={avatarUrl}
                  style={styles.avatar}
                  containerStyle={styles.avatar}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.avatarFallback}>
                  <Ionicons name="person" size={16} color={Colors.textMuted} />
                </View>
              )}
              {isOnline && <OnlineRing />}
            </View>
          )}

          <View style={styles.textWrap}>
            <Headline numberOfLines={1}>{title}</Headline>
            {subtitle ? (
              <Meta numberOfLines={1} color={Colors.textMuted}>
                {subtitle}
              </Meta>
            ) : null}
          </View>
        </TitleWrap>

        <View style={styles.rightSlot}>
          {rightAction || <View style={styles.spacer} />}
        </View>
      </View>
    </View>
  );
}

import { ActiveTheme } from '../../constants/colors';

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.glassBorder,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md - Space.xs,
    paddingVertical: Space.md - Space.xs,
    minHeight: 56,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.glassBg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: Colors.glassBorder,
  },
  identityWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Space.sm,
    minHeight: 44,
  },
  identityWrapDm: {
    gap: Space.sm,
  },
  textWrap: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    overflow: 'hidden',
    position: 'relative',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.glassBg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: Colors.glassBorder,
  },
  onlineRingContainer: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  onlineRingPulse: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: Radius.full,
    backgroundColor: Colors.success,
  },
  onlineRingDot: {
    width: 10,
    height: 10,
    borderRadius: Radius.full,
    backgroundColor: Colors.success,
    borderWidth: 2,
    borderColor: Colors.background,
  },
  rightSlot: {
    minWidth: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  spacer: {
    width: 44,
  },
});
