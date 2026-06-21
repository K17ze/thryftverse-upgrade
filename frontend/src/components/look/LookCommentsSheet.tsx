import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown, SlideInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';
import { useHaptic } from '../../hooks/useHaptic';
import { useToast } from '../../context/ToastContext';
import {
  fetchLookCommentsFromApi,
  createLookCommentOnApi,
  deleteLookCommentOnApi,
  type LookCommentApiItem,
} from '../../services/looksApi';

export interface LookCommentsSheetProps {
  lookId: string;
  currentUserId?: string;
  visible: boolean;
  onClose: () => void;
}

export function LookCommentsSheet({
  lookId,
  currentUserId,
  visible,
  onClose,
}: LookCommentsSheetProps) {
  const haptic = useHaptic();
  const { show } = useToast();
  const [comments, setComments] = useState<LookCommentApiItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const flatListRef = useRef<FlatList<LookCommentApiItem>>(null);

  const loadComments = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetchLookCommentsFromApi(lookId);
      setComments(res.items);
    } catch {
      show('Failed to load comments', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [lookId, show]);

  useEffect(() => {
    if (visible) {
      loadComments();
    }
  }, [visible, loadComments]);

  const handleSend = useCallback(async () => {
    const body = commentText.trim();
    if (!body || isSending) return;
    haptic.light();
    setIsSending(true);
    const tempId = `comment_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    try {
      const res = await createLookCommentOnApi(lookId, { id: tempId, body });
      setComments((prev) => [...prev, res.comment]);
      setCommentText('');
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      show('Failed to post comment', 'error');
    } finally {
      setIsSending(false);
    }
  }, [commentText, isSending, lookId, haptic, show]);

  const handleDelete = useCallback(
    async (commentId: string) => {
      haptic.medium();
      const prev = comments;
      setComments(comments.filter((c) => c.id !== commentId));
      try {
        await deleteLookCommentOnApi(lookId, commentId);
        show('Comment deleted', 'info');
      } catch {
        setComments(prev);
        show('Failed to delete comment', 'error');
      }
    },
    [comments, lookId, haptic, show]
  );

  const renderItem = ({ item, index }: { item: LookCommentApiItem; index: number }) => {
    const isOwner = currentUserId && item.authorId === currentUserId;
    return (
      <Reanimated.View
        key={item.id}
        entering={FadeInDown.duration(200).delay(index * 30)}
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
            <Ionicons name="person-circle" size={32} color={Colors.textMuted} />
          )}
        </View>
        <View style={styles.commentBody}>
          <Text style={styles.commentAuthor}>
            @{item.author.username ?? 'unknown'}
          </Text>
          <Text style={styles.commentText}>{item.body}</Text>
        </View>
        {isOwner && (
          <Pressable
            onPress={() => handleDelete(item.id)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Delete comment"
          >
            <Ionicons name="trash-outline" size={18} color={Colors.textMuted} />
          </Pressable>
        )}
      </Reanimated.View>
    );
  };

  if (!visible) return null;

  return (
    <Reanimated.View
      entering={SlideInDown.duration(300)}
      style={StyleSheet.absoluteFillObject}
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
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </AnimatedPressable>
        </View>

        <FlatList
          ref={flatListRef}
          data={comments}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            isLoading ? (
              <ActivityIndicator size="large" color={Colors.brand} style={{ marginTop: 40 }} />
            ) : (
              <View style={styles.emptyWrap}>
                <Ionicons name="chatbubble-outline" size={32} color={Colors.textMuted} />
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

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.inputBar}
        >
          <TextInput
            style={styles.input}
            value={commentText}
            onChangeText={setCommentText}
            placeholder="Add a comment..."
            placeholderTextColor={Colors.textMuted}
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
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </AnimatedPressable>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceAlt,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  commentBody: {
    flex: 1,
    gap: 2,
  },
  commentAuthor: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  commentText: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  emptyWrap: {
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md,
    paddingVertical: 8,
    fontSize: 15,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
