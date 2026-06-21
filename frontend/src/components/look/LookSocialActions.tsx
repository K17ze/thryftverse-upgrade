import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';
import { useHaptic } from '../../hooks/useHaptic';
import { useToast } from '../../context/ToastContext';
import {
  likeLookOnApi,
  unlikeLookOnApi,
  saveLookOnApi,
  unsaveLookOnApi,
} from '../../services/looksApi';

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
}: LookSocialActionsProps) {
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
    } catch {
      setLiked(prevLiked);
      setLikeCount(prevCount);
      show('Failed to update like', 'error');
    } finally {
      setIsLikeBusy(false);
    }
  }, [isLikeBusy, liked, likeCount, lookId, haptic, show, isAuthenticated, onSignInRequired]);

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
        show('Removed from saved', 'info');
      } else {
        const res = await saveLookOnApi(lookId);
        setSaveCount(res.saveCount);
        setSaved(true);
        show('Saved to closet', 'success');
      }
    } catch {
      setSaved(prevSaved);
      setSaveCount(prevCount);
      show('Failed to update save', 'error');
    } finally {
      setIsSaveBusy(false);
    }
  }, [isSaveBusy, saved, saveCount, lookId, haptic, show, isAuthenticated, onSignInRequired]);

  const handleComment = useCallback(() => {
    haptic.light();
    onCommentPress();
  }, [haptic, onCommentPress]);

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
        <Ionicons
          name={liked ? 'heart' : 'heart-outline'}
          size={22}
          color={liked ? Colors.danger : Colors.textPrimary}
        />
        <Text style={styles.actionText}>{likeCount}</Text>
      </AnimatedPressable>

      <AnimatedPressable
        style={styles.actionBtn}
        onPress={handleComment}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="View comments"
      >
        <Ionicons name="chatbubble-outline" size={22} color={Colors.textPrimary} />
        <Text style={styles.actionText}>{commentCount}</Text>
      </AnimatedPressable>

      <AnimatedPressable
        style={styles.actionBtn}
        onPress={handleSave}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={saved ? 'Remove from saved' : 'Save'}
      >
        <Ionicons
          name={saved ? 'bookmark' : 'bookmark-outline'}
          size={22}
          color={saved ? Colors.brand : Colors.textPrimary}
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
        <Ionicons name="share-outline" size={22} color={Colors.textPrimary} />
        <Text style={styles.actionText}>Share</Text>
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginHorizontal: Space.md,
    marginTop: Space.md,
    padding: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.md,
  },
  actionText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
});
