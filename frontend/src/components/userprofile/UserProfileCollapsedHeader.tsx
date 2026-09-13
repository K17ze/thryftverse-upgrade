import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, FontFamily, Elevation, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import type { PublicProfileViewer } from '../../services/profileApi';
import { COVER_HEIGHT, COLLAPSED_BAR_HEIGHT } from '../../hooks/userprofile';

function getCollapsedInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

interface UserProfileCollapsedHeaderProps {
  scrollY: SharedValue<number>;
  collapsedShared: SharedValue<boolean>;
  reducedMotion: boolean;
  collapsedVisible: boolean;
  displayAvatar?: string;
  displayName: string;
  viewer: PublicProfileViewer | null;
  followPending: boolean;
  isBlocked: boolean;
  onFollowToggle: () => void;
  onBack: () => void;
  onShare: () => void;
}

/**
 * Collapsed header — total height = insets.top + COLLAPSED_BAR_HEIGHT,
 * paddingTop = insets.top, inner row = COLLAPSED_BAR_HEIGHT. Fades in as the
 * cover scrolls away; carries a compact follow/share action pair.
 */
export function UserProfileCollapsedHeader({
  scrollY,
  collapsedShared,
  reducedMotion,
  collapsedVisible,
  displayAvatar,
  displayName,
  viewer,
  followPending,
  isBlocked,
  onFollowToggle,
  onBack,
  onShare,
}: UserProfileCollapsedHeaderProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const BG = colors.background;
  const BORDER = colors.border;
  const MUTED = colors.textMuted;
  const TEXT = colors.textPrimary;
  const SURFACE_ALT = colors.surfaceAlt;
  const BRAND = colors.brand;
  const TEXT_INVERSE = colors.textInverse;

  const collapsedHeaderStyle = useAnimatedStyle(() => {
    if (reducedMotion) return { opacity: collapsedShared.value ? 1 : 0 };
    const opacity = interpolate(scrollY.value, [COVER_HEIGHT - 80, COVER_HEIGHT - 20], [0, 1], Extrapolation.CLAMP);
    return { opacity };
  });

  const collapsedHeaderShadowStyle = useAnimatedStyle(() => {
    const shadowOpacity = interpolate(scrollY.value, [COVER_HEIGHT - 80, COVER_HEIGHT - 20], [0, 0.06], Extrapolation.CLAMP);
    return { shadowOpacity };
  });

  return (
    <Reanimated.View
      style={[styles.collapsedHeader, { backgroundColor: BG, borderBottomColor: BORDER, height: insets.top + COLLAPSED_BAR_HEIGHT, paddingTop: insets.top }, collapsedHeaderStyle, collapsedHeaderShadowStyle]}
      pointerEvents={collapsedVisible ? 'auto' : 'none'}
    >
      <AnimatedPressable
        style={styles.collapsedBackBtn}
        activeOpacity={0.85}
        onPress={onBack}
        accessibilityLabel="Go back"
        accessibilityRole="button"
      >
        <Ionicons name="arrow-back" size={18} color={TEXT} />
      </AnimatedPressable>
      <View style={styles.collapsedCenter}>
        {displayAvatar ? (
          <CachedImage
            uri={displayAvatar}
            style={styles.collapsedAvatar}
            containerStyle={{ width: 28, height: 28, borderRadius: RadiusRoleValue.pillAvatar }}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.collapsedAvatar, styles.collapsedAvatarMonogram, { backgroundColor: SURFACE_ALT }]}>
            <Text style={[styles.collapsedAvatarInitials, { color: MUTED }]}>
              {getCollapsedInitials(displayName)}
            </Text>
          </View>
        )}
        <Text style={[styles.collapsedTitle, { color: TEXT }]} numberOfLines={1} ellipsizeMode="tail">
          {displayName}
        </Text>
      </View>
      <View style={styles.collapsedRight}>
        {viewer ? (
          <AnimatedPressable
            style={[styles.collapsedFollowBtn, viewer.isFollowing ? [styles.collapsedFollowingBtn, { borderColor: BORDER, backgroundColor: BG }] : [styles.collapsedFollowActiveBtn, { backgroundColor: BRAND }], (followPending || isBlocked) && styles.btnDisabled]}
            onPress={onFollowToggle}
            activeOpacity={0.85}
            disabled={followPending || isBlocked}
            accessibilityRole="button"
            accessibilityLabel={viewer.isFollowing ? 'Unfollow' : 'Follow'}
          >
            <Text style={[styles.collapsedFollowText, { color: TEXT }, viewer.isFollowing ? {} : [styles.collapsedFollowActiveText, { color: TEXT_INVERSE }]]}>
              {viewer.isFollowing ? 'Following' : 'Follow'}
            </Text>
          </AnimatedPressable>
        ) : null}
        <AnimatedPressable
          style={styles.collapsedIconBtn}
          onPress={onShare}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Share profile"
        >
          <Ionicons name="share-outline" size={16} color={TEXT} />
        </AnimatedPressable>
      </View>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  collapsedHeader: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Space.sm, height: COLLAPSED_BAR_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
    ...Elevation.card,
  },
  collapsedBackBtn: { width: Control.hit, height: Control.hit, borderRadius: RadiusRoleValue.pillAvatar, alignItems: 'center', justifyContent: 'center' },
  collapsedCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.xs },
  collapsedAvatar: { width: Space.lg + Space.xs, height: Space.lg + Space.xs, borderRadius: RadiusRoleValue.pillAvatar, alignItems: 'center', justifyContent: 'center' },
  collapsedAvatarMonogram: {},
  collapsedAvatarInitials: { fontSize: TypographyV2.meta.size, fontFamily: FontFamily.bold },
  collapsedTitle: { fontSize: TypographyV2.priceList.size, fontFamily: FontFamily.semibold, letterSpacing: TypographyV2.priceList.letterSpacing - 0.1, flexShrink: 1 },
  collapsedRight: { flexDirection: 'row', alignItems: 'center', gap: Space.xs + 2 },
  collapsedFollowBtn: { height: Control.hit, paddingHorizontal: Space.md + 2, borderRadius: RadiusRoleValue.sheetDialog, alignItems: 'center', justifyContent: 'center' },
  collapsedFollowingBtn: { borderWidth: StyleSheet.hairlineWidth },
  collapsedFollowActiveBtn: {},
  collapsedFollowText: { fontSize: TypographyV2.meta.size, fontFamily: FontFamily.semibold },
  collapsedFollowActiveText: {},
  collapsedIconBtn: { width: Control.hit, height: Control.hit, borderRadius: RadiusRoleValue.pillAvatar, alignItems: 'center', justifyContent: 'center' },
  btnDisabled: { opacity: 0.5 },
});
