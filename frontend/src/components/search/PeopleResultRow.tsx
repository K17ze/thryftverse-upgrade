import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { type ThemeColors } from '../../theme/ThemeContext';
import { FontFamily, Space, Control, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { useHaptic } from '../../hooks/useHaptic';
import { followUser, unfollowUser, type UserSearchResult } from '../../services/profileApi';

/**
 * Compact people result row with follow button.
 * Manages follow state locally since UserSearchResult doesn't carry
 * isFollowing — the button starts as "Follow" and toggles optimistically.
 */
export const PeopleResultRow = React.memo(function PeopleResultRow({
  user,
  onPress,
  colors,
}: {
  user: UserSearchResult;
  onPress: () => void;
  colors: ThemeColors;
}) {
  const [isFollowing, setIsFollowing] = React.useState(Boolean(user.isFollowing));
  const [isToggling, setIsToggling] = React.useState(false);
  const haptic = useHaptic();

  React.useEffect(() => {
    setIsFollowing(Boolean(user.isFollowing));
  }, [user.isFollowing]);

  const handleFollow = React.useCallback(async () => {
    if (isToggling) return;
    setIsToggling(true);
    const nextState = !isFollowing;
    setIsFollowing(nextState); // optimistic
    haptic.light();
    try {
      if (nextState) {
        await followUser(user.id);
      } else {
        await unfollowUser(user.id);
      }
    } catch {
      setIsFollowing(!nextState); // revert on error
    } finally {
      setIsToggling(false);
    }
  }, [isFollowing, isToggling, user.id, haptic]);

  return (
    <View style={peopleRowStyles.row}>
      <AnimatedPressable
        style={peopleRowStyles.main}
        onPress={onPress}
        accessibilityLabel={`View profile: ${user.displayName || user.username}`}
        accessibilityRole="button"
      >
        {user.avatar ? (
          <CachedImage
            uri={user.avatar}
            style={peopleRowStyles.avatar}
            contentFit="cover"
            downscaleWidth={96}
          />
        ) : (
          <View style={[peopleRowStyles.avatarFallback, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="person" size={18} color={colors.textMuted} aria-hidden={true} />
          </View>
        )}
        <View style={peopleRowStyles.info}>
          <Text style={[peopleRowStyles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {user.displayName || `@${user.username}`}
          </Text>
          {user.displayName && (
            <Text style={[peopleRowStyles.username, { color: colors.textMuted }]} numberOfLines={1}>
              @{user.username}
            </Text>
          )}
        </View>
      </AnimatedPressable>
      <AnimatedPressable
        style={[
          peopleRowStyles.followBtn,
          { backgroundColor: isFollowing ? colors.surfaceAlt : colors.textPrimary },
        ]}
        onPress={handleFollow}
        disabled={isToggling}
        accessibilityLabel={isFollowing ? `Unfollow ${user.username}` : `Follow ${user.username}`}
        accessibilityRole="button"
        accessibilityState={{ selected: isFollowing }}
      >
        <Text style={[
          peopleRowStyles.followText,
          { color: isFollowing ? colors.textSecondary : colors.textInverse },
        ]}>
          {isFollowing ? 'Following' : 'Follow'}
        </Text>
      </AnimatedPressable>
    </View>
  );
});

export const peopleRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
  },
  username: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
  },
  followBtn: {
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.lg,
    minHeight: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
  },
});
