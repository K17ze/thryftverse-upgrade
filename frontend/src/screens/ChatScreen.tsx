import React, { useEffect, useMemo, useState } from 'react';
import { AnimatedPressable } from '../components/AnimatedPressable';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Reanimated, {
  SlideInRight,
  SlideInLeft,
  ZoomIn,
  FadeIn,
  Layout,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { ActiveTheme, Colors } from '../constants/colors';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { MOCK_USERS, MOCK_LISTINGS } from '../data/mockData';
import type { Message as ConversationMessage } from '../data/mockData';
import { mockArrayOrEmpty, mockFind } from '../utils/mockGate';
import { useBackendData } from '../context/BackendDataContext';
import { getListingCoverUri } from '../utils/media';
import { useStore } from '../store/useStore';
import {
  fetchConversationMessagesFromApi,
  sendConversationMessageOnApi,
} from '../services/chatApi';
import { useToast } from '../context/ToastContext';
import { CachedImage } from '../components/CachedImage';
import { AppButton } from '../components/ui/AppButton';
import { AppStatusPill } from '../components/ui/AppStatusPill';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptic } from '../hooks/useHaptic';
import { ChatHeader } from '../components/chat/ChatHeader';
import { ChatCard } from '../components/chat/ChatCard';
import { ComposerInput } from '../components/chat/ComposerInput';
import { MessageBubble } from '../components/chat/MessageBubble';
import { Space, Radius, Type } from '../theme/designTokens';
import { MessageContextMenu } from '../components/chat/MessageContextMenu';
import { EmojiReactionsBar } from '../components/chat/EmojiReactionsBar';
import { ReplyQuote } from '../components/chat/ReplyQuote';
import { ScrollToBottomFAB } from '../components/chat/ScrollToBottomFAB';
import { LinkPreviewCard, extractFirstUrl } from '../components/chat/LinkPreviewCard';
import { SkeletonChatLoader } from '../components/chat/SkeletonChatLoader';
import * as Clipboard from 'expo-clipboard';
import { Meta, Caption, BodyEmphasis } from '../components/ui/Text';

type Props = StackScreenProps<RootStackParamList, 'Chat'>;

type MsgType = 'text' | 'offer' | 'offer_declined' | 'purchase_status';

interface Message {
  id: string;
  type: MsgType;
  sender: 'me' | 'them';
  senderLabel?: string;
  text?: string;
  offer?: { price: number; originalPrice: number; status?: 'pending' | 'declined' | 'countered' | 'accepted' };
  date?: string;
  replyToMessageId?: string;
  reactions?: Array<{ emoji: string; count: number; reactedByMe: boolean }>;
}

const INITIAL_MESSAGES: Message[] = [
  { id: 'd1', type: 'text', sender: 'me', text: '', date: '19/03/2026' },
  {
    id: 'm1',
    type: 'offer',
    sender: 'me',
    offer: { price: 30, originalPrice: 48, status: 'declined' },
  },
  {
    id: 'm2',
    type: 'offer',
    sender: 'them',
    offer: { price: 35, originalPrice: 48 },
  },
  {
    id: 's1',
    type: 'purchase_status',
    sender: 'them',
    text: "Purchase successful\nmariefullery has to send it before 26 Mar. We'll keep you updated on the progress.",
    date: '20/03/2026',
  },
];

const CHAT_ORDER_ID = 'ord1';

function TaggedItemCard({
  itemId,
  navigation,
  formatFromFiat,
}: {
  itemId?: string;
  navigation: any;
  formatFromFiat: any;
}) {
  const { listings } = useBackendData();
  const listing = useMemo(() => {
    if (!itemId) return null;
    return listings.find((l) => l.id === itemId) || mockFind(MOCK_LISTINGS, (l) => l.id === itemId);
  }, [itemId, listings]);

  if (!listing) return null;

  return (
    <View style={styles.contextGallery}>
      <AnimatedPressable
        style={styles.itemCard}
        onPress={() => navigation.navigate('ItemDetail', { itemId: listing.id })}
        activeOpacity={0.85}
        scaleValue={0.98}
        hapticFeedback="light"
      >
        <ChatCard variant="elevated" style={{ flexDirection: 'row', alignItems: 'center', gap: Space.sm + 6 }}>
          <CachedImage
            uri={getListingCoverUri(listing.images, 'https://picsum.photos/seed/chat-item/100/100')}
            style={styles.itemThumbImage}
            containerStyle={styles.itemThumb}
            contentFit="cover"
          />
          <View style={styles.itemInfo}>
            <BodyEmphasis numberOfLines={1}>{listing.title}</BodyEmphasis>
            <Caption color={Colors.textSecondary}>{formatFromFiat(listing.price, 'GBP', { displayMode: 'fiat' })}</Caption>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </ChatCard>
      </AnimatedPressable>
    </View>
  );
}

