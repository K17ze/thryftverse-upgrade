import React from 'react';
import {
  View,
  Text,
  StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography, Space, Radius, Stroke} from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { PressPresets } from '../../hooks/usePremiumPressFeedback';
import { useHaptic } from '../../hooks/useHaptic';

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
  userLocation?: string | null;
  memberSince?: string | null;
  stats?: StatItem[];
  isSelf?: boolean;
  onEditCover?: () => void;
  onEditAvatar?: () => void;
  onEditProfile?: () => void;
  onShare?: () => void;
  onFollow?: () => void;
  onMessage?: () => void;
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
  userLocation,
  memberSince,
  stats,
  isSelf = false,
  onEditCover,
  onEditAvatar,
  onEditProfile,
  onShare,
  onFollow,
  onMessage,
  following = false,
  verified = false,
  hideCover = false }: ProfileVisualHeaderProps) {
  const haptic = useHaptic();
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.root}>
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
          colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.6)']}
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
              <Ionicons name="checkmark-circle" size={18} color={colors.brand} />
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

      {/* Context row */}
      <View style={styles.contextRow}>
        {userLocation ? (
          <View style={styles.contextPill}>
            <Ionicons name="location-outline" size={12} color={colors.textMuted} />
            <Text style={styles.contextPillText}>{userLocation}</Text>
          </View>
        ) : null}
        {memberSince ? (
          <View style={styles.contextPill}>
            <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
            <Text style={styles.contextPillText}>{memberSince}</Text>
          </View>
        ) : null}
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
              <Ionicons name="share-outline" size={16} color={colors.textPrimary} />
            </AnimatedPressable>
          </>
        ) : (
          <>
            <AnimatedPressable
              style={[styles.actionBtn, styles.actionBtnPrimary]}
              onPress={() => { haptic.medium(); onMessage?.(); }}
              {...PressPresets.primaryButton}
            >
              <Text style={styles.actionBtnPrimaryText}>Message</Text>
            </AnimatedPressable>
            <AnimatedPressable style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={() => { haptic.light(); onShare?.(); }} {...PressPresets.iconButton}>
              <Ionicons name="share-outline" size={16} color={colors.textPrimary} />
            </AnimatedPressable>
            <AnimatedPressable style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={() => { haptic.light(); /* more actions */ }} {...PressPresets.iconButton}>
              <Ionicons name="ellipsis-horizontal" size={16} color={colors.textPrimary} />
            </AnimatedPressable>
          </>
        )}
      </View>
    </View>
  );
}

const AVATAR_SIZE = 96;
const COVER_H = 180;

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  root: {
    backgroundColor: colors.surface,
    overflow: 'hidden',
    marginBottom: Space.md },
  coverWrap: {
    width: '100%',
    height: COVER_H,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt },
  coverImage: {
    width: '100%',
    height: '100%' },
  editCoverBtn: {
    position: 'absolute',
    bottom: Space.md,
    right: Space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.md },
  editCoverText: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size,
    color: '#fff' },
  identityBlock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Space.md,
    marginTop: -AVATAR_SIZE / 2,
    gap: Space.sm },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 4,
    borderColor: colors.surface,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    position: 'relative' },
  avatarImage: {
    width: '100%',
    height: '100%' },
  editAvatarBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: Radius.xl,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface },
  verifiedBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: colors.surface,
    borderRadius: Radius.lg },
  nameBlock: {
    flex: 1,
    paddingBottom: Space.xs,
    paddingTop: AVATAR_SIZE / 2 + Space.xs },
  displayName: {
    fontFamily: Typography.family.bold,
    fontSize: TypographyV2.priceList.size,
    color: colors.textPrimary,
    letterSpacing: -0.4,
    lineHeight: TypographyV2.priceList.lineHeight },
  handle: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.body.size,
    color: colors.textSecondary,
    marginTop: Space.xs / 2 },
  bio: {
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    color: colors.textSecondary,
    marginTop: Space.xs,
    lineHeight: TypographyV2.meta.lineHeight },
  statsRail: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Space.md,
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border },
  statCell: {
    alignItems: 'center',
    gap: Space.xs / 2 },
  statValue: {
    fontFamily: Typography.family.bold,
    fontSize: TypographyV2.body.size,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.body.letterSpacing },
  statLabel: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size,
    color: colors.textMuted,
    letterSpacing: 0.5 },
  actionDock: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingBottom: Space.md },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: Radius.md },
  actionBtnPrimary: {
    flex: 1,
    backgroundColor: colors.textPrimary },
  actionBtnPrimaryText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.body.size,
    color: colors.background },
  actionBtnSecondary: {
    width: 48,
    backgroundColor: colors.surfaceAlt,
    borderWidth: Stroke.standard,
    borderColor: colors.border },
  actionBtnSecondaryText: {
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.body.size,
    color: colors.textPrimary },
  contextRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm },
  contextPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.md },
  contextPillText: {
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size,
    color: colors.textMuted } });
