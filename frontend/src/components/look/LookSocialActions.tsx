import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useHaptic } from '../../hooks/useHaptic';
import { useToast } from '../../context/ToastContext';
import {
  likeLookOnApi,
  unlikeLookOnApi,
  saveLookOnApi,
  unsaveLookOnApi } from '../../services/looksApi';

import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';

export interface LookSocialActionsProps {
  lookId: string;
  initialLikeCount: number;
  commentCount: number;
  initialSaveCount: number;
  initialLikedByViewer: boolean;
  initialSavedByViewer: boolean;
  isAuthenticated: boolean;
  onCommentPress: () => void;
  onSharePress: () => void;
  onSignInRequired?: () => void;
  /** Fired after a successful like/unlike with the new state. */
  onLikeChange?: (liked: boolean) => void;
  /** Fired after a successful save/unsave with the new state. */
  onSaveChange?: (saved: boolean) => void;
}

export function LookSocialActions({
  lookId,
  initialLikeCount,
  commentCount,
  initialSaveCount,
  initialLikedByViewer,
  initialSavedByViewer,
  isAuthenticated,
  onCommentPress,
  onSharePress,
  onSignInRequired,
  onLikeChange,
  onSaveChange }: LookSocialActionsProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();
  const { show } = useToast();

  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [liked, setLiked] = useState(initialLikedByViewer);
  const [saveCount, setSaveCount] = useState(initialSaveCount);
  const [saved, setSaved] = useState(initialSavedByViewer);
  const [isLikeBusy, setIsLikeBusy] = useState(false);
  const [isSaveBusy, setIsSaveBusy] = useState(false);

  const handleLike = useCallback(async () => {
    if (isLikeBusy) return;
    if (!isAuthenticated) {
      haptic.light();
      onSignInRequired?.();
      return;
    }
    haptic.medium();
    const prevLiked = liked;
    const prevCount = likeCount;
    setLiked(!prevLiked);
    setLikeCount(prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1);
    setIsLikeBusy(true);
    try {
      if (prevLiked) {
        const res = await unlikeLookOnApi(lookId);
        setLikeCount(res.likeCount);
        setLiked(false);
      } else {
        const res = await likeLookOnApi(lookId);
        setLikeCount(res.likeCount);
        setLiked(true);
      }
      onLikeChange?.(!prevLiked);
    } catch {
      setLiked(prevLiked);
      setLikeCount(prevCount);
      show('Failed to update like', 'error');
    } finally {
      setIsLikeBusy(false);
    }
  }, [isLikeBusy, liked, likeCount, lookId, haptic, show, isAuthenticated, onSignInRequired, onLikeChange]);

  const handleSave = useCallback(async () => {
    if (isSaveBusy) return;
    if (!isAuthenticated) {
      haptic.light();
      onSignInRequired?.();
      return;
    }
    haptic.medium();
    const prevSaved = saved;
    const prevCount = saveCount;
    setSaved(!prevSaved);
    setSaveCount(prevSaved ? Math.max(0, prevCount - 1) : prevCount + 1);
    setIsSaveBusy(true);
    try {
      if (prevSaved) {
        const res = await unsaveLookOnApi(lookId);
        setSaveCount(res.saveCount);
        setSaved(false);
      } else {
        const res = await saveLookOnApi(lookId);
        setSaveCount(res.saveCount);
        setSaved(true);
      }
      onSaveChange?.(!prevSaved);
    } catch {
      setSaved(prevSaved);
      setSaveCount(prevCount);
      show('Failed to update save', 'error');
    } finally {
      setIsSaveBusy(false);
    }
  }, [isSaveBusy, saved, saveCount, lookId, haptic, show, isAuthenticated, onSignInRequired, onSaveChange]);

  const handleComment = useCallback(() => {
    haptic.light();
    if (!isAuthenticated) {
      onSignInRequired?.();
      return;
    }
    onCommentPress();
  }, [haptic, isAuthenticated, onCommentPress, onSignInRequired]);

  const handleShare = useCallback(() => {
    haptic.light();
    onSharePress();
  }, [haptic, onSharePress]);

  return (
    <View style={styles.container}>
      <AnimatedPressable
        style={styles.actionBtn}
        onPress={handleLike}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={liked ? 'Unlike' : 'Like'}
      >
        <AppIcon
          name="heart"
          size={IconSize.md}
          color={liked ? 'danger' : 'textPrimary'}
          focused={liked}
          accessible={false}
        />
        <Text style={styles.actionText}>{likeCount}</Text>
      </AnimatedPressable>

      <AnimatedPressable
        style={styles.actionBtn}
        onPress={handleComment}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={isAuthenticated ? 'View comments' : 'Sign in to comment'}
      >
        <AppIcon name="comment" size={IconSize.md} color="textPrimary" accessible={false} />
        <Text style={styles.actionText}>{commentCount}</Text>
      </AnimatedPressable>

      <AnimatedPressable
        style={styles.actionBtn}
        onPress={handleSave}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={saved ? 'Remove from saved' : 'Save'}
      >
        <AppIcon
          name="bookmark"
          size={IconSize.md}
          color={saved ? 'brand' : 'textPrimary'}
          focused={saved}
          accessible={false}
        />
        <Text style={styles.actionText}>{saveCount}</Text>
      </AnimatedPressable>

      <AnimatedPressable
        style={styles.actionBtn}
        onPress={handleShare}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Share"
      >
        <AppIcon name="share" size={IconSize.md} color="textPrimary" accessible={false} />
        <Text style={styles.actionText}>Share</Text>
      </AnimatedPressable>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  // Flat bar with hairline separator — per AGENTS.md: no card-on-card.
  // The social actions are a utility bar, not a contained surface.
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginHorizontal: Space.md,
    marginTop: Space.lg,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Space.xs },
  actionText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary } });
