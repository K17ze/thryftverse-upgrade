import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { Colors, ActiveTheme } from '../../constants/colors';
import { Typography, Space, Radius } from '../../theme/designTokens';
import { PressPresets } from '../../hooks/usePremiumPressFeedback';
import { useHaptic } from '../../hooks/useHaptic';

const { width: SCREEN_W } = Dimensions.get('window');

interface StatItem {
  label: string;
  value: string | number;
}

interface ProfileVisualHeaderProps {
  coverUri?: string | null | undefined;
  avatarUri?: string | null | undefined;
  displayName?: string;
  username?: string;
  bio?: string | null;
  stats?: StatItem[];
  isSelf?: boolean;
  onEditCover?: () => void;
  onEditAvatar?: () => void;
  onEditProfile?: () => void;
  onShare?: () => void;
  onFollow?: () => void;
  following?: boolean;
  verified?: boolean;
  hideCover?: boolean;
}

export function ProfileVisualHeader({
  coverUri,
  avatarUri,
  displayName,
  username,
  bio,
  stats,
  isSelf = false,
  onEditCover,
  onEditAvatar,
  onEditProfile,
  onShare,
  onFollow,
  following = false,
  verified = false,
  hideCover = false,
}: ProfileVisualHeaderProps) {
  const haptic = useHaptic();
  return (
    <Reanimated.View entering={FadeInDown.duration(350).delay(30)} style={styles.root}>
      {/* Cover with gradient scrim */}
      {!hideCover && (
      <View style={styles.coverWrap}>
        <CachedImage
          uri={coverUri ?? ''}
          style={styles.coverImage}
          contentFit="cover"
          emptyLabel="Cover"
          emptyIcon="image-outline"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.55)']}
          style={StyleSheet.absoluteFill}
        />
        {isSelf && onEditCover && (
          <AnimatedPressable style={styles.editCoverBtn} onPress={onEditCover} activeOpacity={0.85}>
            <Ionicons name="camera-outline" size={14} color="#fff" />
            <Text style={styles.editCoverText}>Edit</Text>
          </AnimatedPressable>
        )}
      </View>
      )}

      {/* Identity block overlaps cover bottom */}
      <View style={[styles.identityBlock, hideCover && { marginTop: 0, paddingTop: Space.md }]}>
        {/* Avatar */}
        <View style={styles.avatarWrap}>
          <CachedImage
            uri={avatarUri ?? ''}
            style={styles.avatarImage}
            containerStyle={{ borderRadius: AVATAR_SIZE / 2 }}
            contentFit="cover"
            emptyLabel="Avatar"
            emptyIcon="person-outline"
          />
          {isSelf && onEditAvatar && (
            <AnimatedPressable style={styles.editAvatarBtn} onPress={onEditAvatar} activeOpacity={0.85}>
              <Ionicons name="camera" size={12} color="#fff" />
            </AnimatedPressable>
          )}
          {verified && (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.brand} />
            </View>
          )}
        </View>

        {/* Name + handle */}
        <View style={styles.nameBlock}>
          <Text style={styles.displayName} numberOfLines={1}>{displayName || username || 'User'}</Text>
          {username && <Text style={styles.handle}>@{username}</Text>}
          {bio ? <Text style={styles.bio} numberOfLines={2}>{bio}</Text> : null}
        </View>
      </View>

      {/* Stats rail */}
      {stats && stats.length > 0 && (
        <View style={styles.statsRail}>
          {stats.map((stat, i) => (
            <View key={i} style={styles.statCell}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Action dock */}
      <View style={styles.actionDock}>
        {isSelf ? (
          <>
            <AnimatedPressable style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={onEditProfile} {...PressPresets.primaryButton}>
              <Text style={styles.actionBtnPrimaryText}>Edit Profile</Text>
            </AnimatedPressable>
            <AnimatedPressable style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={() => { haptic.light(); onShare?.(); }} {...PressPresets.iconButton}>
              <Ionicons name="share-outline" size={16} color={Colors.textPrimary} />
            </AnimatedPressable>
          </>
        ) : (
          <>
            <AnimatedPressable
              style={[styles.actionBtn, following ? styles.actionBtnSecondary : styles.actionBtnPrimary]}
              onPress={() => { haptic.medium(); onFollow?.(); }}
              {...PressPresets.primaryButton}
            >
              <Text style={following ? styles.actionBtnSecondaryText : styles.actionBtnPrimaryText}>
                {following ? 'Following' : 'Follow'}
              </Text>
            </AnimatedPressable>
            <AnimatedPressable style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={() => { haptic.light(); onShare?.(); }} {...PressPresets.iconButton}>
              <Ionicons name="share-outline" size={16} color={Colors.textPrimary} />
            </AnimatedPressable>
          </>
        )}
      </View>
    </Reanimated.View>
  );
}

const AVATAR_SIZE = 88;
const COVER_H = 180;

const styles = StyleSheet.create({
  root: {
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: Radius.lg,
    borderBottomRightRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Space.md,
  },
  coverWrap: {
    width: '100%',
    height: COVER_H,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  editCoverBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
  },
  editCoverText: {
    fontFamily: Typography.family.medium,
    fontSize: 12,
    color: '#fff',
  },
  identityBlock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Space.md,
    marginTop: -AVATAR_SIZE / 2,
    gap: Space.sm,
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 4,
    borderColor: Colors.surface,
    backgroundColor: Colors.surfaceAlt,
    overflow: 'hidden',
    position: 'relative',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  editAvatarBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  verifiedBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: Colors.surface,
    borderRadius: 10,
  },
  nameBlock: {
    flex: 1,
    paddingBottom: Space.xs,
    paddingTop: AVATAR_SIZE / 2 + Space.xs,
  },
  displayName: {
    fontFamily: Typography.family.bold,
    fontSize: 20,
    color: Colors.textPrimary,
    letterSpacing: -0.4,
    lineHeight: 26,
  },
  handle: {
    fontFamily: Typography.family.medium,
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  bio: {
    fontFamily: Typography.family.regular,
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  statsRail: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Space.md,
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  statCell: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontFamily: Typography.family.bold,
    fontSize: 18,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontFamily: Typography.family.medium,
    fontSize: 11,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actionDock: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingBottom: Space.md,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: Radius.md,
  },
  actionBtnPrimary: {
    flex: 1,
    backgroundColor: Colors.textPrimary,
  },
  actionBtnPrimaryText: {
    fontFamily: Typography.family.semibold,
    fontSize: 14,
    color: Colors.background,
  },
  actionBtnSecondary: {
    width: 48,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionBtnSecondaryText: {
    fontFamily: Typography.family.semibold,
    fontSize: 14,
    color: Colors.textPrimary,
  },
});
