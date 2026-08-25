import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { FlashList, type ListRenderItem, type FlashListRef } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Stroke, Control, FontFamily } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { useConnectivity } from '../hooks/useConnectivity';
import { OfflineBanner } from '../components/OfflineBanner';
import { KeyboardStickyView } from '../platform/keyboard/KeyboardProvider';
import type {
  SupportConversation,
  SupportMessage,
  SupportMessageCitation,
  MessageAuthorRole,
  ConversationOwnershipState,
  SupportContextKind,
} from '../contracts/support';
import {
  getSupportConversation,
  listSupportMessages,
  sendSupportMessage,
  requestSupportHandoff,
  confirmSupportResolution,
  submitSupportFeedback,
} from '../services/supportConversationApi';

type Props = NativeStackScreenProps<RootStackParamList, 'SupportConversation'>;

// ─── Pending message (optimistic local state) ───────────────────────────────
interface PendingMessage {
  id: string;
  conversationId: string;
  authorId: string | null;
  authorRole: MessageAuthorRole;
  body: string;
  citations: SupportMessageCitation[];
  metadata: Record<string, unknown>;
  createdAt: string;
  status: 'sending' | 'failed';
}

type DisplayMessage = SupportMessage | PendingMessage;

function isPending(msg: DisplayMessage): msg is PendingMessage {
  return 'status' in msg;
}

// ─── FlashList item ──────────────────────────────────────────────────────────
type ListItem =
  | { kind: 'loadMore' }
  | { kind: 'message'; message: DisplayMessage };

