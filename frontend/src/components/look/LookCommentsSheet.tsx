import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
import Reanimated, {
  SlideInDown,
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Stroke, Control, AvatarSize } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useHaptic } from '../../hooks/useHaptic';
import { useToast } from '../../context/ToastContext';
import { KeyboardStickyView } from '../../platform/keyboard/KeyboardProvider';
import { FlagshipState } from '../flagship/FlagshipState';
import {
  fetchLookCommentsFromApi,
  createLookCommentOnApi,
  deleteLookCommentOnApi,
  likeLookCommentOnApi,
  unlikeLookCommentOnApi,
  type LookCommentApiItem,
} from '../../services/looksApi';
import { formatRelativeTime } from '../../utils/dateFormat';
import { makeStableId } from '../../utils/createStableId';

// ── Types ────────────────────────────────────────────────────────────

export interface LookCommentsSheetProps {
  lookId: string;
  currentUserId?: string;
  visible: boolean;
  onClose: () => void;
  onCommentCountChange?: (count: number) => void;
  isAuthenticated: boolean;
  onSignInRequired?: () => void;
}

type FlatItem =
  | { type: 'comment'; comment: LookCommentApiItem; depth: 0 | 1 }
  | { type: 'showReplies'; parentId: string; count: number }
  | { type: 'hideReplies'; parentId: string }
  | { type: 'separator' };

type LoadStatus = 'idle' | 'loading' | 'error' | 'loaded';

const REPLIES_PREVIEW_COUNT = 2;
const ROOT_AVATAR = AvatarSize.sm; // 32
const REPLY_AVATAR = AvatarSize.inline; // 24
const REPLY_INDENT = Space.lg; // 24

// ── Flattening logic ─────────────────────────────────────────────────

function flattenComments(
  comments: LookCommentApiItem[],
  expandedRoots: Set<string>,
): FlatItem[] {
  const roots = comments
    .filter((c) => !c.parentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)); // newest first

  const repliesByParent = new Map<string, LookCommentApiItem[]>();
  for (const c of comments) {
    if (c.parentId) {
      const arr = repliesByParent.get(c.parentId) ?? [];
      arr.push(c);
      repliesByParent.set(c.parentId, arr);
    }
  }
  for (const arr of repliesByParent.values()) {
    arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt)); // oldest first
  }

  const items: FlatItem[] = [];
  for (let i = 0; i < roots.length; i++) {
    const root = roots[i];
    items.push({ type: 'comment', comment: root, depth: 0 });

    const replies = repliesByParent.get(root.id) ?? [];
    if (replies.length > 0) {
      if (expandedRoots.has(root.id)) {
        for (const reply of replies) {
          items.push({ type: 'comment', comment: reply, depth: 1 });
        }
        items.push({ type: 'hideReplies', parentId: root.id });
      } else if (replies.length <= REPLIES_PREVIEW_COUNT) {
        for (const reply of replies) {
          items.push({ type: 'comment', comment: reply, depth: 1 });
        }
      } else {
        for (let j = 0; j < REPLIES_PREVIEW_COUNT; j++) {
          items.push({ type: 'comment', comment: replies[j], depth: 1 });
        }
        items.push({
          type: 'showReplies',
          parentId: root.id,
          count: replies.length - REPLIES_PREVIEW_COUNT,
        });
      }
    }

    if (i < roots.length - 1) {
      items.push({ type: 'separator' });
    }
  }

  return items;
}

// ── Comment like button (S1: visual state only, no haptic) ───────────

function CommentLikeButton({
  liked,
  likeCount,
  onToggle,
}: {
  liked: boolean;
  likeCount: number;
  onToggle: () => void;
}) {
  const { colors } = useAppTheme();
  const scale = useSharedValue(1);

  const handlePress = useCallback(() => {
    if (!liked) {
      scale.value = withSequence(
        withTiming(1.25, { duration: 140, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 120, easing: Easing.inOut(Easing.quad) }),
      );
    } else {
      scale.value = withSequence(
        withTiming(0.85, { duration: 80 }),
        withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) }),
      );
    }
    onToggle();
  }, [liked, onToggle, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      accessibilityRole="button"
      accessibilityLabel={liked ? `Unlike comment, ${likeCount} likes` : `Like comment, ${likeCount} likes`}
      accessibilityState={{ selected: liked }}
    >
      <View style={likeButtonStyles.row}>
        <Reanimated.View style={animStyle}>
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={16}
            color={liked ? colors.danger : colors.textMuted}
          />
        </Reanimated.View>
        {likeCount > 0 && (
          <Text
            style={[
              likeButtonStyles.count,
              { color: liked ? colors.danger : colors.textMuted },
            ]}
          >
            {likeCount}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const likeButtonStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    minHeight: 28,
    paddingHorizontal: 2,
  },
  count: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
  },
});

