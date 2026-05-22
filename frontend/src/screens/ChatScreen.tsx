import React, { useEffect, useMemo, useState } from 'react';
import { AnimatedPressable } from '../components/AnimatedPressable';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Share,
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
  createGroupInviteLinkOnApi,
  fetchConversationMessagesFromApi,
  sendConversationMessageOnApi,
} from '../services/chatApi';
import { useToast } from '../context/ToastContext';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { parseApiError } from '../lib/apiClient';
import { CachedImage } from '../components/CachedImage';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { AppButton } from '../components/ui/AppButton';
import { AppStatusPill } from '../components/ui/AppStatusPill';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptic } from '../hooks/useHaptic';
import { ChatHeader } from '../components/chat/ChatHeader';
import { ChatCard } from '../components/chat/ChatCard';
import { ComposerInput } from '../components/chat/ComposerInput';
import { MessageBubble } from '../components/chat/MessageBubble';
import { Space, Radius, Type } from '../theme/designTokens';
import { Typography } from '../constants/typography';
import { MessageContextMenu, MessageAction } from '../components/chat/MessageContextMenu';
import { EmojiReactionsBar, EmojiReaction, MessageReactionsSummary } from '../components/chat/EmojiReactionsBar';
import { ReplyQuote } from '../components/chat/ReplyQuote';
import { ScrollToBottomFAB } from '../components/chat/ScrollToBottomFAB';
import { NewMessagesSeparator } from '../components/chat/NewMessagesSeparator';
import { LinkPreviewCard, extractFirstUrl } from '../components/chat/LinkPreviewCard';
import { SkeletonChatLoader } from '../components/chat/SkeletonChatLoader';
import { MentionHighlight } from '../components/chat/MentionHighlight';
import * as Clipboard from 'expo-clipboard';
import { Meta, Caption, BodyEmphasis } from '../components/ui/Text';

type Props = StackScreenProps<RootStackParamList, 'Chat'>;

type MsgType = 'text' | 'offer' | 'offer_declined' | 'purchase_status';
type MessageFilterMode = 'all' | 'offers' | 'updates';

const MESSAGE_FILTERS: Array<{ value: MessageFilterMode; label: string; accessibilityLabel: string }> = [
  { value: 'all', label: 'All', accessibilityLabel: 'Show all messages' },
  { value: 'offers', label: 'Offers', accessibilityLabel: 'Show offer messages' },
  { value: 'updates', label: 'Updates', accessibilityLabel: 'Show status updates' },
];