// ─── Context label mapping ───────────────────────────────────────────────────
const CONTEXT_LABELS: Record<SupportContextKind, { label: string; icon: string }> = {
  general: { label: 'General enquiry', icon: 'help-circle-outline' },
  order: { label: 'Order', icon: 'cube-outline' },
  listing: { label: 'Listing', icon: 'pricetag-outline' },
  payout: { label: 'Payout', icon: 'card-outline' },
  report: { label: 'Report', icon: 'flag-outline' },
  auction: { label: 'Auction', icon: 'trophy-outline' },
  coown_asset: { label: 'Co-Own asset', icon: 'diamond-outline' },
  catalog_import: { label: 'Import', icon: 'download-outline' },
  media_job: { label: 'Media', icon: 'image-outline' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function authorLabel(role: MessageAuthorRole): string {
  switch (role) {
    case 'customer': return 'You';
    case 'agent_ai': return 'AI assistant';
    case 'agent_human': return 'Support specialist';
    case 'system': return '';
  }
}

function formatMessageTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatContextId(id: string): string {
  return `#${id.slice(-8).toUpperCase()}`;
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function SupportConversationScreen({ navigation, route }: Props) {
  const { conversationId, contextKind, contextId } = route.params;
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();
  const { isOffline } = useConnectivity();
  const insets = useSafeAreaInsets();

  // ── State ──
  const [conversation, setConversation] = useState<SupportConversation | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isHandingOff, setIsHandingOff] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const listRef = useRef<FlashListRef<ListItem>>(null);
  const hasInitiallyScrolledRef = useRef(false);

  // ── Load conversation + messages ──
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const [conv, msgsResult] = await Promise.all([
          getSupportConversation(conversationId),
          listSupportMessages(conversationId, 50),
        ]);
        if (cancelled) return;
        setConversation(conv);
        setMessages(msgsResult.items);
        setCursor(msgsResult.nextCursor);
        setHasMore(!!msgsResult.nextCursor);
      } catch {
        if (!cancelled) {
          setLoadError('We could not load this conversation.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [conversationId, reloadKey]);

  // ── Auto-scroll to bottom on initial load ──
  useEffect(() => {
    if (messages.length > 0 && !hasInitiallyScrolledRef.current && !isLoading) {
      hasInitiallyScrolledRef.current = true;
      const timer = setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: false });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages.length, isLoading]);

  // ── List data ──
  const listData = useMemo<ListItem[]>(() => {
    const items: ListItem[] = messages.map(m => ({ kind: 'message' as const, message: m }));
    if (hasMore) {
      items.unshift({ kind: 'loadMore' });
    }
    return items;
  }, [messages, hasMore]);

  // ── Derived state ──
  const ownershipState: ConversationOwnershipState = conversation?.ownershipState ?? 'ai_active';
  const composerEnabled = ownershipState !== 'closed' && !isSending;
  const canRequestHandoff = ownershipState === 'ai_active';
  const title = conversation?.title ?? 'Support';

  const effectiveContextKind: SupportContextKind =
    conversation?.contextKind ?? (contextKind as SupportContextKind | undefined) ?? 'general';
  const effectiveContextId = conversation?.contextId ?? contextId ?? null;
  const hasContext = effectiveContextKind !== 'general' && effectiveContextId !== null;
  const contextConfig = CONTEXT_LABELS[effectiveContextKind];

  const canSend = input.trim().length > 0 && !isSending && ownershipState !== 'closed';

  // ── Scroll helpers ──
  const scrollToBottom = useCallback((animated: boolean = true) => {
    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated });
    }, 50);
  }, []);

  // ── Load more (older messages) ──
  const handleLoadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || !cursor) return;
    setIsLoadingMore(true);
    try {
      const result = await listSupportMessages(conversationId, 50, cursor);
      setMessages(prev => [...result.items, ...prev]);
      setCursor(result.nextCursor);
      setHasMore(!!result.nextCursor);
    } catch {
      show('Could not load earlier messages', 'error');
    } finally {
      setIsLoadingMore(false);
    }
  }, [conversationId, cursor, hasMore, isLoadingMore, show]);

  // ── Send message ──
  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending || ownershipState === 'closed') return;

    const pendingId = `pending-${Date.now()}`;
    const pendingMessage: PendingMessage = {
      id: pendingId,
      conversationId,
      authorId: null,
      authorRole: 'customer',
      body: trimmed,
      citations: [],
      metadata: {},
      createdAt: new Date().toISOString(),
      status: 'sending',
    };

    setInput('');
    setIsSending(true);
    haptic.medium();
    setMessages(prev => [...prev, pendingMessage]);
    scrollToBottom(true);

    try {
      const sent = await sendSupportMessage(conversationId, trimmed);
      setMessages(prev => prev.map(m => (m.id === pendingId ? sent : m)));
    } catch {
      setMessages(prev =>
        prev.map(m =>
          m.id === pendingId && isPending(m)
            ? { ...m, status: 'failed' as const }
            : m
        )
      );
      show('Could not send message. Tap to retry.', 'error');
    } finally {
      setIsSending(false);
    }
  }, [input, isSending, ownershipState, conversationId, haptic, show, scrollToBottom]);

  // ── Retry failed message ──
  const handleRetry = useCallback(async (messageId: string) => {
    const failedMessage = messages.find(m => m.id === messageId);
    if (!failedMessage || !isPending(failedMessage) || failedMessage.status !== 'failed') return;

    setMessages(prev =>
      prev.map(m =>
        m.id === messageId && isPending(m)
          ? { ...m, status: 'sending' as const }
          : m
      )
    );

    try {
      const sent = await sendSupportMessage(conversationId, failedMessage.body);
      setMessages(prev => prev.map(m => (m.id === messageId ? sent : m)));
    } catch {
      setMessages(prev =>
        prev.map(m =>
          m.id === messageId && isPending(m)
            ? { ...m, status: 'failed' as const }
            : m
        )
      );
      show('Still could not send. Check your connection.', 'error');
    }
  }, [messages, conversationId, show]);

  // ── Request handoff ──
  const handleHandoff = useCallback(async () => {
    if (!conversation || isHandingOff) return;
    setIsHandingOff(true);
    haptic.medium();
    try {
      await requestSupportHandoff(conversationId, 'Customer requested human support');
      setConversation(prev => prev ? { ...prev, ownershipState: 'human_queued' } : prev);
      show("You're in the queue. A specialist will continue here.", 'info');
    } catch {
      show('Could not request a specialist. Try again.', 'error');
    } finally {
      setIsHandingOff(false);
    }
  }, [conversation, conversationId, isHandingOff, haptic, show]);

  // ── Confirm resolution ──
  const handleConfirmResolution = useCallback(async (resolved: boolean) => {
    if (!conversation || isConfirming) return;
    setIsConfirming(true);
    haptic.medium();
    try {
      await confirmSupportResolution(conversationId, resolved);
      if (resolved) {
        setConversation(prev => prev ? { ...prev, ownershipState: 'closed' } : prev);
        setShowFeedback(true);
        show('Marked as resolved', 'success');
      } else {
        setConversation(prev => prev ? { ...prev, ownershipState: 'ai_active' } : prev);
        show("We'll continue helping you here.", 'info');
      }
    } catch {
      show('Could not submit. Check your connection.', 'error');
    } finally {
      setIsConfirming(false);
    }
  }, [conversation, conversationId, isConfirming, haptic, show]);

  // ── Submit feedback ──
  const handleFeedback = useCallback(async (rating: 'helpful' | 'unhelpful') => {
    haptic.light();
    try {
      await submitSupportFeedback(conversationId, rating);
      setShowFeedback(false);
      show('Thanks for your feedback', 'success');
    } catch {
      show('Could not submit feedback', 'error');
    }
  }, [conversationId, haptic, show]);

  // ── Retry initial load ──
  const handleRetryLoad = useCallback(() => {
    setReloadKey(k => k + 1);
  }, []);

  // ── Key extractor ──
  const keyExtractor = useCallback((item: ListItem) => {
    if (item.kind === 'loadMore') return 'loadMore';
    return item.message.id;
  }, []);

  // ── Item type (for FlashList recycling) ──
  const getItemType = useCallback((item: ListItem) => {
    if (item.kind === 'loadMore') return 'loadMore';
    return item.message.authorRole;
  }, []);

  // ── Render message item ──
  const renderMessage = useCallback(
    (message: DisplayMessage) => {
      // System message — centered, muted, no bubble
      if (message.authorRole === 'system') {
        return (
          <View style={styles.systemWrap}>
            <Text style={styles.systemText}>{message.body}</Text>
          </View>
        );
      }

      const isCustomer = message.authorRole === 'customer';
      const label = authorLabel(message.authorRole);
      const showLabel = !isCustomer && label.length > 0;
      const hasCitations = message.citations.length > 0;
      const pending = isPending(message);

      return (
        <View style={isCustomer ? styles.customerRow : styles.otherRow}>
          <View style={isCustomer ? styles.customerBubble : styles.otherBubble}>
            {showLabel && (
              <Text style={styles.authorLabel}>{label}</Text>
            )}
            <Text style={isCustomer ? styles.customerText : styles.otherText}>
              {message.body}
            </Text>
            {hasCitations && (
              <View style={styles.citationsRow}>
                {message.citations.map((citation, index) => (
                  <Text
                    key={citation.articleId ?? `citation-${index}`}
                    style={styles.citationText}
                    numberOfLines={1}
                  >
                    {citation.articleTitle ?? 'Source'}
                  </Text>
                ))}
              </View>
            )}
            <Text style={isCustomer ? styles.customerTime : styles.otherTime}>
              {formatMessageTime(message.createdAt)}
            </Text>
          </View>
          {pending && message.status === 'sending' && (
            <View style={styles.pendingIndicator}>
              <ActivityIndicator size="small" color={colors.textMuted} />
            </View>
          )}
          {pending && message.status === 'failed' && (
            <AnimatedPressable
              onPress={() => handleRetry(message.id)}
              style={styles.retryBtn}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Retry sending message"
            >
              <Ionicons name="alert-circle" size={13} color={colors.danger} />
              <Text style={styles.retryText}>Tap to retry</Text>
            </AnimatedPressable>
          )}
        </View>
      );
    },
    [styles, colors, handleRetry]
  );

  // ── Render item ──
  const renderItem = useCallback<ListRenderItem<ListItem>>(
    ({ item }) => {
      if (item.kind === 'loadMore') {
        return (
          <View style={styles.loadMoreWrap}>
            <AnimatedPressable
              onPress={handleLoadMore}
              style={styles.loadMoreBtn}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Load earlier messages"
              disabled={isLoadingMore}
            >
              {isLoadingMore ? (
                <ActivityIndicator size="small" color={colors.textMuted} />
              ) : (
                <Text style={styles.loadMoreText}>Load earlier messages</Text>
              )}
            </AnimatedPressable>
          </View>
        );
      }
      return renderMessage(item.message);
    },
    [styles, handleLoadMore, isLoadingMore, colors.textMuted, renderMessage]
  );

  // ── Header right action: "Talk to a person" ──
  const headerRightAction = useMemo(() => {
    if (!canRequestHandoff) return undefined;
    return (
      <AnimatedPressable
        onPress={handleHandoff}
        style={styles.handoffBtn}
        hapticFeedback="light"
        accessibilityRole="button"
        accessibilityLabel="Talk to a person"
        accessibilityHint="Request to speak with a human support specialist"
        disabled={isHandingOff}
      >
        {isHandingOff ? (
          <ActivityIndicator size="small" color={colors.textSecondary} />
        ) : (
          <Text style={styles.handoffText}>Talk to a person</Text>
        )}
      </AnimatedPressable>
    );
  }, [canRequestHandoff, handleHandoff, isHandingOff, styles, colors.textSecondary]);

  // ── State banner content ──
  const stateBanner = useMemo(() => {
    if (ownershipState === 'ai_active' || ownershipState === 'human_active') {
      return null;
    }

    if (ownershipState === 'resolved' && showFeedback) {
      return (
        <View style={styles.stateBanner}>
          <Text style={styles.stateBannerText}>Was this helpful?</Text>
          <View style={styles.stateBannerActions}>
            <AnimatedPressable
              onPress={() => handleFeedback('helpful')}
              style={[styles.feedbackBtn, { borderColor: colors.border }]}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Yes, this was helpful"
            >
              <Ionicons name="thumbs-up-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.feedbackBtnText}>Yes</Text>
            </AnimatedPressable>
            <AnimatedPressable
              onPress={() => handleFeedback('unhelpful')}
              style={[styles.feedbackBtn, { borderColor: colors.border }]}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="No, this was not helpful"
            >
              <Ionicons name="thumbs-down-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.feedbackBtnText}>No</Text>
            </AnimatedPressable>
          </View>
        </View>
      );
    }

    if (ownershipState === 'resolved') {
      return (
        <View style={styles.stateBanner}>
          <Text style={styles.stateBannerText}>Is this resolved?</Text>
          <View style={styles.stateBannerActions}>
            <AppButton
              title="Yes, resolved"
              variant="primary"
              size="sm"
              onPress={() => handleConfirmResolution(true)}
              loading={isConfirming}
              hapticFeedback="medium"
              accessibilityLabel="Confirm resolved"
              style={styles.stateActionBtn}
            />
            <AppButton
              title="Still need help"
              variant="secondary"
              size="sm"
              onPress={() => handleConfirmResolution(false)}
              disabled={isConfirming}
              hapticFeedback="light"
              accessibilityLabel="Still need help"
              style={styles.stateActionBtn}
            />
          </View>
        </View>
      );
    }

    const bannerText: Record<ConversationOwnershipState, string | null> = {
      ai_active: null,
      human_active: null,
      human_queued: 'A support specialist will continue here.',
      awaiting_customer: 'Waiting for your response.',
      resolved: null,
      closed: 'This conversation is closed.',
    };

    const text = bannerText[ownershipState];
    if (!text) return null;

    return (
      <View style={styles.stateBanner}>
        <Text style={styles.stateBannerText}>{text}</Text>
      </View>
    );
  }, [ownershipState, showFeedback, handleFeedback, handleConfirmResolution, isConfirming, styles, colors.border, colors.textSecondary]);

  // ── Composer ──
  const composer = useMemo(() => {
    return (
      <View style={[styles.composer, { paddingBottom: Math.max(0, insets.bottom - Space.md) }]}>
        <AppInput
          value={input}
          onChangeText={setInput}
          placeholder="Message..."
          editable={composerEnabled}
          multiline
          maxLength={2000}
          appearance="filled"
          prefix={
            <AnimatedPressable
              onPress={() => {}}
              style={styles.attachBtn}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Attach file"
              accessibilityHint="Attach a photo or document to your message"
            >
              <Ionicons name="attach-outline" size={Control.icon} color={colors.textSecondary} />
            </AnimatedPressable>
          }
          containerStyle={styles.composerInputContainer}
          inputContainerStyle={styles.composerInputWrap}
          inputStyle={styles.composerInputText}
        />
        <AnimatedPressable
          onPress={handleSend}
          style={[
            styles.sendBtn,
            canSend ? { backgroundColor: colors.brand } : { backgroundColor: colors.surfaceAlt },
          ]}
          hapticFeedback="medium"
          accessibilityRole="button"
          accessibilityLabel="Send message"
          disabled={!canSend}
        >
          {isSending ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <Ionicons
              name="arrow-up"
              size={18}
              color={canSend ? colors.background : colors.textMuted}
            />
          )}
        </AnimatedPressable>
      </View>
    );
  }, [input, composerEnabled, handleSend, canSend, isSending, styles, colors, insets.bottom]);

  // ── Sticky footer (state banner + composer, keyboard-aware) ──
  const stickyFooter = useMemo(() => {
    return (
      <KeyboardStickyView style={{ backgroundColor: colors.background }}>
        {stateBanner}
        {composer}
      </KeyboardStickyView>
    );
  }, [stateBanner, composer, colors.background]);

  // ── Loading state ──
  if (isLoading) {
    return (
      <FlagshipScreen
        scrollEnabled={false}
        header={<FlagshipHeader title="Support" onBack={() => navigation.goBack()} />}
      >
        <FlagshipState
          variant="loading"
          title="Loading conversation"
          style={{ flex: 1 }}
        />
      </FlagshipScreen>
    );
  }

  // ── Error state ──
  if (loadError) {
    return (
      <FlagshipScreen
        scrollEnabled={false}
        header={<FlagshipHeader title="Support" onBack={() => navigation.goBack()} />}
      >
        <FlagshipState
          variant="error"
          title="Could not load"
          subtitle={loadError}
          actionLabel="Try again"
          onAction={handleRetryLoad}
          style={{ flex: 1 }}
        />
      </FlagshipScreen>
    );
  }

  // ── Main render ──
  return (
    <FlagshipScreen
      scrollEnabled={false}
      keyboardAvoiding={false}
      header={
        <FlagshipHeader
          title={title}
          subtitle="AI assistant"
          onBack={() => navigation.goBack()}
          rightAction={headerRightAction}
        />
      }
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      stickyFooter={stickyFooter}
    >
      {/* Offline banner — does not block interaction */}
      {isOffline && (
        <OfflineBanner message="You are offline. Messages may not send." />
      )}

      {/* Context bar — flat row, no card */}
      {hasContext && (
        <View style={styles.contextBar}>
          <Ionicons
            name={contextConfig.icon as React.ComponentProps<typeof Ionicons>['name']}
            size={16}
            color={colors.textSecondary}
          />
          <Text style={styles.contextText} numberOfLines={1}>
            {contextConfig.label}
            {effectiveContextId && ` ${formatContextId(effectiveContextId)}`}
          </Text>
        </View>
      )}

      {/* Message list or empty state */}
      {messages.length === 0 ? (
        <FlagshipState
          variant="empty"
          title="No messages yet"
          subtitle="Send a message below to start the conversation."
          icon="chatbubble-outline"
          style={{ flex: 1 }}
        />
      ) : (
        <FlashList
          ref={listRef}
          data={listData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemType={getItemType}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      )}
    </FlagshipScreen>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ── Context bar ──
    contextBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    contextText: {
      flex: 1,
      fontSize: Type.caption.size,
      fontFamily: FontFamily.medium,
      color: colors.textSecondary,
      letterSpacing: Type.caption.letterSpacing,
    },

    // ── List ──
    listContent: {
      paddingVertical: Space.sm,
    },

    // ── Load more ──
    loadMoreWrap: {
      alignItems: 'center',
      paddingVertical: Space.sm,
    },
    loadMoreBtn: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      minHeight: Control.hit,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadMoreText: {
      fontSize: Type.caption.size,
      fontFamily: FontFamily.semibold,
      color: colors.textSecondary,
      letterSpacing: Type.caption.letterSpacing,
    },

    // ── System message ──
    systemWrap: {
      alignItems: 'center',
      paddingVertical: Space.sm,
      paddingHorizontal: Space.lg,
    },
    systemText: {
      fontSize: Type.caption.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: Type.caption.lineHeight + 2,
    },

    // ── Message rows ──
    customerRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
    },
    otherRow: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
    },

    // ── Message bubbles ──
    customerBubble: {
      maxWidth: '78%',
      backgroundColor: colors.brand,
      borderRadius: Radius.chat,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + Space.xs,
    },
    otherBubble: {
      maxWidth: '78%',
      backgroundColor: colors.surface,
      borderRadius: Radius.chat,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + Space.xs,
    },

    // ── Author label ──
    authorLabel: {
      fontSize: Type.meta.size,
      fontFamily: FontFamily.semibold,
      color: colors.textSecondary,
      letterSpacing: Type.meta.letterSpacing,
      marginBottom: Space.xs / 2,
    },

    // ── Message text ──
    customerText: {
      fontSize: Type.body.size,
      fontFamily: FontFamily.regular,
      color: colors.textInverse,
      lineHeight: Type.body.lineHeight + 2,
      letterSpacing: Type.body.letterSpacing,
    },
    otherText: {
      fontSize: Type.body.size,
      fontFamily: FontFamily.regular,
      color: colors.textPrimary,
      lineHeight: Type.body.lineHeight + 2,
      letterSpacing: Type.body.letterSpacing,
    },

    // ── Citations ──
    citationsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.xs,
      marginTop: Space.xs,
      paddingTop: Space.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle,
    },
    citationText: {
      fontSize: Type.meta.size,
      fontFamily: FontFamily.medium,
      color: colors.textSecondary,
      letterSpacing: Type.meta.letterSpacing,
    },

    // ── Timestamps ──
    customerTime: {
      fontSize: Type.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textInverse,
      opacity: 0.7,
      marginTop: Space.xs / 2,
      alignSelf: 'flex-end',
    },
    otherTime: {
      fontSize: Type.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      marginTop: Space.xs / 2,
      alignSelf: 'flex-end',
    },

    // ── Pending status ──
    pendingIndicator: {
      justifyContent: 'flex-end',
      paddingBottom: Space.xs,
      paddingLeft: Space.xs,
    },
    retryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs,
      paddingRight: Space.xs,
      alignSelf: 'flex-end',
    },
    retryText: {
      fontSize: Type.meta.size,
      fontFamily: FontFamily.medium,
      color: colors.danger,
      letterSpacing: Type.meta.letterSpacing,
    },

    // ── Header handoff button ──
    handoffBtn: {
      minHeight: Control.hit,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: Space.xs,
    },
    handoffText: {
      fontSize: Type.caption.size,
      fontFamily: FontFamily.semibold,
      color: colors.textSecondary,
      letterSpacing: Type.caption.letterSpacing,
    },

    // ── State banner ──
    stateBanner: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    stateBannerText: {
      fontSize: Type.body.size,
      fontFamily: FontFamily.medium,
      color: colors.textPrimary,
      lineHeight: Type.body.lineHeight,
      letterSpacing: Type.body.letterSpacing,
      marginBottom: Space.sm,
    },
    stateBannerActions: {
      flexDirection: 'row',
      gap: Space.sm,
    },
    stateActionBtn: {
      flex: 1,
    },
    feedbackBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      flex: 1,
      minHeight: Control.hit,
    },
    feedbackBtnText: {
      fontSize: Type.body.size,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
      letterSpacing: Type.body.letterSpacing,
    },

    // ── Composer ──
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: Space.sm,
      paddingTop: Space.sm,
    },
    composerInputContainer: {
      flex: 1,
    },
    composerInputWrap: {
      minHeight: 40,
      maxHeight: 120,
      borderRadius: Radius.chat,
      paddingVertical: Space.xs,
      alignItems: 'flex-end',
    },
    composerInputText: {
      paddingVertical: Space.xs,
      maxHeight: 100,
    },
    attachBtn: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: -Space.xs,
    },
    sendBtn: {
      width: 40,
      height: 40,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: Space.xs,
    },
  });
}