// ── Comment row ──────────────────────────────────────────────────────

interface CommentRowProps {
  comment: LookCommentApiItem;
  depth: 0 | 1;
  isOwner: boolean;
  isAuthenticated: boolean;
  onLike: (comment: LookCommentApiItem) => void;
  onReply: (comment: LookCommentApiItem) => void;
  onDelete: (commentId: string) => void;
}

const CommentRow = React.memo(function CommentRow({
  comment,
  depth,
  isOwner,
  isAuthenticated,
  onLike,
  onReply,
  onDelete,
}: CommentRowProps) {
  const { colors } = useAppTheme();
  const isReply = depth === 1;
  const avatarSize = isReply ? REPLY_AVATAR : ROOT_AVATAR;

  const handleReply = useCallback(() => {
    onReply(comment);
  }, [comment, onReply]);

  const handleLike = useCallback(() => {
    onLike(comment);
  }, [comment, onLike]);

  const handleDelete = useCallback(() => {
    onDelete(comment.id);
  }, [comment.id, onDelete]);

  return (
    <View style={[rowStyles(colors).row, isReply && rowStyles(colors).replyRow]}>
      {isReply && <View style={rowStyles(colors).connector} />}

      <View style={[rowStyles(colors).avatarWrap, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}>
        {comment.author.avatar ? (
          <CachedImage
            uri={comment.author.avatar}
            style={{ width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }}
            contentFit="cover"
          />
        ) : (
          <Ionicons name="person-circle" size={avatarSize} color={colors.textMuted} />
        )}
      </View>

      <View style={rowStyles(colors).body}>
        <Text style={rowStyles(colors).author} numberOfLines={1}>
          {comment.author.username ?? 'unknown'}
        </Text>
        <Text style={rowStyles(colors).text}>{comment.body}</Text>

        <View style={rowStyles(colors).metaRow}>
          <Text style={rowStyles(colors).time}>{formatRelativeTime(comment.createdAt)}</Text>

          <CommentLikeButton
            liked={comment.likedByViewer}
            likeCount={comment.likeCount}
            onToggle={handleLike}
          />

          {isAuthenticated && (
            <Pressable
              onPress={handleReply}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel="Reply to comment"
            >
              <Text style={rowStyles(colors).replyAction}>Reply</Text>
            </Pressable>
          )}

          {isOwner && isAuthenticated && (
            <Pressable
              onPress={handleDelete}
              hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel="Delete comment"
            >
              <Text style={rowStyles(colors).deleteAction}>Delete</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
});

function rowStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
      paddingVertical: Space.sm,
    },
    replyRow: {
      marginLeft: REPLY_INDENT,
      paddingVertical: Space.xs,
    },
    connector: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    avatarWrap: {
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
    },
    body: {
      flex: 1,
      gap: Space.xxs,
    },
    author: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary,
    },
    text: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textSecondary,
      lineHeight: TypographyV2.body.lineHeight,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginTop: 2,
      flexWrap: 'wrap',
    },
    time: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
    },
    replyAction: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
    },
    deleteAction: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.danger,
    },
  });
}