export default function ChatScreen({ navigation, route }: Props) {
  const { conversationId, itemId: routeItemId } = route.params;
  const currentUser = useStore((state) => state.currentUser);
  const conversations = useStore((state) => state.conversations);
  const bots = useStore((state) => state.availableChatBots);
  const appendConversationMessage = useStore((state) => state.appendConversationMessage);
  const replaceConversationMessages = useStore((state) => state.replaceConversationMessages);
  const markConversationRead = useStore((state) => state.markConversationRead);
  const setConversationDraft = useStore((state) => state.setConversationDraft);
  const addMessageReaction = useStore((state) => state.addMessageReaction);
  const { show } = useToast();
  const haptic = useHaptic();
  const conversation = useMemo(
    () => conversations.find((item) => item.id === conversationId),
    [conversationId, conversations]
  );
  const isGroup = conversation?.type === 'group';
  const reducedMotionEnabled = useReducedMotion();

  const botLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const bot of bots) {
      map.set(bot.id, bot.name);
    }
    return map;
  }, [bots]);

  const userLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of mockArrayOrEmpty(MOCK_USERS)) {
      map.set(user.id, user.username);
    }
    map.set('me', currentUser?.username ?? 'you');
    if (currentUser?.id) {
      map.set(currentUser.id, currentUser.username);
    }
    return map;
  }, [currentUser?.id, currentUser?.username]);

  const hydratedMessages = useMemo<Message[]>(() => {
    if (!conversation?.messages.length) {
      return INITIAL_MESSAGES;
    }
    return conversation.messages.map((entry) => {
      const resolvedSenderId = entry.senderId;
      const isCurrentUserSender = resolvedSenderId === 'me' || resolvedSenderId === currentUser?.id;
      const sender: 'me' | 'them' = isCurrentUserSender ? 'me' : 'them';
      const senderLabel = botLookup.get(resolvedSenderId)
        ?? userLookup.get(resolvedSenderId)
        ?? (resolvedSenderId === 'system' ? 'System' : resolvedSenderId);

      if (entry.offerPrice !== undefined && entry.originalPrice !== undefined) {
        return {
          id: entry.id,
          type: 'offer',
          sender,
          senderLabel,
          offer: {
            price: entry.offerPrice,
            originalPrice: entry.originalPrice,
            status: entry.offerStatus,
          },
          text: entry.text,
        };
      }
      return {
        id: entry.id,
        type: 'text',
        sender,
        senderLabel,
        text: entry.text ?? entry.systemTitle ?? '',
        date: entry.timestamp,
        reactions: entry.reactions?.map((r) => ({
          emoji: r.emoji,
          count: r.userIds.length,
          reactedByMe: r.userIds.includes(currentUser?.id ?? 'me'),
        })),
      };
    });
  }, [botLookup, conversation?.messages, currentUser?.id, userLookup]);

  const [messages, setMessages] = useState<Message[]>(hydratedMessages);
  const [input, setInput] = useState('');
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reactingToMessage, setReactingToMessage] = useState<Message | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const listRef = React.useRef<FlatList>(null);
  const { formatFromFiat } = useFormattedPrice();

  useEffect(() => {
    setMessages(hydratedMessages);
  }, [hydratedMessages]);

  useEffect(() => {
    markConversationRead(conversationId);
  }, [conversationId, markConversationRead]);

  useEffect(() => {
    setConversationDraft(conversationId, input);
  }, [input, conversationId, setConversationDraft]);

  useEffect(() => {
    let cancelled = false;
    const syncMessagesFromApi = async () => {
      setIsSyncing(true);
      try {
        const syncedMessages = await fetchConversationMessagesFromApi(conversationId);
        if (cancelled || !syncedMessages.length) return;
        replaceConversationMessages(conversationId, syncedMessages);
      } catch {
        // Keep local state when sync unavailable
      } finally {
        if (!cancelled) setIsSyncing(false);
      }
    };
    void syncMessagesFromApi();
    return () => { cancelled = true; };
  }, [conversationId, replaceConversationMessages]);

  const resolvedPartnerId = useMemo(() => {
    if (isGroup) return null;
    if (route.params.partnerUserId) return route.params.partnerUserId;
    if (conversation?.sellerId) return conversation.sellerId;
    return conversation?.participantIds?.find((id) => id !== 'me' && id !== currentUser?.id) ?? null;
  }, [conversation?.participantIds, conversation?.sellerId, currentUser?.id, isGroup, route.params.partnerUserId]);

  const deployedBotIds = conversation?.botIds ?? [];
  const sellerUser = resolvedPartnerId
    ? mockArrayOrEmpty(MOCK_USERS).find((user) => user.id === resolvedPartnerId)
    : undefined;
  const sellerHandle = resolvedPartnerId
    ? userLookup.get(resolvedPartnerId) ?? sellerUser?.username ?? resolvedPartnerId
    : 'profile';
  const sellerLocation = sellerUser?.location ?? 'South Elmsall, UK';
  const sellerLastSeen = sellerUser?.lastSeen ?? '2h ago';

  const pushMessage = (next: Message) => {
    setMessages((prev) => [...prev, next]);
  };

  const appendToConversationStore = (next: Message, senderIdOverride?: string) => {
    appendConversationMessage(conversationId, {
      id: next.id,
      senderId: senderIdOverride ?? (next.sender === 'me' ? currentUser?.id ?? 'me' : 'system'),
      text: next.text,
      offerPrice: next.offer?.price,
      originalPrice: next.offer?.originalPrice,
      offerStatus: next.offer?.status === 'countered' ? 'pending' : next.offer?.status,
      isSystem: senderIdOverride === 'system',
      timestamp: 'just now',
      type: next.type === 'offer' ? 'offer' : 'text',
      sender: next.sender === 'me' ? 'me' : 'other',
    });
  };

  const sendMessage = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const outgoing: Message = {
      id: String(Date.now()),
      type: 'text',
      sender: 'me',
      senderLabel: currentUser?.username ?? 'you',
      text: trimmed,
    };
    if (replyTo) {
      outgoing.replyToMessageId = replyTo.id;
    }
    pushMessage(outgoing);
    appendToConversationStore(outgoing, currentUser?.id ?? 'me');

    if (isGroup) {
      void sendConversationMessageOnApi(conversationId, trimmed).catch(() => {});
    }

    if (isGroup && trimmed.startsWith('/') && deployedBotIds.length > 0) {
      const botId = deployedBotIds[0];
      const botName = botLookup.get(botId) ?? 'Bot';
      const botReply: Message = {
        id: String(Date.now()) + '_bot',
        type: 'text',
        sender: 'them',
        senderLabel: botName,
        text: botName + ': command received (' + trimmed + ').',
      };
      setTimeout(() => {
        pushMessage(botReply);
        appendToConversationStore(botReply, botId);
      }, 350);
    }

    setInput('');
    setReplyTo(null);
  };

  const handleAcceptOffer = (msgId: string) => {
    haptic.medium();
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, offer: { ...m.offer!, status: 'accepted' } } : m));
    navigation.navigate('Checkout', { itemId: '1' });
  };

  const handleDeclineOffer = (msgId: string) => {
    haptic.light();
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, offer: { ...m.offer!, status: 'declined' } } : m));
  };

  const handleMessageLongPress = (msg: Message) => {
    if (selectionMode) {
      toggleMessageSelection(msg.id);
      return;
    }
    setSelectedMessage(msg);
    setContextMenuVisible(true);
    haptic.medium();
  };

  const toggleMessageSelection = (msgId: string) => {
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId); else next.add(msgId);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  };

  const enterSelectionMode = (msgId: string) => {
    setSelectionMode(true);
    setSelectedMessageIds(new Set([msgId]));
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedMessageIds(new Set());
  };

  const handleBulkDelete = () => {
    haptic.medium();
    const idsToDelete = new Set(selectedMessageIds);
    setMessages((prev) => prev.filter((m) => !idsToDelete.has(m.id)));
    show('Deleted ' + idsToDelete.size + ' message' + (idsToDelete.size === 1 ? '' : 's'), 'info');
    exitSelectionMode();
  };

  const handleDeleteMessage = (msg: Message) => {
    haptic.medium();
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    show('Message deleted', 'info');
  };

  const scrollToBottom = () => {
    listRef.current?.scrollToEnd({ animated: true });
    setShowScrollToBottom(false);
  };

  const renderMessage = (msg: Message) => {
    const layoutAnimation = reducedMotionEnabled ? undefined : Layout.springify();

    if (msg.date && !msg.text && !msg.offer) {
      return (
        <Reanimated.View
          key={msg.id + '_date'}
          entering={reducedMotionEnabled ? undefined : FadeIn}
          layout={layoutAnimation}
          style={styles.dateWrap}
        >
          <View style={styles.datePill}>
            <Caption color={Colors.textMuted} style={styles.dateText}>{msg.date}</Caption>
          </View>
        </Reanimated.View>
      );
    }

    if (msg.type === 'purchase_status') {
      const lines = msg.text!.split('\n');
      return (
        <Reanimated.View
          key={msg.id}
          entering={reducedMotionEnabled ? undefined : FadeIn.delay(200)}
          layout={layoutAnimation}
          style={styles.statusWrap}
        >
          <ChatCard variant="surface" style={styles.statusCard}>
            <BodyEmphasis style={styles.statusTitle}>{lines[0]}</BodyEmphasis>
            <Caption color={Colors.textSecondary} style={styles.statusBody}>{lines.slice(1).join('\n')}</Caption>
            <AnimatedPressable
              onPress={() => navigation.navigate('OrderDetail', { orderId: CHAT_ORDER_ID })}
              accessibilityRole="button"
              accessibilityLabel="Open tracking"
              activeOpacity={0.7}
              scaleValue={0.98}
              hapticFeedback="light"
            >
              <Caption color={Colors.brand} style={styles.statusLink}>Tracking information</Caption>
            </AnimatedPressable>
          </ChatCard>
        </Reanimated.View>
      );
    }

    if (msg.type === 'offer' || msg.type === 'offer_declined') {
      const isMe = msg.sender === 'me';
      const offerStatus = msg.offer!.status;
      return (
        <Reanimated.View
          key={msg.id}
          entering={reducedMotionEnabled ? undefined : ZoomIn.duration(400).springify()}
          layout={layoutAnimation}
          style={[styles.msgRow, isMe && styles.msgRowRight]}
        >
          <ChatCard variant={isMe ? 'tint' : 'surface'} style={[styles.offerCard, isMe && styles.offerCardMe]}>
            {isGroup && !isMe && msg.senderLabel ? (
              <Meta color={Colors.textMuted} style={styles.offerSender}>{msg.senderLabel}</Meta>
            ) : null}
            <View style={styles.offerPriceRow}>
              <Text style={styles.offerPriceText}>{formatFromFiat(msg.offer!.price, 'GBP', { displayMode: 'fiat' })}</Text>
              <Caption color={Colors.textMuted}>
                <Text style={styles.strike}>{formatFromFiat(msg.offer!.originalPrice, 'GBP', { displayMode: 'fiat' })}</Text>
              </Caption>
            </View>
            {offerStatus === 'declined' && (
              <AppStatusPill style={styles.offerPill} tone="negative" iconName="close-circle-outline" label="Declined" />
            )}
            {offerStatus === 'accepted' && (
              <AppStatusPill style={styles.offerPill} tone="positive" iconName="checkmark-circle-outline" label="Accepted" />
            )}
            {!offerStatus && isMe && (
              <AppStatusPill style={styles.offerPill} tone="neutral" iconName="time-outline" label="Waiting" />
            )}
            {!isMe && !offerStatus && (
              <View style={styles.offerActions}>
                <AppButton
                  style={styles.offerBtn}
                  variant="secondary"
                  size="sm"
                  align="center"
                  icon={<Ionicons name="close-outline" size={15} color={Colors.textPrimary} />}
                  title="Pass"
                  onPress={() => handleDeclineOffer(msg.id)}
                />
                <AppButton
                  style={styles.offerBtn}
                  variant="primary"
                  size="sm"
                  align="center"
                  icon={<Ionicons name="flash-outline" size={15} color={Colors.background} />}
                  title="Accept"
                  onPress={() => handleAcceptOffer(msg.id)}
                />
              </View>
            )}
          </ChatCard>
        </Reanimated.View>
      );
    }

    if (!msg.text) return null;
    const isMe = msg.sender === 'me';
    return (
      <View style={[styles.selectionRow, isMe && styles.selectionRowRight]}>
        {selectionMode ? (
          <AnimatedPressable
            style={[styles.checkbox, selectedMessageIds.has(msg.id) && styles.checkboxActive]}
            onPress={() => toggleMessageSelection(msg.id)}
            activeOpacity={0.7}
            hapticFeedback="light"
          >
            {selectedMessageIds.has(msg.id) ? (
              <Ionicons name="checkmark" size={14} color={Colors.textInverse} />
            ) : null}
          </AnimatedPressable>
        ) : null}
        <Reanimated.View
          key={msg.id}
          entering={reducedMotionEnabled ? undefined : (isMe ? SlideInRight.springify() : SlideInLeft.springify())}
          layout={layoutAnimation}
          style={[styles.msgRow, isMe && styles.msgRowRight]}
        >
          <MessageBubble
            text={msg.text}
            isMe={isMe}
            senderLabel={isGroup && !isMe ? msg.senderLabel : undefined}
            timestamp={msg.date || 'just now'}
            status={isMe ? 'sent' : undefined}
            onLongPress={() => handleMessageLongPress(msg)}
            reactions={msg.reactions}
          />
          {(() => {
            const url = extractFirstUrl(msg.text ?? '');
            return url ? (
              <View style={[styles.linkPreviewWrap, isMe && styles.linkPreviewWrapRight]}>
                <LinkPreviewCard url={url} />
              </View>
            ) : null;
          })()}
        </Reanimated.View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} />

      <ChatHeader
        variant={isGroup ? 'group' : 'dm'}
        onBack={() => navigation.goBack()}
        title={isGroup ? (conversation?.title ?? 'Group chat') : '@' + sellerHandle}
        subtitle={
          isGroup
            ? (conversation?.participantIds?.length ?? 0) + ' members'
            : sellerLocation + ' \u00b7 ' + sellerLastSeen
        }
        avatarUrl={isGroup ? null : sellerUser?.avatar ?? null}
        isOnline={!isGroup}
        onTitlePress={
          isGroup
            ? undefined
            : () => {
                if (resolvedPartnerId) {
                  navigation.navigate('UserProfile', { userId: resolvedPartnerId });
                }
              }
        }
        rightAction={
          isGroup ? (
            <AnimatedPressable
              style={styles.headerIconBtn}
              onPress={() => navigation.navigate('GroupBotDirectory', { conversationId })}
              accessibilityRole="button"
              activeOpacity={0.7}
              scaleValue={0.9}
              hapticFeedback="light"
            >
              <Ionicons name="hardware-chip-outline" size={22} color={Colors.textPrimary} />
            </AnimatedPressable>
          ) : null
        }
      />

      {selectionMode ? (
        <View style={styles.selectionToolbar}>
          <AnimatedPressable onPress={exitSelectionMode} activeOpacity={0.7} scaleValue={0.92} hapticFeedback="light">
            <Ionicons name="close-outline" size={24} color={Colors.textPrimary} />
          </AnimatedPressable>
          <Caption color={Colors.textMuted}>{selectedMessageIds.size} selected</Caption>
          <AnimatedPressable
            onPress={handleBulkDelete}
            activeOpacity={0.7}
            scaleValue={0.92}
            hapticFeedback="medium"
            accessibilityLabel="Delete selected"
          >
            <Ionicons name="trash-outline" size={22} color={Colors.danger} />
          </AnimatedPressable>
        </View>
      ) : null}

      {!isGroup && routeItemId ? (
        <TaggedItemCard itemId={routeItemId} navigation={navigation} formatFromFiat={formatFromFiat} />
      ) : null}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {isSyncing ? (
          <SkeletonChatLoader count={6} />
        ) : messages.length ? (
          <FlatList
            ref={listRef}
            data={messages}
            renderItem={({ item }) => renderMessage(item)}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingVertical: Space.md }}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            onScroll={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              const isNearBottom = contentSize.height - contentOffset.y - layoutMeasurement.height < 150;
              setShowScrollToBottom(!isNearBottom);
            }}
            scrollEventThrottle={200}
          />
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubble-ellipses-outline" size={40} color={Colors.textMuted} />
            <Caption color={Colors.textMuted} style={styles.emptySubtitle}>Start the conversation</Caption>
          </View>
        )}

        <View style={styles.composerWrap}>
          {replyTo ? (
            <ReplyQuote
              senderName={replyTo.senderLabel ?? 'Unknown'}
              text={replyTo.text ?? ''}
              onClose={() => setReplyTo(null)}
            />
          ) : null}
          {reactingToMessage ? (
            <EmojiReactionsBar
              reactions={reactingToMessage.reactions ?? []}
              onReact={(emoji) => {
                if (reactingToMessage) {
                  addMessageReaction(conversationId, reactingToMessage.id, emoji);
                }
                setReactingToMessage(null);
              }}
              onShowMore={() => setReactingToMessage(null)}
            />
          ) : null}
          <ComposerInput
            value={input}
            onChangeText={setInput}
            onSend={sendMessage}
            placeholder="Message..."
            returnKeyType="send"
          />
        </View>
      </KeyboardAvoidingView>

      <ScrollToBottomFAB visible={showScrollToBottom} onPress={scrollToBottom} />

      <MessageContextMenu
        visible={contextMenuVisible}
        onClose={() => setContextMenuVisible(false)}
        onAction={(action) => {
          if (!selectedMessage) return;
          switch (action) {
            case 'copy': {
              Clipboard.setString(selectedMessage.text ?? '');
              show('Copied', 'success');
              break;
            }
            case 'reply':
              setReplyTo(selectedMessage);
              break;
            case 'select':
              enterSelectionMode(selectedMessage.id);
              break;
            case 'react':
              setReactingToMessage(selectedMessage);
              break;
            case 'forward':
              show('Forwarded: ' + (selectedMessage.text?.slice(0, 20) ?? ''), 'info');
              break;
            case 'delete':
              handleDeleteMessage(selectedMessage);
              break;
            default:
              break;
          }
        }}
        messageText={selectedMessage?.text ?? undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface + '80',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border + '60',
  },

  selectionToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },

  contextGallery: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemThumb: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    overflow: 'hidden',
  },
  itemThumbImage: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
  },
  itemInfo: {
    flex: 1,
    justifyContent: 'center',
  },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
  },
  emptySubtitle: {
    fontSize: Type.body.size,
  },

  dateWrap: {
    alignItems: 'center',
    marginVertical: Space.sm + 4,
  },
  datePill: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm + 4,
    paddingVertical: Space.xs + 2,
  },
  dateText: {
    fontSize: Type.meta.size,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  statusWrap: {
    marginVertical: Space.xs,
    paddingHorizontal: Space.md,
  },
  statusCard: {
    gap: Space.xs,
  },
  statusTitle: { marginBottom: Space.xs },
  statusBody: { lineHeight: 20 },
  statusLink: { marginTop: Space.sm },

  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    marginVertical: Space.xs,
  },
  msgRowRight: {
    flexDirection: 'row-reverse',
  },

  offerCard: {
    maxWidth: '72%',
    gap: Space.xs,
  },
  offerCardMe: {
    alignSelf: 'flex-end',
  },
  offerSender: {
    marginBottom: 2,
  },
  offerPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.sm,
  },
  offerPriceText: {
    fontSize: Type.price.size,
    fontFamily: 'Inter_700Bold',
    color: Colors.textPrimary,
  },
  strike: {
    textDecorationLine: 'line-through',
  },
  offerPill: {
    alignSelf: 'flex-start',
    marginTop: Space.xs,
  },
  offerActions: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.sm,
  },
  offerBtn: {
    flex: 1,
  },

  linkPreviewWrap: {
    maxWidth: '68%',
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  linkPreviewWrapRight: {
    alignSelf: 'flex-end',
  },

  selectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.sm,
  },
  selectionRowRight: {
    flexDirection: 'row-reverse',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: Radius.sm,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: Space.sm,
  },
  checkboxActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },

  composerWrap: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm + 4,
    paddingTop: Space.xs,
    backgroundColor: Colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
});
