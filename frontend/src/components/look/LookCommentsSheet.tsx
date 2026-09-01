import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Modal,
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
import * as Clipboard from 'expo-clipboard';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { SkeletonLoader } from '../SkeletonLoader';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Stroke, Control, AvatarSize } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useHaptic } from '../../hooks/useHaptic';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useToast } from '../../context/ToastContext';
import { useStore } from '../../store/useStore';
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
  /** The look creator's user id — their comments get an "Author" chip. */
  lookCreatorId?: string;
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
type CommentSort = 'latest' | 'top';

const REPLIES_PREVIEW_COUNT = 2;
const ROOT_AVATAR = AvatarSize.sm; // 32
const REPLY_AVATAR = AvatarSize.inline; // 24
const REPLY_INDENT = Space.lg; // 24

// ── Flattening logic ─────────────────────────────────────────────────

function flattenComments(
  comments: LookCommentApiItem[],
  expandedRoots: Set<string>,
  sort: CommentSort,
): FlatItem[] {
  const roots = comments
    .filter((c) => !c.parentId)
    .sort((a, b) => {
      if (sort === 'top') {
        // Engagement-weighted: likes first, recency breaks ties (X "Most relevant")
        if (b.likeCount !== a.likeCount) return b.likeCount - a.likeCount;
      }
      return b.createdAt.localeCompare(a.createdAt); // newest first
    });

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
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const handlePress = useCallback(() => {
    if (!reducedMotion) {
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
    }
    onToggle();
  }, [liked, onToggle, scale, reducedMotion]);

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
  isLookAuthor: boolean;
  isAuthenticated: boolean;
  /** Client-side send state for optimistic rows (undefined = settled). */
  sendState?: 'pending' | 'failed';
  onLike: (comment: LookCommentApiItem) => void;
  onReply: (comment: LookCommentApiItem) => void;
  onLongPress: (comment: LookCommentApiItem) => void;
  onRetry: (commentId: string) => void;
}

const CommentRow = React.memo(function CommentRow({
  comment,
  depth,
  isOwner,
  isLookAuthor,
  isAuthenticated,
  sendState,
  onLike,
  onReply,
  onLongPress,
  onRetry,
}: CommentRowProps) {
  const { colors } = useAppTheme();
  const rowStyles = React.useMemo(() => createRowStyles(colors), [colors]);
  const isReply = depth === 1;
  const avatarSize = isReply ? REPLY_AVATAR : ROOT_AVATAR;
  const isPending = sendState === 'pending';
  const isFailed = sendState === 'failed';

  const handleReply = useCallback(() => {
    onReply(comment);
  }, [comment, onReply]);

  const handleLike = useCallback(() => {
    onLike(comment);
  }, [comment, onLike]);

  const handleLongPress = useCallback(() => {
    onLongPress(comment);
  }, [comment, onLongPress]);

  const handleRetry = useCallback(() => {
    onRetry(comment.id);
  }, [comment.id, onRetry]);

  // Tombstone: deleted parent kept for its live replies (X/Threads model).
  // A quiet placeholder — no avatar, no actions, no drama.
  if (comment.deleted) {
    return (
      <View style={[rowStyles.row, isReply && rowStyles.replyRow]}>
        {isReply && <View style={rowStyles.connector} />}
        <View style={rowStyles.tombstoneBody}>
          <Text style={rowStyles.tombstoneText}>Comment deleted</Text>
        </View>
      </View>
    );
  }

  return (
    <Pressable
      onLongPress={handleLongPress}
      delayLongPress={400}
      disabled={isPending || isFailed}
      accessibilityActions={[{ name: 'longpress', label: 'Show comment actions' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'longpress') handleLongPress();
      }}
      style={({ pressed }) => [
        rowStyles.row,
        isReply && rowStyles.replyRow,
        pressed && rowStyles.rowPressed,
      ]}
    >
      {isReply && <View style={rowStyles.connector} />}

      <View style={[rowStyles.avatarWrap, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}>
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

      <View style={[rowStyles.body, (isPending || isFailed) && rowStyles.bodyPending]}>
        <View style={rowStyles.authorRow}>
          <Text style={rowStyles.author} numberOfLines={1}>
            {comment.author.username ?? 'unknown'}
          </Text>
          {/* Fail-closed trust: badge only when a backend row evidences it */}
          {comment.author.verified && (
            <Ionicons
              name="checkmark-circle"
              size={13}
              color={colors.brand}
              accessibilityLabel="Verified"
            />
          )}
          {isLookAuthor && (
            <View style={rowStyles.authorChip}>
              <Text style={rowStyles.authorChipText}>Author</Text>
            </View>
          )}
        </View>
        <Text style={rowStyles.text}>{comment.body}</Text>

        {isFailed ? (
          <Pressable
            onPress={handleRetry}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel="Retry posting comment"
          >
            <Text style={rowStyles.retryAction}>Tap to retry</Text>
          </Pressable>
        ) : (
          <View style={rowStyles.metaRow}>
            <Text style={rowStyles.time}>{formatRelativeTime(comment.createdAt)}</Text>

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
                <Text style={rowStyles.replyAction}>Reply</Text>
              </Pressable>
            )}

            {isPending && <ActivityIndicator size="small" color={colors.textMuted} />}
          </View>
        )}
      </View>
    </Pressable>
  );
});

function createRowStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
      paddingVertical: Space.sm,
    },
    rowPressed: {
      backgroundColor: colors.rowPressed,
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
    bodyPending: {
      opacity: 0.55,
    },
    authorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    author: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary,
    },
    authorChip: {
      backgroundColor: colors.brandSubtle,
      borderRadius: Radius.sm,
      paddingHorizontal: Space.xs + 2,
      paddingVertical: 1,
    },
    authorChipText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.brand,
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
    retryAction: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.danger,
      marginTop: 2,
    },
    tombstoneBody: {
      flex: 1,
      paddingVertical: Space.xs,
    },
    tombstoneText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
    },
  });
}

// ── Main component ───────────────────────────────────────────────────

export function LookCommentsSheet({
  lookId,
  lookCreatorId,
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
  const scrollTargetIdRef = useRef<string | null>(null);
  const [comments, setComments] = useState<LookCommentApiItem[]>([]);
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [commentText, setCommentText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [replyTarget, setReplyTarget] = useState<LookCommentApiItem | null>(null);
  const [expandedRoots, setExpandedRoots] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<CommentSort>('latest');
  /** Client-side send state for optimistic rows, keyed by temp id. */
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [menuComment, setMenuComment] = useState<LookCommentApiItem | null>(null);
  const flatListRef = useRef<FlashListRef<FlatItem>>(null);
  const inputRef = useRef<TextInput>(null);
  const storeUser = useStore((s) => s.currentUser);

  const flatItems = useMemo(
    () => flattenComments(comments, expandedRoots, sort),
    [comments, expandedRoots, sort],
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
      setPendingIds(new Set());
      setFailedIds(new Set());
      setMenuComment(null);
    }
  }, [visible, loadComments]);

  // Scroll a freshly posted comment into view — placement is the receipt.
  useEffect(() => {
    const targetId = scrollTargetIdRef.current;
    if (!targetId || status !== 'loaded') return;
    scrollTargetIdRef.current = null;
    const index = flatItems.findIndex(
      (it) => it.type === 'comment' && it.comment.id === targetId,
    );
    if (index < 0) return;
    const id = setTimeout(() => {
      try {
        flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
      } catch {
        // Item not measurable yet — the list is short enough to see it anyway.
      }
    }, 120);
    return () => clearTimeout(id);
  }, [flatItems, status]);

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

  const postComment = useCallback(
    async (tempId: string, body: string, parentId?: string) => {
      try {
        const res = await createLookCommentOnApi(lookId, { id: tempId, body, parentId });
        setComments((prev) =>
          prev.map((c) => (c.id === tempId ? res.comment : c)),
        );
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(tempId);
          return next;
        });
        setFailedIds((prev) => {
          const next = new Set(prev);
          next.delete(tempId);
          return next;
        });
      } catch {
        // On-row failure marker (never toast-only): the row stays with a
        // "Tap to retry" affordance. Retry reuses the same client id, so a
        // replay after an unknown-outcome can never duplicate the comment.
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(tempId);
          return next;
        });
        setFailedIds((prev) => new Set(prev).add(tempId));
      } finally {
        setIsSending(false);
      }
    },
    [lookId],
  );

  const handleRetry = useCallback(
    (commentId: string) => {
      const comment = comments.find((c) => c.id === commentId);
      if (!comment) return;
      setFailedIds((prev) => {
        const next = new Set(prev);
        next.delete(commentId);
        return next;
      });
      setPendingIds((prev) => new Set(prev).add(commentId));
      setIsSending(true);
      void postComment(commentId, comment.body, comment.parentId ?? undefined);
    },
    [comments, postComment],
  );

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

    // Optimistic insert — real identity from the auth store, never fabricated
    const optimisticComment: LookCommentApiItem = {
      id: tempId,
      lookId,
      authorId: currentUserId ?? '',
      parentId: parentId ?? null,
      author: {
        id: currentUserId ?? '',
        username: storeUser?.username ?? null,
        avatar: storeUser?.avatar ?? null,
      },
      body,
      deleted: false,
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
    setPendingIds((prev) => new Set(prev).add(tempId));

    // Auto-expand the parent's replies if replying
    if (parentId) {
      setExpandedRoots((prev) => new Set(prev).add(parentId));
    }

    scrollTargetIdRef.current = tempId;
    setCommentText('');
    setReplyTarget(null);

    await postComment(tempId, body, parentId);
  }, [
    commentText,
    isSending,
    lookId,
    haptic,
    isAuthenticated,
    onSignInRequired,
    onCommentCountChange,
    replyTarget,
    currentUserId,
    storeUser,
    postComment,
  ]);

  // ── Delete handler (tombstone-aware optimistic) ────────────────────

  const handleDelete = useCallback(
    async (commentId: string) => {
      haptic.medium();
      const prev = comments;
      const prevCount = prev.length;
      const target = prev.find((c) => c.id === commentId);
      if (!target) return;

      if (target.replyCount > 0) {
        // Keep the row as a tombstone so its live replies keep their context.
        setComments(prev.map((c) => (c.id === commentId ? { ...c, deleted: true, body: '' } : c)));
      } else {
        setComments(prev.filter((c) => c.id !== commentId));
      }
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

  // ── Long-press context menu (Reply / Copy text / Delete) ───────────

  const openMenu = useCallback(
    (comment: LookCommentApiItem) => {
      haptic.light();
      setMenuComment(comment);
    },
    [haptic],
  );

  const closeMenu = useCallback(() => setMenuComment(null), []);

  const handleMenuReply = useCallback(() => {
    if (menuComment) handleReply(menuComment);
    setMenuComment(null);
  }, [menuComment, handleReply]);

  const handleMenuCopy = useCallback(async () => {
    if (menuComment?.body) {
      await Clipboard.setStringAsync(menuComment.body);
      show('Copied', 'success');
    }
    setMenuComment(null);
  }, [menuComment, show]);

  const handleMenuDelete = useCallback(() => {
    if (menuComment) void handleDelete(menuComment.id);
    setMenuComment(null);
  }, [menuComment, handleDelete]);

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
      const sendState = failedIds.has(item.comment.id)
        ? ('failed' as const)
        : pendingIds.has(item.comment.id)
          ? ('pending' as const)
          : undefined;
      return (
        <CommentRow
          comment={item.comment}
          depth={item.depth}
          isOwner={!!isOwner}
          isLookAuthor={!!lookCreatorId && item.comment.authorId === lookCreatorId}
          isAuthenticated={isAuthenticated}
          sendState={sendState}
          onLike={handleLike}
          onReply={handleReply}
          onLongPress={openMenu}
          onRetry={handleRetry}
        />
      );
    },
    [
      currentUserId,
      lookCreatorId,
      isAuthenticated,
      pendingIds,
      failedIds,
      handleLike,
      handleReply,
      openMenu,
      handleRetry,
      toggleExpandReplies,
      styles,
    ],
  );

  const keyExtractor = useCallback((item: FlatItem, index: number) => {
    if (item.type === 'comment') return item.comment.id;
    if (item.type === 'separator') return `sep_${index}`;
    return `${item.type}_${item.parentId}`;
  }, []);

  const listEmpty = useMemo(() => {
    if (status === 'loading') {
      // Skeleton mirrors the final row geometry (avatar circle + name + body
      // lines, one indented reply) — same wait, shorter feel.
      return (
        <View style={styles.skeletonWrap}>
          {[0, 1, 2].map((row) => (
            <View key={row} style={styles.skeletonRow}>
              <SkeletonLoader
                width={ROOT_AVATAR}
                height={ROOT_AVATAR}
                borderRadius={ROOT_AVATAR / 2}
              />
              <View style={styles.skeletonLines}>
                <SkeletonLoader width="42%" height={TypographyV2.bodyStrong.size} borderRadius={Radius.sm} />
                <SkeletonLoader width="88%" height={TypographyV2.body.size} borderRadius={Radius.sm} />
                <SkeletonLoader width="64%" height={TypographyV2.body.size} borderRadius={Radius.sm} />
              </View>
            </View>
          ))}
          <View style={[styles.skeletonRow, { marginLeft: REPLY_INDENT }]}>
            <SkeletonLoader
              width={REPLY_AVATAR}
              height={REPLY_AVATAR}
              borderRadius={REPLY_AVATAR / 2}
            />
            <View style={styles.skeletonLines}>
              <SkeletonLoader width="38%" height={TypographyV2.bodyStrong.size} borderRadius={Radius.sm} />
              <SkeletonLoader width="76%" height={TypographyV2.body.size} borderRadius={Radius.sm} />
            </View>
          </View>
        </View>
      );
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

        {/* Sort toggle — per-post, non-persisted (X/Threads pattern) */}
        {comments.length > 1 && (
          <View style={styles.sortRow}>
            <Pressable
              onPress={() => setSort('top')}
              accessibilityRole="button"
              accessibilityState={{ selected: sort === 'top' }}
              accessibilityLabel="Sort by top"
            >
              <Text style={[styles.sortText, sort === 'top' && styles.sortTextActive]}>Top</Text>
            </Pressable>
            <View style={styles.sortDivider} />
            <Pressable
              onPress={() => setSort('latest')}
              accessibilityRole="button"
              accessibilityState={{ selected: sort === 'latest' }}
              accessibilityLabel="Sort by latest"
            >
              <Text style={[styles.sortText, sort === 'latest' && styles.sortTextActive]}>Latest</Text>
            </Pressable>
          </View>
        )}

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

      {/* Long-press context menu — destructive actions live one level deep */}
      <Modal transparent visible={menuComment !== null} animationType="fade" onRequestClose={closeMenu}>
        <Pressable style={styles.menuBackdrop} onPress={closeMenu} accessibilityLabel="Close menu">
          <View style={styles.menuSheet}>
            <Text style={styles.menuTitle} numberOfLines={1}>
              {menuComment?.author.username ?? 'Comment'}
            </Text>
            <Pressable style={styles.menuItem} onPress={handleMenuReply} accessibilityRole="button">
              <Ionicons name="arrow-undo" size={20} color={colors.textPrimary} />
              <Text style={styles.menuItemText}>Reply</Text>
            </Pressable>
            {!!menuComment?.body && (
              <Pressable style={styles.menuItem} onPress={handleMenuCopy} accessibilityRole="button">
                <Ionicons name="copy-outline" size={20} color={colors.textPrimary} />
                <Text style={styles.menuItemText}>Copy text</Text>
              </Pressable>
            )}
            {menuComment && currentUserId === menuComment.authorId && isAuthenticated && (
              <Pressable style={styles.menuItem} onPress={handleMenuDelete} accessibilityRole="button">
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
                <Text style={[styles.menuItemText, { color: colors.danger }]}>Delete comment</Text>
              </Pressable>
            )}
            <Pressable style={styles.menuCancel} onPress={closeMenu} accessibilityRole="button">
              <Text style={styles.menuCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
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
    sortRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingBottom: Space.xs,
    },
    sortText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      paddingHorizontal: Space.xs,
      paddingVertical: Space.xs,
    },
    sortTextActive: {
      color: colors.textPrimary,
      fontFamily: TypographyV2.meta.fontFamily,
    },
    sortDivider: {
      width: StyleSheet.hairlineWidth,
      height: 12,
      backgroundColor: colors.border,
    },
    skeletonWrap: {
      gap: Space.md,
      paddingVertical: Space.sm,
    },
    skeletonRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
    },
    skeletonLines: {
      flex: 1,
      gap: Space.xs + 2,
    },
    menuBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    menuSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      paddingHorizontal: Space.md,
      paddingTop: Space.md,
      paddingBottom: Space.xl,
      gap: Space.xs,
    },
    menuTitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      marginBottom: Space.xs,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.smMd,
      minHeight: Control.hit,
      borderRadius: Radius.md,
      paddingHorizontal: Space.xs,
    },
    menuItemText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary,
    },
    menuCancel: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: Control.hit,
      marginTop: Space.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    menuCancelText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textSecondary,
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