// ── Main component ───────────────────────────────────────────────────

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
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [commentText, setCommentText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [replyTarget, setReplyTarget] = useState<LookCommentApiItem | null>(null);
  const [expandedRoots, setExpandedRoots] = useState<Set<string>>(new Set());
  const flatListRef = useRef<FlashListRef<FlatItem>>(null);
  const inputRef = useRef<TextInput>(null);

  const flatItems = useMemo(
    () => flattenComments(comments, expandedRoots),
    [comments, expandedRoots],
  );

  const loadComments = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetchLookCommentsFromApi(lookId);
      setComments(res.items);
      onCommentCountChange?.(res.items.length);
      setStatus('loaded');
    } catch {
      setStatus('error');
    }
  }, [lookId, onCommentCountChange]);

  useEffect(() => {
    if (visible) {
      loadComments();
      setReplyTarget(null);
      setExpandedRoots(new Set());
    }
  }, [visible, loadComments]);

  // ── Like handler (optimistic, S1 — no haptic) ──────────────────────

  const handleLike = useCallback(
    (comment: LookCommentApiItem) => {
      if (!isAuthenticated) {
        onSignInRequired?.();
        return;
      }

      const wasLiked = comment.likedByViewer;
      const newLiked = !wasLiked;
      const newCount = Math.max(0, comment.likeCount + (newLiked ? 1 : -1));

      // Optimistic update
      setComments((prev) =>
        prev.map((c) =>
          c.id === comment.id
            ? { ...c, likedByViewer: newLiked, likeCount: newCount }
            : c,
        ),
      );

      // Fire request
      const apiCall = wasLiked
        ? unlikeLookCommentOnApi(lookId, comment.id)
        : likeLookCommentOnApi(lookId, comment.id);

      apiCall.catch(() => {
        // Rollback
        setComments((prev) =>
          prev.map((c) =>
            c.id === comment.id
              ? { ...c, likedByViewer: wasLiked, likeCount: comment.likeCount }
              : c,
          ),
        );
        show('Failed to update like', 'error');
      });
    },
    [isAuthenticated, onSignInRequired, lookId, show],
  );

  // ── Reply target management ────────────────────────────────────────

  const handleReply = useCallback(
    (comment: LookCommentApiItem) => {
      if (!isAuthenticated) {
        onSignInRequired?.();
        return;
      }
      setReplyTarget(comment);
      setTimeout(() => inputRef.current?.focus(), 100);
    },
    [isAuthenticated, onSignInRequired],
  );

  const cancelReply = useCallback(() => {
    setReplyTarget(null);
    inputRef.current?.blur();
  }, []);

  const toggleExpandReplies = useCallback((parentId: string) => {
    haptic.selection();
    setExpandedRoots((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  }, [haptic]);

  // ── Send handler (comment or reply) ────────────────────────────────

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
    const parentId = replyTarget?.parentId ?? replyTarget?.id ?? undefined;

    // Optimistic insert
    const optimisticComment: LookCommentApiItem = {
      id: tempId,
      lookId,
      authorId: currentUserId ?? '',
      parentId: parentId ?? null,
      author: { id: currentUserId ?? '', username: 'you', avatar: null },
      body,
      likeCount: 0,
      likedByViewer: false,
      replyCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setComments((prev) => {
      const next = [...prev, optimisticComment];
      onCommentCountChange?.(next.length);
      return next;
    });

    // Auto-expand the parent's replies if replying
    if (parentId) {
      setExpandedRoots((prev) => new Set(prev).add(parentId));
    }

    setCommentText('');
    setReplyTarget(null);

    try {
      const res = await createLookCommentOnApi(lookId, { id: tempId, body, parentId });
      setComments((prev) =>
        prev.map((c) => (c.id === tempId ? res.comment : c)),
      );
    } catch {
      // Remove optimistic comment
      setComments((prev) => {
        const next = prev.filter((c) => c.id !== tempId);
        onCommentCountChange?.(next.length);
        return next;
      });
      show('Failed to post comment', 'error');
    } finally {
      setIsSending(false);
    }
  }, [
    commentText,
    isSending,
    lookId,
    haptic,
    show,
    isAuthenticated,
    onSignInRequired,
    onCommentCountChange,
    replyTarget,
    currentUserId,
  ]);

  // ── Delete handler (optimistic with rollback) ──────────────────────

  const handleDelete = useCallback(
    async (commentId: string) => {
      haptic.medium();
      const prev = comments;
      const prevCount = prev.length;
      setComments(prev.filter((c) => c.id !== commentId));
      onCommentCountChange?.(Math.max(0, prevCount - 1));
      try {
        await deleteLookCommentOnApi(lookId, commentId);
      } catch {
        setComments(prev);
        onCommentCountChange?.(prevCount);
        show('Failed to delete comment', 'error');
      }
    },
    [comments, lookId, haptic, show, onCommentCountChange],
  );

  // ── Render ─────────────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item }: { item: FlatItem }) => {
      if (item.type === 'separator') {
        return <View style={styles.separator} />;
      }

      if (item.type === 'showReplies') {
        return (
          <Pressable
            style={styles.showRepliesRow}
            onPress={() => toggleExpandReplies(item.parentId)}
            accessibilityRole="button"
            accessibilityLabel={`Show ${item.count} more replies`}
          >
            <View style={styles.showRepliesLine} />
            <Text style={styles.showRepliesText}>
              View {item.count} more {item.count === 1 ? 'reply' : 'replies'}
            </Text>
          </Pressable>
        );
      }

      if (item.type === 'hideReplies') {
        return (
          <Pressable
            style={styles.showRepliesRow}
            onPress={() => toggleExpandReplies(item.parentId)}
            accessibilityRole="button"
            accessibilityLabel="Hide replies"
          >
            <View style={styles.showRepliesLine} />
            <Text style={styles.showRepliesText}>Hide replies</Text>
          </Pressable>
        );
      }

      const isOwner = currentUserId && item.comment.authorId === currentUserId;
      return (
        <CommentRow
          comment={item.comment}
          depth={item.depth}
          isOwner={!!isOwner}
          isAuthenticated={isAuthenticated}
          onLike={handleLike}
          onReply={handleReply}
          onDelete={handleDelete}
        />
      );
    },
    [currentUserId, isAuthenticated, handleLike, handleReply, handleDelete, toggleExpandReplies, styles],
  );

  const keyExtractor = useCallback((item: FlatItem, index: number) => {
    if (item.type === 'comment') return item.comment.id;
    if (item.type === 'separator') return `sep_${index}`;
    return `${item.type}_${item.parentId}`;
  }, []);

  const listEmpty = useMemo(() => {
    if (status === 'loading') {
      return <FlagshipState variant="loading" style={{ marginTop: 40 }} />;
    }
    if (status === 'error') {
      return (
        <FlagshipState
          variant="error"
          title="Couldn't load comments"
          actionLabel="Retry"
          onAction={loadComments}
          style={{ marginTop: 40 }}
        />
      );
    }
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>No comments yet</Text>
        <Text style={styles.emptySubtext}>Start the conversation</Text>
      </View>
    );
  }, [status, loadComments, styles]);

  if (!visible) return null;

  const canSend = commentText.trim().length > 0 && !isSending;
  const placeholder = replyTarget
    ? `Reply to ${replyTarget.author.username ?? 'unknown'}…`
    : 'Add a comment…';

  return (
    <Reanimated.View
      entering={SlideInDown.duration(280)}
      style={StyleSheet.absoluteFill}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Comments</Text>
          <AnimatedPressable
            style={styles.closeBtn}
            onPress={onClose}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="Close comments"
          >
            <Ionicons name="close" size={22} color={colors.textPrimary} />
          </AnimatedPressable>
        </View>

        {/* Comment list */}
        <FlashList<FlatItem>
          ref={flatListRef}
          data={flatItems}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={listEmpty}
          keyboardShouldPersistTaps="handled"
        />

        {/* Reply context bar */}
        {replyTarget && (
          <View style={styles.replyContextBar}>
            <Text style={styles.replyContextText} numberOfLines={1}>
              Replying to {replyTarget.author.username ?? 'unknown'}
            </Text>
            <Pressable
              onPress={cancelReply}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Cancel reply"
            >
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        )}

        {/* Composer */}
        {isAuthenticated ? (
          <KeyboardStickyView style={styles.inputBar}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={commentText}
              onChangeText={setCommentText}
              placeholder={placeholder}
              placeholderTextColor={colors.textMuted}
              maxLength={1000}
              accessibilityLabel={replyTarget ? 'Reply input' : 'Comment input'}
              multiline
            />
            <AnimatedPressable
              style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
              onPress={handleSend}
              activeOpacity={0.7}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel={replyTarget ? 'Send reply' : 'Send comment'}
            >
              {isSending ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Ionicons name="arrow-up" size={18} color={colors.textInverse} />
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

// ── Styles ───────────────────────────────────────────────────────────

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: TypographyV2.itemTitle.size,
      fontFamily: TypographyV2.itemTitle.fontFamily,
      color: colors.textPrimary,
    },
    closeBtn: {
      width: Control.hit,
      height: Control.hit,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    listContent: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderSubtle,
      marginVertical: Space.xs,
    },
    showRepliesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginLeft: REPLY_INDENT,
      paddingVertical: Space.xs,
      paddingLeft: Space.sm,
    },
    showRepliesLine: {
      width: 20,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    showRepliesText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
    },
    emptyWrap: {
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: 48,
    },
    emptyText: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textSecondary,
    },
    emptySubtext: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textMuted,
    },
    replyContextBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
      backgroundColor: colors.surfaceAlt,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    replyContextText: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary,
    },
    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    input: {
      flex: 1,
      minHeight: 36,
      maxHeight: 100,
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.lg,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary,
    },
    sendBtn: {
      width: 36,
      height: 36,
      borderRadius: Radius.full,
      backgroundColor: colors.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnDisabled: {
      opacity: 0.35,
    },
    signInBar: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
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
      borderRadius: Radius.full,
      borderWidth: Stroke.standard,
      borderColor: colors.brand,
      backgroundColor: colors.brandSubtle,
    },
    signInBtnText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.brand,
    },
  });
