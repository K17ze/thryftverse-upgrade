import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { ExpandableCaption } from '../look/ExpandableCaption';
import type { LookApiItem } from '../../services/looksApi';

export interface LookDetailInfoSectionProps {
  look: LookApiItem;
  captionText: string;
  creatorHandle: string;
  followerCount: number | undefined;
  isOwner: boolean;
  isFollowing: boolean;
  followBusy: boolean;
  onCreatorPress: () => void;
  onFollow: () => void;
  /** Repost-attribution tap — opens the source creator's profile. */
  onSourceCreatorPress: (creatorId: string) => void;
}

/**
 * Info — expandable caption, repost attribution, creator row with follow.
 * Lives below the media so it never covers the creator's composition.
 * No "Look" eyebrow — the media is the label.
 */
function LookDetailInfoSectionImpl({
  look,
  captionText,
  creatorHandle,
  followerCount,
  isOwner,
  isFollowing,
  followBusy,
  onCreatorPress,
  onFollow,
  onSourceCreatorPress,
}: LookDetailInfoSectionProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.infoSection}>
      {captionText ? (
        <ExpandableCaption text={captionText} />
      ) : null}

      {/* Repost attribution — when this look is a repost, show a quiet
          "Reposted from @creator" line with a link to the source creator.
          No decorative chrome; the attribution is the signal. */}
      {look.sourceLookId && look.sourceLook && (
        <Pressable
          style={styles.repostAttribution}
          onPress={() => look.sourceLook && onSourceCreatorPress(look.sourceLook.creatorId)}
          accessibilityRole="link"
          accessibilityLabel={`Reposted from @${look.sourceLook.creatorUsername ?? 'creator'}`}
        >
          <Ionicons name="repeat-outline" size={14} color={colors.textMuted} aria-hidden={true} />
          <Text style={styles.repostAttributionText}>
            Reposted from @{look.sourceLook.creatorUsername ?? 'creator'}
          </Text>
        </Pressable>
      )}

      <Pressable
        style={styles.creatorRow}
        onPress={onCreatorPress}
        accessibilityRole="button"
        accessibilityLabel={`View ${creatorHandle}'s profile`}
      >
        <View style={styles.creatorAvatar}>
          {look.creator.avatar ? (
            <ExpoImage
              source={{ uri: look.creator.avatar }}
              style={styles.creatorAvatarImg}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={look.creator.avatar}
            />
          ) : (
            <Ionicons name="person-circle" size={28} color={colors.textMuted} aria-hidden={true} />
          )}
        </View>
        <View style={styles.creatorInfo}>
          <Text style={styles.creatorName}>@{creatorHandle}</Text>
          <Text style={styles.creatorMeta}>
            {look.tags.length} piece{look.tags.length === 1 ? '' : 's'} tagged
            {typeof followerCount === 'number' ? ` · ${followerCount} followers` : ''}
          </Text>
        </View>
        {!isOwner && (
          <AnimatedPressable
            style={[styles.followBtn, isFollowing && styles.followBtnActive]}
            onPress={onFollow}
            activeOpacity={0.85}
            disabled={followBusy}
            accessibilityRole="button"
            accessibilityLabel={isFollowing ? 'Unfollow creator' : 'Follow creator'}
            accessibilityState={{ selected: isFollowing }}
          >
            {followBusy ? (
              <ActivityIndicator size="small" color={isFollowing ? colors.textPrimary : colors.textInverse} />
            ) : (
              <Text style={[styles.followBtnText, isFollowing && styles.followBtnTextActive]}>
                {isFollowing ? 'Following' : 'Follow'}
              </Text>
            )}
          </AnimatedPressable>
        )}
      </Pressable>
    </View>
  );
}

export const LookDetailInfoSection = React.memo(LookDetailInfoSectionImpl);

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ── Info section ──
    infoSection: {
      paddingHorizontal: Space.md,
      paddingTop: Space.lg,
      gap: Space.sm },
    repostAttribution: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs },
    repostAttributionText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted },
    creatorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginTop: Space.xs / 2 },
    creatorAvatar: {
      width: Space.xl + Space.sm,
      height: Space.xl + Space.sm,
      borderRadius: Radius.xxl,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden' },
    creatorAvatarImg: { width: Space.xl + Space.sm, height: Space.xl + Space.sm, borderRadius: Radius.xxl },
    creatorInfo: { flex: 1, gap: Space.xs - 2 },
    creatorName: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary },
    creatorMeta: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted },
    followBtn: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm - 2,
      borderRadius: Radius.full,
      backgroundColor: colors.brand },
    followBtnActive: {
      backgroundColor: colors.surfaceAlt },
    followBtnText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textInverse },
    followBtnTextActive: {
      color: colors.textPrimary } });
}