const NOTIFICATION_MODES = ['All activity', 'Mentions only', 'Muted'];
const RETENTION_MODES = ['No auto-delete', '24 hours', '7 days', '30 days'];
const QUICK_COMPOSER_TEMPLATES = [
  'Is this still available?',
  'Can you share more photos?',
  'I can close today.',
  'Would you accept this offer?',
];

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

  if (!listing) {
    return (
      <View style={styles.contextGallery}>
        <ChatCard variant="elevated" style={styles.itemCard}>
          <View style={styles.itemThumb}>
            <Ionicons name="shirt-outline" size={24} color={Colors.textMuted} />
          </View>
          <View style={styles.itemInfo}>
            <BodyEmphasis>Simple striped shirt</BodyEmphasis>
            <Caption color={Colors.textSecondary}>{formatFromFiat(35, 'GBP', { displayMode: 'fiat' })}</Caption>
            <Caption color={Colors.brand}>{formatFromFiat(37.45, 'GBP', { displayMode: 'fiat' })} Includes platform charge</Caption>
          </View>
        </ChatCard>
      </View>
    );
  }

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
            {listing.priceWithProtection > listing.price ? (
              <Caption color={Colors.brand}>
                {formatFromFiat(listing.priceWithProtection, 'GBP', { displayMode: 'fiat' })} includes protection
              </Caption>
            ) : (
              <Caption color={Colors.brand}>Free shipping available</Caption>
            )}
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
  const { listings } = useBackendData();
  const conversations = useStore((state) => state.conversations);
  const bots = useStore((state) => state.availableChatBots);
  const appendConversationMessage = useStore((state) => state.appendConversationMessage);
  const replaceConversationMessages = useStore((state) => state.replaceConversationMessages);
  const markConversationRead = useStore((state) => state.markConversationRead);
  const setConversationDraft = useStore((state) => state.setConversationDraft);
  const addMessageReaction = useStore((state) => state.addMessageReaction);
  const removeMessageReaction = useStore((state) => state.removeMessageReaction);
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
  const [inboxFocusQuery, setInboxFocusQuery] = useState(route.params.focusQuery?.trim() ?? '');
  const [messageFilter, setMessageFilter] = useState<MessageFilterMode>('all');
  const [showControls, setShowControls] = useState(false);
  const [showNotificationPicker, setShowNotificationPicker] = useState(false);
  const [showRetentionPicker, setShowRetentionPicker] = useState(false);
  const [notificationMode, setNotificationMode] = useState('All activity');
  const [retentionMode, setRetentionMode] = useState('No auto-delete');
  const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(true);
  const [safetyGuardEnabled, setSafetyGuardEnabled] = useState(true);
  const [composerAssistEnabled, setComposerAssistEnabled] = useState(true);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [latestInviteLink, setLatestInviteLink] = useState<string | null>(null);
  const [latestInviteMeta, setLatestInviteMeta] = useState<string | null>(null);
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [contextMessage, setContextMessage] = useState<ConversationMessage | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reactingToMessage, setReactingToMessage] = useState<Message | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const [newMessagesIndex, setNewMessagesIndex] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const listRef = React.useRef<FlatList>(null);
  const { formatFromFiat } = useFormattedPrice();

  const messageTelemetry = useMemo(() => {
    const offerCount = messages.filter((item) => item.type === 'offer' || item.type === 'offer_declined').length;
    const systemUpdateCount = messages.filter((item) => item.type === 'purchase_status').length;
    const outgoingCount = messages.filter((item) => item.sender === 'me').length;

    return {
      offerCount,
      systemUpdateCount,
      outgoingCount,
      total: messages.length,
    };
  }, [messages]);

  const visibleMessages = useMemo(() => {
    const normalizedQuery = inboxFocusQuery.trim().toLowerCase();

    return messages.filter((item) => {
      if (messageFilter === 'offers' && item.type !== 'offer' && item.type !== 'offer_declined') {
        return false;
      }

      if (messageFilter === 'updates' && item.type !== 'purchase_status') {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [item.text ?? '', item.senderLabel ?? '']
        .some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [messageFilter, messages, inboxFocusQuery]);

  useEffect(() => {
    setMessages(hydratedMessages);
  }, [hydratedMessages]);

  useEffect(() => {
    setInboxFocusQuery(route.params.focusQuery?.trim() ?? '');
  }, [conversationId, route.params.focusQuery]);

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
        if (cancelled || !syncedMessages.length) {
          return;
        }

        replaceConversationMessages(conversationId, syncedMessages);
      } catch {
        // Keep local message timeline when backend sync is unavailable.
      } finally {
        if (!cancelled) {
          setIsSyncing(false);
        }
      }
    };

    void syncMessagesFromApi();

    return () => {
      cancelled = true;
    };
  }, [conversationId, replaceConversationMessages]);

  const resolvedPartnerId = useMemo(() => {
    if (isGroup) {
      return null;
    }

    if (route.params.partnerUserId) {
      return route.params.partnerUserId;
    }

    if (conversation?.sellerId) {
      return conversation.sellerId;
    }

    return conversation?.participantIds?.find((id) => id !== 'me' && id !== currentUser?.id) ?? null;
  }, [conversation?.participantIds, conversation?.sellerId, currentUser?.id, isGroup, route.params.partnerUserId]);

  const deployedBotIds = conversation?.botIds ?? [];
  const deployedBotNames = deployedBotIds
    .map((botId) => botLookup.get(botId))
    .filter((value): value is string => Boolean(value));
  const sellerUser = resolvedPartnerId
    ? mockArrayOrEmpty(MOCK_USERS).find((user) => user.id === resolvedPartnerId)
    : undefined;
  const sellerHandle = resolvedPartnerId
    ? userLookup.get(resolvedPartnerId) ?? sellerUser?.username ?? resolvedPartnerId
    : 'profile';
  const sellerLocation = sellerUser?.location ?? 'South Elmsall, UK';
  const sellerLastSeen = sellerUser?.lastSeen ?? '2h ago';
  const groupMemberLabels = (conversation?.participantIds ?? [])
    .map((participantId) => userLookup.get(participantId) ?? participantId)
    .slice(0, 4);

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

    if (safetyGuardEnabled && /seed phrase|private key|mnemonic|recovery phrase/i.test(trimmed)) {
      show('Sensitive credential phrase detected. Message blocked by safety guard.', 'error');
      haptic.error();
      return;
    }

    const outgoing: Message = {
      id: String(Date.now()),
      type: 'text',
      sender: 'me',
      senderLabel: currentUser?.username ?? 'you',
      text: trimmed,
    };

    pushMessage(outgoing);
    appendToConversationStore(outgoing, currentUser?.id ?? 'me');

    if (isGroup) {
      void sendConversationMessageOnApi(conversationId, trimmed).catch(() => {
        // Keep optimistic local message state when backend sync is temporarily unavailable.
      });
    }

    if (isGroup && trimmed.startsWith('/') && deployedBotIds.length > 0) {
      const botId = deployedBotIds[0];
      const botName = botLookup.get(botId) ?? 'Bot';
      const botReply: Message = {
        id: `${Date.now()}_bot`,
        type: 'text',
        sender: 'them',
        senderLabel: botName,
        text: `${botName}: command received (${trimmed}).`,
      };

      setTimeout(() => {
        pushMessage(botReply);
        appendToConversationStore(botReply, botId);
      }, 350);
    }

    setInput('');
  };

  const sendTemplateMessage = (template: string) => {
    haptic.light();
    setInput(template);
    show('Template inserted', 'info');
  };

  const handleExportConversationSummary = () => {
    haptic.light();
    const summary = `Total ${messageTelemetry.total} | Offers ${messageTelemetry.offerCount} | Updates ${messageTelemetry.systemUpdateCount}`;
    show(`Conversation summary ready: ${summary}`, 'success');
  };

  const handleClearVisibleTimeline = () => {
    if (!visibleMessages.length) {
      show('No messages to clear in this view', 'info');
      return;
    }

    haptic.medium();
    const visibleIds = new Set(visibleMessages.map((item) => item.id));
    setMessages((prev) => prev.filter((item) => !visibleIds.has(item.id)));
    show('Visible messages cleared from local view', 'info');
  };

  const handleAttachPhoto = () => {
    haptic.light();
    const photoMessage: Message = {
      id: String(Date.now()),
      type: 'text',
      sender: 'me',
      senderLabel: currentUser?.username ?? 'you',
      text: 'Sent a photo.',
    };
    pushMessage(photoMessage);
    appendToConversationStore(photoMessage, currentUser?.id ?? 'me');
  };

  const handleShareGroupInvite = async () => {
    if (!isGroup) {
      return;
    }

    setIsCreatingInvite(true);
    try {
      const invite = await createGroupInviteLinkOnApi(conversationId, {
        expiresInHours: 72,
        maxUses: 100,
      });

      setLatestInviteLink(invite.inviteLink);

      const expiryLabel = new Date(invite.expiresAt).toLocaleString();
      const usageLabel = invite.maxUses > 0
        ? `${invite.useCount}/${invite.maxUses} uses`
        : `${invite.useCount} uses`;
      setLatestInviteMeta(`${usageLabel} \u00b7 Expires ${expiryLabel}`);

      await Share.share({
        message: `Join ${conversation?.title ?? 'my group'} on Thryftverse: ${invite.inviteLink}`,
      });

      show('Invite link generated and ready to share.', 'success');
    } catch (error) {
      const parsedError = parseApiError(error, 'Unable to generate invite link right now.');
      show(parsedError.message, 'error');
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const handleAcceptOffer = (msgId: string) => {
    haptic.medium();
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, offer: { ...m.offer!, status: 'accepted' } } : m));
    navigation.navigate('Checkout', { itemId: '1' });
  };

  const handleDeclineOffer = (msgId: string) => {
    haptic.light();
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, offer: { ...m.offer!, status: 'declined' } } : m));
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
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
      }
      if (next.size === 0) {
        setSelectionMode(false);
      }
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
    show(`Deleted ${idsToDelete.size} message${idsToDelete.size === 1 ? '' : 's'}`, 'info');
    exitSelectionMode();
  };

  const renderMessage = (msg: Message) => {
    const layoutAnimation = reducedMotionEnabled ? undefined : Layout.springify();

    if (msg.date) {
      return (
        <Reanimated.View
          key={msg.id + '_date'}
          entering={reducedMotionEnabled ? undefined : FadeIn}
          layout={layoutAnimation}
          style={styles.dateLabel}
        >
          <Caption color={Colors.textMuted} style={styles.dateLabelText}>{msg.date}</Caption>
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
          style={styles.statusBlockWrap}
        >
          <ChatCard variant="surface">
            <BodyEmphasis style={styles.statusTitle}>{lines[0]}</BodyEmphasis>
            <Caption color={Colors.textSecondary} style={styles.statusBody}>{lines.slice(1).join('\n')}</Caption>
            <AnimatedPressable
              onPress={() => navigation.navigate('OrderDetail', { orderId: CHAT_ORDER_ID })}
              accessibilityRole="button"
              accessibilityLabel="Open tracking information"
              accessibilityHint="Opens the related order details and shipment tracking"
              activeOpacity={0.7}
              scaleValue={0.98}
              hapticFeedback="light"
            >
              <Caption color={Colors.brand} style={styles.accentLink}>Tracking information</Caption>
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
          <ChatCard variant={isMe ? 'tint' : 'surface'} style={[styles.offerBubble, isMe && styles.offerBubbleMe]}>
            {isGroup && !isMe && msg.senderLabel ? (
              <Meta color={Colors.textMuted} style={styles.groupSenderLabel}>{msg.senderLabel}</Meta>
            ) : null}
            <View style={styles.offerTextRow}>
              <Text style={styles.offerPrice}>{formatFromFiat(msg.offer!.price, 'GBP', { displayMode: 'fiat' })}</Text>
              <Caption color={Colors.textMuted} style={styles.offerOriginal}>
                <Text style={styles.strikethrough}>{formatFromFiat(msg.offer!.originalPrice, 'GBP', { displayMode: 'fiat' })}</Text>
              </Caption>
            </View>

            {/* Context / Status */}
            {offerStatus === 'declined' && (
              <AppStatusPill
                style={styles.offerStatusPill}
                tone="negative"
                iconName="close-circle-outline"
                label="Declined"
              />
            )}
            {offerStatus === 'accepted' && (
              <AppStatusPill
                style={styles.offerStatusPill}
                tone="positive"
                iconName="checkmark-circle-outline"
                label="Accepted"
              />
            )}
            {!offerStatus && isMe && (
              <AppStatusPill
                style={styles.offerStatusPill}
                tone="neutral"
                iconName="time-outline"
                label="Waiting for response"
              />
            )}

            {/* Interactive Buttons for Inbound Offers */}
            {!isMe && !offerStatus && (
              <View style={styles.offerActionRow}>
                <AppButton
                  style={styles.offerDeclineBtn}
                  variant="secondary"
                  size="sm"
                  align="center"
                  icon={<Ionicons name="close-outline" size={15} color={Colors.textPrimary} />}
                  iconContainerStyle={styles.actionIconWrap}
                  title="Pass"
                  titleStyle={styles.offerDeclineText}
                  onPress={() => handleDeclineOffer(msg.id)}
                  accessibilityLabel="Decline incoming offer"
                />
                <AppButton
                  style={styles.offerAcceptBtn}
                  variant="primary"
                  size="sm"
                  align="center"
                  icon={<Ionicons name="flash-outline" size={15} color={Colors.background} />}
                  iconContainerStyle={styles.actionIconWrap}
                  title="Accept offer"
                  titleStyle={styles.offerAcceptText}
                  onPress={() => handleAcceptOffer(msg.id)}
                  accessibilityLabel="Accept incoming offer"
                  accessibilityHint="Accepts this offer and opens checkout flow."
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
            style={[
              styles.selectionCheckbox,
              selectedMessageIds.has(msg.id) && styles.selectionCheckboxActive,
            ]}
            onPress={() => toggleMessageSelection(msg.id)}
            activeOpacity={0.7}
            hapticFeedback="light"
          >
            {selectedMessageIds.has(msg.id) ? (
              <Ionicons name="checkmark" size={16} color={Colors.textInverse} />
            ) : null}
          </AnimatedPressable>
        ) : null}
        <Reanimated.View
          key={msg.id}
          entering={
            reducedMotionEnabled
              ? undefined
              : isMe
                ? SlideInRight.springify()
                : SlideInLeft.springify()
          }
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

  const scrollToBottom = () => {
    listRef.current?.scrollToEnd({ animated: true });
    setShowScrollToBottom(false);
  };

  const handleDeleteMessage = (msg: Message) => {
    haptic.medium();
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    show('Message deleted', 'info');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      <ChatHeader
        variant={isGroup ? 'group' : 'dm'}
        onBack={() => navigation.goBack()}
        title={isGroup ? (conversation?.title ?? 'Group chat') : `@${sellerHandle}`}
        subtitle={
          isGroup
            ? `${conversation?.participantIds?.length ?? 0} members`
            : `${sellerLocation} | Last seen ${sellerLastSeen}`
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
              accessibilityLabel="Open group bot directory"
              accessibilityHint="Manage bots available in this group chat"
              activeOpacity={0.7}
              scaleValue={0.9}
              hapticFeedback="light"
            >
              <Ionicons name="hardware-chip-outline" size={22} color={Colors.textPrimary} />
            </AnimatedPressable>
          ) : (
            <AnimatedPressable
              style={styles.headerIconBtn}
              onPress={() => setShowControls((prev) => !prev)}
              accessibilityRole="button"
              accessibilityLabel={showControls ? 'Hide conversation tools' : 'Show conversation tools'}
              accessibilityHint="Shows or hides conversation-level controls"
              activeOpacity={0.7}
              scaleValue={0.9}
              hapticFeedback="light"
            >
              <Ionicons name={showControls ? 'close-outline' : 'information-circle-outline'} size={24} color={Colors.textPrimary} />
            </AnimatedPressable>
          )
        }
      />

      {selectionMode ? (
        <View style={styles.selectionToolbar}>
          <AnimatedPressable
            onPress={exitSelectionMode}
            activeOpacity={0.7}
            scaleValue={0.92}
            hapticFeedback="light"
          >
            <Ionicons name="close-outline" size={24} color={Colors.textPrimary} />
          </AnimatedPressable>
          <Caption color={Colors.textMuted}>
            {selectedMessageIds.size} selected
          </Caption>
          <AnimatedPressable
            onPress={handleBulkDelete}
            activeOpacity={0.7}
            scaleValue={0.92}
            hapticFeedback="medium"
            accessibilityLabel="Delete selected messages"
          >
            <Ionicons name="trash-outline" size={22} color={Colors.danger} />
          </AnimatedPressable>
        </View>
      ) : null}

      <View style={styles.primaryFilterWrap}>
        <AppSegmentControl
          style={styles.opsFilterStrip}
          options={MESSAGE_FILTERS}
          value={messageFilter}
          onChange={setMessageFilter}
          fullWidth
          optionStyle={styles.opsFilterChip}
          optionActiveStyle={styles.opsFilterChipActive}
          optionTextStyle={styles.opsFilterChipText}
          optionTextActiveStyle={styles.opsFilterChipTextActive}
        />
      </View>

      {/* Floating Context Cards (No Dividers) */}
      {isGroup ? (
        <View style={styles.contextGallery}>
          <ChatCard variant="elevated" style={styles.groupSummaryCard}>
            <View style={styles.itemThumb}>
              <Ionicons name="people-outline" size={24} color={Colors.textMuted} />
            </View>
            <View style={styles.itemInfo}>
              <BodyEmphasis>{conversation?.title ?? 'Group chat'}</BodyEmphasis>
              <Caption color={Colors.textSecondary}>{(conversation?.participantIds?.length ?? 0)} members</Caption>
              <Caption color={Colors.textSecondary}>
                {groupMemberLabels.length ? `Members: ${groupMemberLabels.join(', ')}` : 'No members yet'}
              </Caption>
            </View>
          </ChatCard>

          <ChatCard variant="surface">
            <Meta color={Colors.textMuted} style={styles.groupBotLabel}>DEPLOYED BOTS</Meta>
            {deployedBotNames.length ? (
              <View style={styles.groupBotChipWrap}>
                {deployedBotNames.map((botName) => (
                  <View key={botName} style={styles.groupBotChip}>
                    <Caption color={Colors.textPrimary} style={styles.groupBotChipText}>{botName}</Caption>
                  </View>
                ))}
              </View>
            ) : (
              <Caption color={Colors.textMuted}>No bots deployed yet.</Caption>
            )}

            <View style={styles.groupInviteRow}>
              <Meta color={Colors.textMuted} style={styles.groupInviteLabel}>INVITES</Meta>
              <AnimatedPressable
                style={[styles.groupInviteBtn, isCreatingInvite && styles.groupInviteBtnDisabled]}
                onPress={() => {
                  void handleShareGroupInvite();
                }}
                activeOpacity={0.85}
                disabled={isCreatingInvite}
                accessibilityRole="button"
                accessibilityLabel={isCreatingInvite ? 'Creating invite link' : 'Share invite link'}
                accessibilityHint="Generates and shares a new group invite link"
              >
                <Ionicons name="share-social-outline" size={14} color={Colors.textPrimary} />
                <Caption color={Colors.textPrimary} style={styles.groupInviteBtnText}>
                  {isCreatingInvite ? 'Creating...' : 'Share Invite Link'}
                </Caption>
              </AnimatedPressable>
            </View>

            {latestInviteLink ? <Caption color={Colors.textPrimary}>{latestInviteLink}</Caption> : null}
            {latestInviteMeta ? <Caption color={Colors.textMuted}>{latestInviteMeta}</Caption> : null}
          </ChatCard>
        </View>
      ) : (
        <TaggedItemCard
          itemId={routeItemId}
          navigation={navigation}
          formatFromFiat={formatFromFiat}
        />
      )}

      <View style={styles.opsContainer}>
        {inboxFocusQuery ? (
          <ChatCard variant="surface" style={styles.inboxScopeCard}>
            <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
            <View style={styles.inboxScopeCopy}>
              <Meta color={Colors.textMuted}>Inbox search scope</Meta>
              <Caption color={Colors.textPrimary} numberOfLines={1}>{inboxFocusQuery}</Caption>
            </View>
            <AnimatedPressable
              style={styles.inboxScopeClearBtn}
              onPress={() => setInboxFocusQuery('')}
              accessibilityRole="button"
              accessibilityLabel="Clear inbox search scope"
              accessibilityHint="Shows the full conversation again"
              activeOpacity={0.7}
              scaleValue={0.9}
              hapticFeedback="light"
            >
              <Caption color={Colors.textPrimary} style={styles.inboxScopeClearText}>Clear</Caption>
            </AnimatedPressable>
          </ChatCard>
        ) : (
          <Caption color={Colors.textMuted} style={styles.inboxScopeHelper}>
            Use Inbox search to scan across all conversations. Filters here apply only to this thread.
          </Caption>
        )}

        <View style={styles.opsCommandRow}>
          <ChatCard variant="surface" style={styles.opsSummaryCard}>
            <Ionicons name="analytics-outline" size={16} color={Colors.textMuted} />
            <View style={styles.opsSummaryBody}>
              <Meta color={Colors.textMuted}>Conversation overview</Meta>
              <Caption color={Colors.textPrimary}>
                {messageTelemetry.total} msgs | {messageTelemetry.offerCount} offers | {messageTelemetry.systemUpdateCount} updates
              </Caption>
            </View>
          </ChatCard>
        </View>

        {showControls ? (
          <ChatCard variant="surface">
            <View style={styles.controlRow}>
              <View>
                <Meta color={Colors.textMuted}>Notification Scope</Meta>
                <Caption color={Colors.textPrimary} style={styles.controlValue}>{notificationMode}</Caption>
              </View>
              <AnimatedPressable
                style={styles.controlPickerBtn}
                onPress={() => setShowNotificationPicker(true)}
                accessibilityRole="button"
                accessibilityLabel="Change notification scope"
                accessibilityHint="Opens notification options"
                activeOpacity={0.7}
                scaleValue={0.95}
                hapticFeedback="light"
              >
                <Caption color={Colors.textPrimary} style={styles.controlPickerText}>Change</Caption>
              </AnimatedPressable>
            </View>

            <View style={styles.controlRow}>
              <View>
                <Meta color={Colors.textMuted}>Retention Policy</Meta>
                <Caption color={Colors.textPrimary} style={styles.controlValue}>{retentionMode}</Caption>
              </View>
              <AnimatedPressable
                style={styles.controlPickerBtn}
                onPress={() => setShowRetentionPicker(true)}
                accessibilityRole="button"
                accessibilityLabel="Adjust retention policy"
                accessibilityHint="Opens message retention options"
                activeOpacity={0.7}
                scaleValue={0.95}
                hapticFeedback="light"
              >
                <Caption color={Colors.textPrimary} style={styles.controlPickerText}>Adjust</Caption>
              </AnimatedPressable>
            </View>

            <View style={styles.switchRow}>
              <Caption color={Colors.textPrimary} style={styles.switchLabel}>Read Receipts</Caption>
              <Switch
                value={readReceiptsEnabled}
                onValueChange={setReadReceiptsEnabled}
                trackColor={{ false: Colors.border, true: Colors.brand }}
                thumbColor={readReceiptsEnabled ? Colors.background : Colors.surfaceAlt}
              />
            </View>

            <View style={styles.switchRow}>
              <Caption color={Colors.textPrimary} style={styles.switchLabel}>Credential Safety Guard</Caption>
              <Switch
                value={safetyGuardEnabled}
                onValueChange={setSafetyGuardEnabled}
                trackColor={{ false: Colors.border, true: Colors.brand }}
                thumbColor={safetyGuardEnabled ? Colors.background : Colors.surfaceAlt}
              />
            </View>

            <View style={styles.switchRow}>
              <Caption color={Colors.textPrimary} style={styles.switchLabel}>Composer Assist</Caption>
              <Switch
                value={composerAssistEnabled}
                onValueChange={setComposerAssistEnabled}
                trackColor={{ false: Colors.border, true: Colors.brand }}
                thumbColor={composerAssistEnabled ? Colors.background : Colors.surfaceAlt}
              />
            </View>

            <View style={styles.controlActionRow}>
              <AppButton
                style={styles.secondaryControlBtn}
                variant="secondary"
                size="sm"
                align="center"
                icon={<Ionicons name="document-text-outline" size={16} color={Colors.textPrimary} />}
                iconContainerStyle={styles.actionIconWrap}
                title="Export Summary"
                titleStyle={styles.secondaryControlText}
                onPress={handleExportConversationSummary}
                accessibilityLabel="Export conversation summary"
              />
              <AppButton
                style={styles.secondaryControlBtn}
                variant="secondary"
                size="sm"
                align="center"
                icon={<Ionicons name="trash-outline" size={16} color={Colors.textPrimary} />}
                iconContainerStyle={styles.actionIconWrap}
                title="Clear Visible"
                titleStyle={styles.secondaryControlText}
                onPress={handleClearVisibleTimeline}
                accessibilityLabel="Clear visible messages"
              />
            </View>
          </ChatCard>
        ) : null}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {isSyncing ? (
          <SkeletonChatLoader count={6} />
        ) : visibleMessages.length ? (
          <FlatList
            ref={listRef}
            data={visibleMessages}
            renderItem={({ item }) => renderMessage(item)}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingVertical: Space.sm }}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            onScroll={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              const isNearBottom = contentSize.height - contentOffset.y - layoutMeasurement.height < 120;
              setShowScrollToBottom(!isNearBottom);
            }}
            scrollEventThrottle={200}
          />
        ) : (
          <View style={styles.emptySearchState}>
            <Ionicons name="search-outline" size={24} color={Colors.textMuted} />
            <BodyEmphasis style={styles.emptySearchTitle}>No messages in this scope</BodyEmphasis>
            <Caption color={Colors.textMuted} style={styles.emptySearchSubtitle}>
              {inboxFocusQuery
                ? 'No timeline entries matched your Inbox search scope. Clear scope to view the full thread.'
                : 'Try another filter.'}
            </Caption>
          </View>
        )}

        {/* Floating Input Row */}
        <View style={styles.inputContainer}>
          {composerAssistEnabled ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templateStrip}>
              {QUICK_COMPOSER_TEMPLATES.map((template) => (
                <AnimatedPressable
                  key={template}
                  style={styles.templateChip}
                  onPress={() => sendTemplateMessage(template)}
                  activeOpacity={0.85}
                  scaleValue={0.95}
                  hapticFeedback="light"
                >
                  <Caption color={Colors.textPrimary} style={styles.templateChipText}>{template}</Caption>
                </AnimatedPressable>
              ))}
            </ScrollView>
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

          {replyTo ? (
            <ReplyQuote
              senderName={replyTo.senderLabel ?? 'Unknown'}
              text={replyTo.text ?? ''}
              onClose={() => setReplyTo(null)}
            />
          ) : null}
          <ComposerInput
            value={input}
            onChangeText={setInput}
            onSend={sendMessage}
            onCameraPress={handleAttachPhoto}
            placeholder="Write a message..."
            returnKeyType="send"
          />
        </View>
      </KeyboardAvoidingView>

      <ScrollToBottomFAB visible={showScrollToBottom} onPress={scrollToBottom} />
      <BottomSheetPicker
        visible={showNotificationPicker}
        onClose={() => setShowNotificationPicker(false)}
        title="Notification Scope"
        options={NOTIFICATION_MODES}
        selectedValue={notificationMode}
        onSelect={(value) => {
          setNotificationMode(value);
          show(`Notification scope set to ${value}`, 'success');
        }}
      />

      <BottomSheetPicker
        visible={showRetentionPicker}
        onClose={() => setShowRetentionPicker(false)}
        title="Retention Policy"
        options={RETENTION_MODES}
        selectedValue={retentionMode}
        onSelect={(value) => {
          setRetentionMode(value);
          show(`Retention policy set to ${value}`, 'info');
        }}
      />
          <MessageContextMenu
        visible={contextMenuVisible}
        onClose={() => setContextMenuVisible(false)}
        onAction={(action) => {
          if (!selectedMessage) return;
          switch (action) {
            case 'copy': {
              const text = selectedMessage.text ?? '';
              Clipboard.setString(text);
              show('Copied to clipboard', 'success');
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
              show(`Forwarded: ${selectedMessage.text?.slice(0, 20) ?? ''}`, 'info');
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
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  primaryFilterWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm + 4,
    paddingBottom: Space.xs,
  },

  contextGallery: {
    paddingHorizontal: Space.md,
    gap: Space.sm + 4,
    paddingBottom: Space.md,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 6,
  },
  groupSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 6,
  },
  groupBotRow: {
    gap: Space.sm,
    paddingHorizontal: Space.md - 2,
    paddingVertical: Space.sm + 2,
  },
  groupBotLabel: {
    marginBottom: Space.xs,
  },
  groupBotChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs + 4,
  },
  groupBotChip: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 2,
  },
  groupBotChipText: {
    fontFamily: 'Inter_600SemiBold',
  },
  groupInviteRow: {
    marginTop: Space.sm + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm + 2,
  },
  groupInviteLabel: {
    marginBottom: Space.xs,
  },
  groupInviteBtn: {
    borderRadius: Radius.md + 2,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: Space.sm + 2,
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
  },
  groupInviteBtnDisabled: {
    opacity: 0.5,
  },
  groupInviteBtnText: {
    fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase',
  },
  itemThumb: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg + 4,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  itemThumbImage: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg + 4,
  },
  itemInfo: { flex: 1 },

  opsContainer: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm + 4,
    gap: Space.sm + 2,
  },
  inboxScopeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.sm,
  },
  inboxScopeCopy: {
    flex: 1,
    gap: 2,
  },
  inboxScopeClearBtn: {
    height: 28,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: Space.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inboxScopeClearText: {
    fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase',
  },
  inboxScopeHelper: {
    marginTop: Space.xs,
  },
  opsCommandRow: {
    flexDirection: 'row',
    gap: Space.sm + 2,
  },
  opsSummaryCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.sm,
  },
  opsSummaryBody: {
    flex: 1,
  },
  opsSummaryLabel: {
    marginBottom: 2,
  },
  opsFilterStrip: {
    marginTop: 0,
  },
  opsFilterChip: {
    height: 30,
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm + 4,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  opsFilterChipActive: {
    borderColor: Colors.brand,
    backgroundColor: Colors.brand,
  },
  opsFilterChipText: {
    color: Colors.textMuted,
    fontSize: Type.meta.size,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  opsFilterChipTextActive: {
    color: Colors.background,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: Space.sm,
    paddingTop: Space.xs + 2,
  },
  controlTitle: {
    marginBottom: 2,
  },
  controlValue: {
    fontFamily: 'Inter_700Bold',
  },
  controlPickerBtn: {
    height: 30,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Space.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceAlt,
  },
  controlPickerText: {
    fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  switchLabel: {
    fontFamily: 'Inter_600SemiBold',
  },
  controlActionRow: {
    flexDirection: 'row',
    gap: Space.sm + 2,
    paddingTop: Space.sm,
  },
  secondaryControlBtn: {
    flex: 1,
    height: 38,
    borderRadius: Radius.full,
    backgroundColor: 'transparent',
  },
  actionIconWrap: {
    width: 18,
    height: 18,
    borderRadius: Radius.sm,
    backgroundColor: 'transparent',
  },
  secondaryControlText: {
    color: Colors.textPrimary,
    fontSize: Type.meta.size,
    fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase',
  },

  messageList: { flex: 1 },
  emptySearchState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xl + 8,
    gap: Space.xs + 2,
  },
  emptySearchTitle: {
    color: Colors.textPrimary,
  },
  emptySearchSubtitle: {
    color: Colors.textMuted,
  },
  dateLabel: { alignItems: 'center', marginVertical: Space.sm + 4 },
  dateLabelText: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  statusBlockWrap: {
    marginVertical: Space.xs + 4,
    paddingHorizontal: Space.md,
  },
  statusTitle: { marginBottom: Space.xs + 4 },
  statusBody: { lineHeight: 22 },
  accentLink: { marginTop: Space.sm + 4 },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Space.sm + 2 },
  msgRowRight: { flexDirection: 'row-reverse' },

  linkPreviewWrap: {
    marginTop: Space.xs,
    marginHorizontal: Space.md,
    maxWidth: '80%',
    alignSelf: 'flex-start',
  },
  linkPreviewWrapRight: {
    alignSelf: 'flex-end',
  },

  textBubble: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.xl,
    borderBottomLeftRadius: Space.xs,
    paddingHorizontal: Space.md - 2,
    paddingVertical: Space.sm + 2,
    maxWidth: '80%',
  },
  textBubbleMe: {
    backgroundColor: Colors.brand,
    borderBottomLeftRadius: Radius.xl,
    borderBottomRightRadius: Space.xs,
  },
  bubbleText: { fontSize: Type.body.size, fontFamily: 'Inter_500Medium', color: Colors.textPrimary, lineHeight: 22 },
  bubbleTextMe: { color: Colors.textInverse },
  groupSenderLabel: {
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  offerBubble: {
    borderRadius: Radius.xl,
    borderBottomLeftRadius: Space.xs,
    padding: Space.md + 4,
    maxWidth: '85%',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  offerBubbleMe: { borderBottomLeftRadius: Radius.xl, borderBottomRightRadius: Space.xs },
  offerTextRow: { flexDirection: 'row', alignItems: 'baseline', gap: Space.sm + 2, marginBottom: 4 },
  offerPrice: { fontSize: Type.priceLarge.size, fontFamily: 'Inter_700Bold', color: Colors.textPrimary, letterSpacing: -1 },
  offerOriginal: { fontSize: Type.caption.size, fontFamily: 'Inter_500Medium', color: Colors.textMuted },
  strikethrough: { textDecorationLine: 'line-through' },

  offerStatusPill: {
    marginTop: Space.xs + 4,
    alignSelf: 'flex-start',
  },

  offerActionRow: {
    flexDirection: 'row',
    gap: Space.sm + 2,
    marginTop: Space.sm + 6,
  },
  offerDeclineBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.lg + 4,
    backgroundColor: 'transparent',
  },
  offerDeclineText: { color: Colors.textPrimary, fontSize: Type.meta.size, fontFamily: 'Inter_700Bold', letterSpacing: 0.2 },
  offerAcceptBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.lg + 4,
    backgroundColor: 'transparent',
  },
  offerAcceptText: { color: Colors.textInverse, fontSize: Type.meta.size, fontFamily: 'Inter_700Bold', letterSpacing: 0.2 },

  inputContainer: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    paddingBottom: Platform.OS === 'ios' ? Space.xl + 2 : Space.md + 4,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  templateStrip: {
    gap: Space.xs + 4,
    paddingBottom: Space.sm + 2,
    paddingRight: Space.xs,
  },
  templateChip: {
    height: 30,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.sm + 4,
  },
  templateChipText: {
    fontFamily: 'Inter_600SemiBold',
  },
  selectionToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  selectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
  },
  selectionRowRight: {
    flexDirection: 'row-reverse',
  },
  selectionCheckbox: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionCheckboxActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
});
