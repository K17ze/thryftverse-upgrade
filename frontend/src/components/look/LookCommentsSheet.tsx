import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { SlideInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Typography, Type, Stroke, Control, AvatarSize } from '../../theme/designTokens';
import { useHaptic } from '../../hooks/useHaptic';
import { useToast } from '../../context/ToastContext';
import { KeyboardStickyView } from '../../platform/keyboard/KeyboardProvider';
import { FlagshipState } from '../flagship/FlagshipState';
import {
  fetchLookCommentsFromApi,
  createLookCommentOnApi,
  deleteLookCommentOnApi,
  type LookCommentApiItem,
} from '../../services/looksApi';
import { formatRelativeTime } from '../../utils/dateFormat';
import { makeStableId } from '../../utils/createStableId';

export interface LookCommentsSheetProps {
  lookId: string;
  currentUserId?: string;
  visible: boolean;
  onClose: () => void;
  onCommentCountChange?: (count: number) => void;
  isAuthenticated: boolean;
  onSignInRequired?: () => void;
}

export function LookCommentsSheet({
  lookId,
  currentUserId,
  visible,
  onClose,
  onCommentCountChange,
  isAuthenticated,
  onSignInRequired,
}: LookCommentsSheetProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();
  const { show } = useToast();
  const [comments, setComments] = useState<LookCommentApiItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const flatListRef = useRef<FlashListRef<LookCommentApiItem>>(null);

  const loadComments = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetchLookCommentsFromApi(lookId);
      setComments(res.items);
      onCommentCountChange?.(res.items.length);
    } catch {
      show('Failed to load comments', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [lookId, show, onCommentCountChange]);

  useEffect(() => {
    if (visible) {
      loadComments();
    }
  }, [visible, loadComments]);

  const handleSend = useCallback(async () => {
    if (!isAuthenticated) {
      onSignInRequired?.();
      return;
    }
    const body = commentText.trim();
    if (!body || isSending) return;
    haptic.light();
    setIsSending(true);
    const tempId = makeStableId('comment', 6);
    try {
      const res = await createLookCommentOnApi(lookId, { id: tempId, body });
      setComments((prev) => {
        const next = [...prev, res.comment];
        onCommentCountChange?.(next.length);
        return next;
      });
      setCommentText('');
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      show('Failed to post comment', 'error');
    } finally {
      setIsSending(false);
    }
  }, [commentText, isSending, lookId, haptic, show, isAuthenticated, onSignInRequired]);

  const handleDelete = useCallback(
    async (commentId: string) => {
      haptic.medium();
      const prev = comments;
      setComments(comments.filter((c) => c.id !== commentId));
      onCommentCountChange?.(Math.max(0, prev.length - 1));
      try {
        await deleteLookCommentOnApi(lookId, commentId);
        show('Comment deleted', 'info');
      } catch {
        setComments(prev);
        onCommentCountChange?.(prev.length);
        show('Failed to delete comment', 'error');
      }
    },
    [comments, lookId, haptic, show, onCommentCountChange]
  );

  const renderItem = ({ item, index }: { item: LookCommentApiItem; index: number }) => {
    const isOwner = currentUserId && item.authorId === currentUserId;
    return (
      <View
        key={item.id}
        style={styles.commentRow}
      >
        <View style={styles.avatarWrap}>
          {item.author.avatar ? (
            <CachedImage
              uri={item.author.avatar}
              style={styles.avatar}
              contentFit="cover"
            />
          ) : (
            <Ionicons name="person-circle" size={32} color={colors.textMuted} />
          )}
        </View>
        <View style={styles.commentBody}>
          <Text style={styles.commentAuthor}>
            @{item.author.username ?? 'unknown'}
          </Text>
          <Text style={styles.commentText}>{item.body}</Text>
          <Text style={styles.commentTime}>{formatRelativeTime(item.createdAt)}</Text>
        </View>
        {isOwner && isAuthenticated && (
          <Pressable
            onPress={() => handleDelete(item.id)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Delete comment"
          >
            <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
    );
  };

  if (!visible) return null;

  return (
    <Reanimated.View
      entering={SlideInDown.duration(300)}
      style={StyleSheet.absoluteFill}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Comments</Text>
          <AnimatedPressable
            style={styles.closeBtn}
            onPress={onClose}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Close comments"
          >
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </AnimatedPressable>
        </View>

        <FlashList
          ref={flatListRef}
          data={comments}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            isLoading ? (
              <FlagshipState variant="loading" style={{ marginTop: 40 }} />
            ) : (
              <View style={styles.emptyWrap}>
                <Ionicons name="chatbubble-outline" size={32} color={colors.textMuted} />
                <Text style={styles.emptyText}>No comments yet</Text>
                <Text style={styles.emptySubtext}>Be the first to comment</Text>
              </View>
            )
          }
          onContentSizeChange={() => {
            if (comments.length > 0) {
              flatListRef.current?.scrollToEnd({ animated: false });
            }
          }}
        />

        {isAuthenticated ? (
          <KeyboardStickyView
            style={styles.inputBar}
          >
            <TextInput
              style={styles.input}
              value={commentText}
              onChangeText={setCommentText}
              placeholder="Add a comment..."
              placeholderTextColor={colors.textMuted}
              maxLength={1000}
              accessibilityLabel="Comment input"
              multiline
            />
            <AnimatedPressable
              style={[styles.sendBtn, !commentText.trim() && styles.sendBtnDisabled]}
              onPress={handleSend}
              activeOpacity={0.85}
              disabled={!commentText.trim() || isSending}
              accessibilityRole="button"
              accessibilityLabel="Send comment"
            >
              {isSending ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Ionicons name="send" size={18} color={colors.textInverse} />
              )}
            </AnimatedPressable>
          </KeyboardStickyView>
        ) : (
          <View style={styles.signInBar}>
            <Pressable
              style={styles.signInBtn}
              onPress={() => onSignInRequired?.()}
              accessibilityRole="button"
              accessibilityLabel="Sign in to comment"
            >
              <Ionicons name="log-in-outline" size={18} color={colors.brand} />
              <Text style={styles.signInBtnText}>Sign in to comment</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </Reanimated.View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: Type.itemTitle.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingVertical: Space.sm,
  },
  avatarWrap: {
    width: AvatarSize.sm,
    height: AvatarSize.sm,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  avatar: {
    width: AvatarSize.sm,
    height: AvatarSize.sm,
    borderRadius: Radius.xl,
  },
  commentBody: {
    flex: 1,
    gap: Space.xxs,
  },
  commentAuthor: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  commentText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
    lineHeight: Type.body.lineHeight,
  },
  commentTime: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    marginTop: Space.xxs,
  },
  emptyWrap: {
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textSecondary,
  },
  emptySubtext: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    fontSize: Type.bodyStrong.size,
    fontFamily: Typography.family.medium,
    color: colors.textPrimary,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.xxl,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  signInBar: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  signInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    height: Control.hit,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.xxl,
    borderWidth: Stroke.standard,
    borderColor: colors.brand,
    backgroundColor: colors.brandSubtle,
  },
  signInBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.brand,
  },
});
