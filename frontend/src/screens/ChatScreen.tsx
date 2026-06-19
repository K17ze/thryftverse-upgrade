import React, { useEffect, useMemo, useRef, useState } from 'react';

import { AnimatedPressable } from '../components/AnimatedPressable';

import {

  View,

  Text,

  StyleSheet,

  Platform,

  FlatList,

  ActivityIndicator,

  Alert,

  Share,

} from 'react-native';


import Reanimated from 'react-native-reanimated';

import { Ionicons } from '@expo/vector-icons';

import NetInfo from '@react-native-community/netinfo';

import { AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StackScreenProps } from '@react-navigation/stack';

import { RootStackParamList } from '../navigation/types';

import { Colors } from '../constants/colors';

import { TypeStyles } from '../theme/designTokens';

import { useFormattedPrice } from '../hooks/useFormattedPrice';

import type { Message as ConversationMessage } from '../data/mockData';

import { useBackendData } from '../context/BackendDataContext';

import { getListingCoverUri, isVideoUri } from '../utils/media';

import { useStore } from '../store/useStore';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';

import {

  fetchConversationMessagesFromApi,

  sendConversationMessageOnApi,

  deleteConversationMessageOnApi,

} from '../services/chatApi';

import { useToast } from '../context/ToastContext';

import { CachedImage } from '../components/CachedImage';

import { AppStatusPill } from '../components/ui/AppStatusPill';

import { AppSearchBar } from '../components/ui/AppSearchBar';

import { useHaptic } from '../hooks/useHaptic';


import { ChatComposerBar } from '../components/chat/ChatComposerBar';

import { MessageBubble } from '../components/chat/MessageBubble';

import { MarketplaceChatCard } from '../components/chat/MarketplaceChatCard';

import { ChatActionSheet, ChatAction } from '../components/chat/ChatActionSheet';

import { Space, Radius, Type, Elevation } from '../theme/designTokens';

import { MessageContextMenu } from '../components/chat/MessageContextMenu';

import { EmojiReactionsBar } from '../components/chat/EmojiReactionsBar';

import { ReplyQuote } from '../components/chat/ReplyQuote';

import { ScrollToBottomFAB } from '../components/chat/ScrollToBottomFAB';

import { LinkPreviewCard, extractFirstUrl } from '../components/chat/LinkPreviewCard';

import { SkeletonChatLoader } from '../components/chat/SkeletonChatLoader';

import * as Clipboard from 'expo-clipboard';

import * as ImagePicker from 'expo-image-picker';

import { Meta, Caption, BodyEmphasis } from '../components/ui/Text';



type Props = StackScreenProps<RootStackParamList, 'Chat'>;



type MsgType = 'text' | 'offer' | 'offer_declined' | 'purchase_status' | 'media';



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

  mediaUri?: string;

  mediaType?: 'image' | 'video';

  uploadStatus?: 'uploading' | 'failed' | 'sent';

  status?: 'sending' | 'sent' | 'failed';

}



const INITIAL_MESSAGES: Message[] = [];



function TaggedItemCard({
  itemId,
  navigation,
  formatFromFiat,
  currentUserId,
}: {
  itemId?: string;
  navigation: any;
  formatFromFiat: any;
  currentUserId?: string | null;
}) {

  const { show } = useToast();
  const { listings } = useBackendData();

  const listing = useMemo(() => {

    if (!itemId) return null;

    return listings.find((l) => l.id === itemId) || null;

  }, [itemId, listings]);



  if (!listing) return null;

  const isOwner = listing.sellerId === currentUserId;
  const isSold = !!listing.isSold;

  const handleShareListing = async () => {
    try {
      await Share.share({ message: `Check out "${listing.title}" on ThryftVerse` });
    } catch {
      await Clipboard.setStringAsync(`ThryftVerse listing: ${listing.title}`);
      show('Listing link copied to clipboard', 'success');
    }
  };

  return (

    <View style={styles.contextGallery}>

      <AnimatedPressable

        style={styles.itemCard}

        onPress={() => navigation.navigate('ItemDetail', { itemId: listing.id })}

        activeOpacity={0.85}

        scaleValue={0.98}

        hapticFeedback="light"

        accessibilityLabel="View listing"
        accessibilityRole="button"
      >

        <View style={[styles.itemCardRow, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>

          <CachedImage

            uri={getListingCoverUri(listing.images, '')}

            style={styles.itemThumbImage}

            containerStyle={styles.itemThumb}

            contentFit="cover"

          />

          <View style={styles.itemInfo}>

            <BodyEmphasis numberOfLines={1}>{listing.title}</BodyEmphasis>

            <Caption color={Colors.textSecondary}>{formatFromFiat(listing.price, 'GBP', { displayMode: 'fiat' })}</Caption>

            {listing.condition && (
              <View style={styles.itemMetaRow}>
                <Caption color={Colors.textMuted}>{listing.condition}</Caption>
                {listing.brand && <Caption color={Colors.textMuted}> · {listing.brand}</Caption>}
              </View>
            )}

          </View>

          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />

        </View>

        {/* Quick actions — gated by ownership and status */}
        <View style={styles.itemQuickActions}>
          {isOwner ? (
            <AnimatedPressable
              style={styles.itemQuickBtn}
              onPress={() => navigation.navigate('ManageListing', { itemId: listing.id })}
              activeOpacity={0.8}
              scaleValue={0.95}
              hapticFeedback="light"
              accessibilityLabel="Manage listing"
            >
              <Ionicons name="settings-outline" size={14} color={Colors.brand} />
              <Caption color={Colors.brand} style={styles.itemQuickText}>Manage</Caption>
            </AnimatedPressable>
          ) : isSold ? (
            <View style={styles.itemQuickBtn}>
              <Ionicons name="bag-check-outline" size={14} color={Colors.textMuted} />
              <Caption color={Colors.textMuted} style={styles.itemQuickText}>Sold</Caption>
            </View>
          ) : (
            <>
              <AnimatedPressable
                style={styles.itemQuickBtn}
                onPress={() => navigation.navigate('Checkout', { itemId: listing.id })}
                activeOpacity={0.8}
                scaleValue={0.95}
                hapticFeedback="light"
                accessibilityLabel="Buy now"
              >
                <Ionicons name="flash-outline" size={14} color={Colors.brand} />
                <Caption color={Colors.brand} style={styles.itemQuickText}>Buy</Caption>
              </AnimatedPressable>
              <AnimatedPressable
                style={styles.itemQuickBtn}
                onPress={() => navigation.navigate('MakeOffer', { itemId: listing.id, price: listing.price, title: listing.title })}
                activeOpacity={0.8}
                scaleValue={0.95}
                hapticFeedback="light"
                accessibilityLabel="Make offer"
              >
                <Ionicons name="chatbubbles-outline" size={14} color={Colors.textPrimary} />
                <Caption color={Colors.textPrimary} style={styles.itemQuickText}>Offer</Caption>
              </AnimatedPressable>
            </>
          )}
          <AnimatedPressable
            style={styles.itemQuickBtn}
            onPress={handleShareListing}
            activeOpacity={0.8}
            scaleValue={0.95}
            hapticFeedback="light"
            accessibilityLabel="Share listing"
            accessibilityRole="button"
          >
            <Ionicons name="share-outline" size={14} color={Colors.textSecondary} />
            <Caption color={Colors.textSecondary} style={styles.itemQuickText}>Share</Caption>
          </AnimatedPressable>
          {!isOwner && (
            <AnimatedPressable
              style={styles.itemQuickBtn}
              onPress={() => navigation.navigate('Report', { type: 'item' })}
              activeOpacity={0.8}
              scaleValue={0.95}
              hapticFeedback="light"
              accessibilityLabel="Report listing"
              accessibilityRole="button"
            >
              <Ionicons name="flag-outline" size={14} color={Colors.danger} />
              <Caption color={Colors.danger} style={styles.itemQuickText}>Report</Caption>
            </AnimatedPressable>
          )}
        </View>

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

  const insets = useSafeAreaInsets();

  const conversation = useMemo(

    () => conversations.find((item) => item.id === conversationId),

    [conversationId, conversations]

  );

  const isGroup = conversation?.type === 'group';



  const botLookup = useMemo(() => {

    const map = new Map<string, string>();

    for (const bot of bots) {

      map.set(bot.id, bot.name);

    }

    return map;

  }, [bots]);



  const userLookup = useMemo(() => {

    const map = new Map<string, string>();

    map.set('me', currentUser?.username ?? 'you');

    if (currentUser?.id) {

      map.set(currentUser.id, currentUser.username);

    }

    return map;

  }, [currentUser?.id, currentUser?.username]);



  const profileMediaOverrides = useStore((state) => state.profileMediaOverrides);



  const hydratedMessages = useMemo<Message[]>(() => {

    if (!conversation?.messages.length) {

      return [];

    }

    return conversation.messages.map((entry) => {

      const resolvedSenderId = entry.senderId;

      const isCurrentUserSender = resolvedSenderId === 'me' || resolvedSenderId === currentUser?.id;

      const sender: 'me' | 'them' = isCurrentUserSender ? 'me' : 'them';

      const senderLabel = botLookup.get(resolvedSenderId)

        ?? userLookup.get(resolvedSenderId)

        ?? (resolvedSenderId === 'system' ? 'System' : 'Thryft user');



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

        type: entry.mediaUri ? 'media' : 'text',

        sender,

        senderLabel,

        text: entry.text ?? entry.systemTitle ?? '',

        date: entry.timestamp,

        reactions: entry.reactions?.map((r) => ({

          emoji: r.emoji,

          count: r.userIds.length,

          reactedByMe: r.userIds.includes(currentUser?.id ?? 'me'),

        })),

        mediaUri: entry.mediaUri,

        mediaType: entry.mediaType,

        uploadStatus: entry.uploadStatus,

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

  const [attachmentPickerVisible, setAttachmentPickerVisible] = useState(false);

  const [recentlyDeleted, setRecentlyDeleted] = useState<Message[]>([]);

  const undoTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const deleteApiStatusRef = useRef<'pending' | 'success' | 'error'>('pending');

  const wasOfflineRef = useRef(false);

  const [searchQuery, setSearchQuery] = useState(route.params?.focusQuery ?? '');

  const [searchMatchIndex, setSearchMatchIndex] = useState(0);

  const [isSearchActive, setIsSearchActive] = useState(!!route.params?.focusQuery);

  const [isOffline, setIsOffline] = useState(false);

  const [composerSending, setComposerSending] = useState(false);

  const listRef = React.useRef<FlatList>(null);

  const { formatFromFiat } = useFormattedPrice();



  useEffect(() => {

    const unsubscribe = NetInfo.addEventListener((state: { isConnected: boolean | null }) => {

      const isNowOffline = !state.isConnected;

      setIsOffline(isNowOffline);

      // Reconcile on reconnect

      if (wasOfflineRef.current && !isNowOffline) {

        void syncMessagesFromApi();

      }

      wasOfflineRef.current = isNowOffline;

    });

    return () => unsubscribe();

  }, []);



  const syncMessagesFromApi = async () => {

    setIsSyncing(true);

    try {

      const syncedMessages = await fetchConversationMessagesFromApi(conversationId);

      if (!syncedMessages.length) return;

      replaceConversationMessages(conversationId, syncedMessages);

    } catch {

      // Keep local state when sync unavailable

    } finally {

      setIsSyncing(false);

    }

  };



  useEffect(() => {

    const handleAppStateChange = (nextAppState: string) => {

      if (nextAppState === 'active') {

        void syncMessagesFromApi();

      }

    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => subscription.remove();

  }, [conversationId]);



  useEffect(() => {

    setMessages(hydratedMessages);

  }, [hydratedMessages]);



  useEffect(() => {

    markConversationRead(conversationId);

  }, [conversationId, markConversationRead]);



  useEffect(() => {

    setConversationDraft(conversationId, input);

  }, [input, conversationId, setConversationDraft]);







  const resolvedPartnerId = useMemo(() => {

    if (isGroup) return null;

    if (route.params?.partnerUserId) return route.params.partnerUserId;

    if (conversation?.sellerId) return conversation.sellerId;

    return conversation?.participantIds?.find((id) => id !== 'me' && id !== currentUser?.id) ?? null;

  }, [conversation?.participantIds, conversation?.sellerId, currentUser?.id, isGroup, route.params?.partnerUserId]);



  const deployedBotIds = conversation?.botIds ?? [];

  const sellerHandle = resolvedPartnerId

    ? userLookup.get(resolvedPartnerId) ?? 'Thryft user'

    : 'Thryft user';



  const searchMatches = useMemo(() => {

    const q = String(searchQuery ?? '').trim().toLowerCase();

    if (!q) return [];

    return messages

      .map((m, idx) => ({ msg: m, idx }))

      .filter(({ msg }) => String(msg.text ?? '').toLowerCase().includes(q));

  }, [messages, searchQuery]);



  useEffect(() => {

    if (searchMatches.length > 0 && listRef.current) {

      const targetIndex = searchMatches[Math.min(searchMatchIndex, searchMatches.length - 1)]?.idx ?? 0;

      try {

        listRef.current.scrollToIndex({ index: targetIndex, animated: true, viewPosition: 0.5 });

      } catch {

        // FlatList may not have rendered the item yet

      }

    }

  }, [searchMatchIndex, searchMatches]);



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

      type: next.type === 'offer' ? 'offer' : next.type === 'media' ? 'text' : 'text',

      sender: next.sender === 'me' ? 'me' : 'other',

      mediaUri: next.mediaUri,

      mediaType: next.mediaType,

      uploadStatus: next.uploadStatus,

    });

  };



  const sendMessage = () => {

    const trimmed = input.trim();

    if (!trimmed) return;

    setComposerSending(true);



    const localId = String(Date.now()) + '_' + Math.random().toString(36).slice(2, 7);

    const outgoing: Message = {

      id: localId,

      type: 'text',

      sender: 'me',

      senderLabel: currentUser?.username ?? 'you',

      text: trimmed,

      status: 'sending',

    };

    if (replyTo) {

      outgoing.replyToMessageId = replyTo.id;

    }

    pushMessage(outgoing);

    appendToConversationStore(outgoing, currentUser?.id ?? 'me');

    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);



    sendConversationMessageOnApi(conversationId, trimmed)

      .then((serverMsg) => {

        setMessages((prev) =>

          prev.map((m) =>

            m.id === localId

              ? { ...m, id: serverMsg.id, status: 'sent' as const }

              : m

          )

        );

      })

      .catch(() => {

        setMessages((prev) =>

          prev.map((m) =>

            m.id === localId ? { ...m, status: 'failed' as const } : m

          )

        );

        show('Message failed to send. Tap to retry.', 'error');

      })

      .finally(() => setComposerSending(false));



    setInput('');

    setReplyTo(null);

  };



  const handleAcceptOffer = (msgId: string) => {

    haptic.medium();

    setMessages((prev) =>

      prev.map((m) =>

        m.id === msgId && m.offer

          ? { ...m, offer: { ...m.offer, status: 'accepted' as const } }

          : m

      )

    );

    const linkedItemId = routeItemId || conversation?.itemId;

    if (linkedItemId) {

      navigation.navigate('Checkout', { itemId: linkedItemId });

    } else {

      show('Offer accepted. Checkout requires a linked listing.', 'info');

    }

  };



  const handleDeclineOffer = (msgId: string) => {

    haptic.light();

    setMessages((prev) =>

      prev.map((m) =>

        m.id === msgId && m.offer

          ? { ...m, offer: { ...m.offer, status: 'declined' as const } }

          : m

      )

    );

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



  const scheduleUndoClear = () => {

    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

    undoTimerRef.current = setTimeout(() => setRecentlyDeleted([]), 5000);

  };



  const handleUndoDelete = () => {

    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

    if (deleteApiStatusRef.current === 'success') {

      show('Messages were deleted on the server and cannot be restored.', 'info');

      setRecentlyDeleted([]);

      return;

    }

    setMessages((prev) => {

      const restored = [...recentlyDeleted];

      const all = [...prev, ...restored];

      all.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

      return all;

    });

    setRecentlyDeleted([]);

    show('Messages restored', 'success');

  };



  const handleBulkDelete = () => {

    const idsToDelete = new Set(selectedMessageIds);

    const toDelete = messages.filter((m) => idsToDelete.has(m.id));

    if (toDelete.length === 0) { exitSelectionMode(); return; }

    Alert.alert(

      'Delete messages?',

      `This will remove ${toDelete.length} message${toDelete.length === 1 ? '' : 's'}.`,

      [

        { text: 'Cancel', style: 'cancel' },

        {

          text: 'Delete',

          style: 'destructive',

          onPress: async () => {

            haptic.medium();

            deleteApiStatusRef.current = 'pending';

            setRecentlyDeleted(toDelete);

            setMessages((prev) => prev.filter((m) => !idsToDelete.has(m.id)));

            exitSelectionMode();

            scheduleUndoClear();

            try {

              await Promise.all(

                toDelete.map((m) => deleteConversationMessageOnApi(conversationId, m.id))

              );

              deleteApiStatusRef.current = 'success';

            } catch {

              deleteApiStatusRef.current = 'error';

              show('Some messages may not have been deleted on the server.', 'error');

            }

          },

        },

      ]

    );

  };



  const handleDeleteMessage = (msg: Message) => {

    Alert.alert(

      'Delete message?',

      'This message will be removed.',

      [

        { text: 'Cancel', style: 'cancel' },

        {

          text: 'Delete',

          style: 'destructive',

          onPress: async () => {

            haptic.medium();

            deleteApiStatusRef.current = 'pending';

            setRecentlyDeleted([msg]);

            setMessages((prev) => prev.filter((m) => m.id !== msg.id));

            scheduleUndoClear();

            try {

              await deleteConversationMessageOnApi(conversationId, msg.id);

              deleteApiStatusRef.current = 'success';

            } catch {

              deleteApiStatusRef.current = 'error';

              show('Message deleted locally. It may still be visible to others.', 'info');

            }

          },

        },

      ]

    );

  };



  const scrollToBottom = () => {

    listRef.current?.scrollToEnd({ animated: true });

    setShowScrollToBottom(false);

  };



  const sendMediaMessage = (msgId: string, uri: string, mediaType: 'image' | 'video') => {

    sendConversationMessageOnApi(conversationId, '', {

      mediaUri: uri,

      mediaType,

    })

      .then((serverMsg) => {

        setMessages((prev) =>

          prev.map((m) =>

            m.id === msgId

              ? { ...m, id: serverMsg.id, uploadStatus: 'sent' as const }

              : m

          )

        );

      })

      .catch(() => {

        setMessages((prev) =>

          prev.map((m) =>

            m.id === msgId ? { ...m, uploadStatus: 'failed' as const } : m

          )

        );

        show('Upload failed. Tap media to retry.', 'error');

      });

  };



  const handleRetryUpload = (msgId: string) => {

    const msg = messages.find((m) => m.id === msgId);

    if (!msg?.mediaUri || !msg.mediaType) return;

    if (msg.uploadStatus === 'uploading') return; // Guard against in-flight retry spam

    setMessages((prev) =>

      prev.map((m) =>

        m.id === msgId ? { ...m, uploadStatus: 'uploading' as const } : m

      )

    );

    sendMediaMessage(msgId, msg.mediaUri, msg.mediaType);

    haptic.light();

  };



  const createMediaMessage = (uri: string): Message => {

    const mediaType = isVideoUri(uri) ? 'video' : 'image';

    return {

      id: String(Date.now()) + '_' + mediaType + '_' + Math.random().toString(36).slice(2, 7),

      type: 'media',

      sender: 'me',

      senderLabel: currentUser?.username ?? 'you',

      text: '',

      mediaUri: uri,

      mediaType,

      uploadStatus: 'uploading',

    };

  };



  const handleAttachmentSelect = async (type: ChatAction) => {

    if (type === 'gallery') {

      try {

        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!permission.granted) { show('Allow gallery access to upload media.', 'error'); return; }

        const result = await ImagePicker.launchImageLibraryAsync({

          mediaTypes: ImagePicker.MediaTypeOptions.Images,

          allowsMultipleSelection: false,

          quality: 0.9,

        });

        if (!result.canceled && result.assets?.[0]?.uri) {

          const uri = result.assets[0].uri;

          const outgoing = createMediaMessage(uri);

          pushMessage(outgoing);

          appendToConversationStore(outgoing, currentUser?.id ?? 'me');

          show(mediaTypeLabel(outgoing.mediaType!) + ' attached', 'success');

          haptic.success();

          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);

          sendMediaMessage(outgoing.id, uri, outgoing.mediaType!);

        }

      } catch {

        show('Could not open gallery.', 'error');

      }

    } else if (type === 'camera') {

      try {

        const permission = await ImagePicker.requestCameraPermissionsAsync();

        if (!permission.granted) { show('Allow camera access to capture media.', 'error'); return; }

        const result = await ImagePicker.launchCameraAsync({

          mediaTypes: ImagePicker.MediaTypeOptions.Images,

          quality: 0.9,

        });

        if (!result.canceled && result.assets?.[0]?.uri) {

          const uri = result.assets[0].uri;

          const outgoing = createMediaMessage(uri);

          pushMessage(outgoing);

          appendToConversationStore(outgoing, currentUser?.id ?? 'me');

          show(mediaTypeLabel(outgoing.mediaType!) + ' captured', 'success');

          haptic.success();

          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);

          sendMediaMessage(outgoing.id, uri, outgoing.mediaType!);

        }

      } catch {

        show('Could not open camera.', 'error');

      }

    }

  };



  const mediaTypeLabel = (t: 'image' | 'video') => t === 'video' ? 'Video' : 'Photo';

  // Date separator computation: show a date pill when the day changes between consecutive messages
  const dateSeparatorIndices = useMemo(() => {
    const indices = new Set<number>();
    const extractDate = (d?: string) => {
      if (!d) return '';
      // Extract YYYY-MM-DD portion if available
      const match = d.match(/^(\d{4}-\d{2}-\d{2})/);
      return match ? match[1] : d.split('T')[0] ?? d.split(' ')[0] ?? '';
    };
    for (let i = 0; i < messages.length; i++) {
      if (i === 0) {
        indices.add(i);
        continue;
      }
      const prevDate = extractDate(messages[i - 1]?.date);
      const currDate = extractDate(messages[i]?.date);
      if (currDate && prevDate && currDate !== prevDate) {
        indices.add(i);
      }
    }
    return indices;
  }, [messages]);

  const scrollToMessage = (messageId: string) => {
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx >= 0 && listRef.current) {
      try {
        listRef.current.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
      } catch {
        // FlatList may not have rendered the item yet
      }
    }
  };

  const renderMessage = (msg: Message, index: number) => {
    const prevMsg = messages[index - 1];
    const nextMsg = messages[index + 1];
    const isFirstInCluster = !prevMsg || prevMsg.sender !== msg.sender;
    const isLastInCluster = !nextMsg || nextMsg.sender !== msg.sender;

    // Spacing tiers (8px base grid)
    let spacingTop: number = Space.sm;
    if (!prevMsg) spacingTop = Space.md;
    else if (prevMsg.sender === msg.sender) spacingTop = 2;
    else spacingTop = Space.md;

    // Cluster rhythm: tight bottom inside cluster, normal at cluster end
    let marginBottom: number = 2;
    if (isLastInCluster) marginBottom = Space.sm;

    const showDateSeparator = dateSeparatorIndices.has(index);
    const dateLabel = msg.date
      ? (() => {
          try {
            const d = new Date(msg.date);
            return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
          } catch {
            return msg.date.split('T')[0] ?? msg.date;
          }
        })()
      : null;

    const dateSeparator = showDateSeparator && dateLabel ? (
      <View style={styles.dateWrap}>
        <View style={styles.datePill}>
          <Caption color={Colors.textMuted} style={styles.dateText}>{dateLabel}</Caption>
        </View>
      </View>
    ) : null;

    // Purchase status message
    if (msg.type === 'purchase_status') {
      const lines = msg.text!.split('\n');
      const content = (
        <Reanimated.View key={msg.id} style={styles.statusWrap}>
          <View style={styles.statusCardSolid}>
            <BodyEmphasis style={styles.statusTitle}>{lines[0]}</BodyEmphasis>
            <Caption color={Colors.textSecondary} style={styles.statusBody}>{lines.slice(1).join('\n')}</Caption>
            <AnimatedPressable
              onPress={() => show('Tracking requires a linked order. Use My Orders for tracking.', 'info')}
              accessibilityRole="button"
              accessibilityLabel="Open tracking"
              activeOpacity={0.7}
              scaleValue={0.98}
              hapticFeedback="light"
            >
              <Caption color={Colors.brand} style={styles.statusLink}>Tracking information</Caption>
            </AnimatedPressable>
          </View>
        </Reanimated.View>
      );
      return dateSeparator ? (
        <View key={msg.id + '_group'}>
          {dateSeparator}
          {content}
        </View>
      ) : content;
    }

    // Offer message
    if (msg.type === 'offer' || msg.type === 'offer_declined') {
      const isMe = msg.sender === 'me';
      const offerStatus = msg.offer!.status;
      const content = (
        <Reanimated.View key={msg.id} style={[styles.msgRow, isMe && styles.msgRowRight, { marginTop: spacingTop, marginBottom }]}>
          <View style={[styles.offerCard, isMe && styles.offerCardMe]}>
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
                <AnimatedPressable
                  style={styles.passBtn}
                  onPress={() => handleDeclineOffer(msg.id)}
                  activeOpacity={0.85}
                  scaleValue={0.96}
                  hapticFeedback="light"
                >
                  <Ionicons name="close-outline" size={14} color={Colors.textPrimary} />
                  <Text style={styles.passBtnText}>Pass</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={styles.acceptBtn}
                  onPress={() => handleAcceptOffer(msg.id)}
                  activeOpacity={0.85}
                  scaleValue={0.96}
                  hapticFeedback="medium"
                >
                  <Ionicons name="flash-outline" size={14} color={Colors.textInverse} />
                  <Text style={styles.acceptBtnText}>Accept</Text>
                </AnimatedPressable>
              </View>
            )}
          </View>
        </Reanimated.View>
      );
      return dateSeparator ? (
        <View key={msg.id + '_group'}>
          {dateSeparator}
          {content}
        </View>
      ) : content;
    }

    const isMe = msg.sender === 'me';
    const isMedia = msg.type === 'media' && msg.mediaUri;
    if (!msg.text && !isMedia) return null;

    const bubble = (
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
          style={[styles.msgRow, isMe && styles.msgRowRight, { marginTop: spacingTop, marginBottom }]}
        >
          <MessageBubble
            text={msg.text ?? ''}
            isMe={isMe}
            senderLabel={isGroup && !isMe ? msg.senderLabel : undefined}
            timestamp={isLastInCluster ? (msg.date || 'just now') : undefined}
            status={
              isMe
                ? (msg.status === 'sending' ? 'sending'
                  : msg.status === 'failed' ? 'failed'
                  : msg.uploadStatus === 'uploading' ? 'sending'
                  : msg.uploadStatus === 'failed' ? 'failed'
                  : 'sent')
                : undefined
            }
            onLongPress={() => handleMessageLongPress(msg)}
            onReactionPress={() => setReactingToMessage(msg)}
            onMediaPress={
              msg.mediaUri
                ? () => {
                    const uri = msg.mediaUri!;
                    navigation.navigate('ChatMediaPreview', {
                      mediaUri: uri,
                      mediaType: msg.mediaType ?? 'image',
                      senderLabel: msg.senderLabel,
                      timestamp: msg.date,
                      messageId: msg.id,
                    });
                  }
                : undefined
            }
            replyTo={
              msg.replyToMessageId
                ? (() => {
                    const parent = messages.find((m) => m.id === msg.replyToMessageId);
                    return parent
                      ? { senderName: parent.senderLabel ?? 'Thryft user', text: parent.text ?? '' }
                      : null;
                  })()
                : null
            }
            onReplyPress={msg.replyToMessageId ? () => scrollToMessage(msg.replyToMessageId!) : undefined}
            reactions={msg.reactions}
            mediaUri={msg.mediaUri}
            mediaType={msg.mediaType}
            uploadStatus={msg.uploadStatus}
            onRetry={msg.uploadStatus === 'failed' ? () => handleRetryUpload(msg.id) : undefined}
            isFirstInCluster={isFirstInCluster}
            isLastInCluster={isLastInCluster}
            showAvatar={!isMe && isFirstInCluster}
          />
          {!isMedia && (() => {
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

    if (showDateSeparator && dateLabel) {
      return (
        <View key={msg.id + '_group'}>
          {dateSeparator}
          {bubble}
        </View>
      );
    }

    return bubble;
  };



  return (

    <FlagshipScreen
      header={
        <FlagshipHeader
          title={isGroup ? (conversation?.title ?? 'Group chat') : '@' + sellerHandle}
          subtitle={isGroup ? (conversation?.participantIds?.length ?? 0) + ' members' : undefined}
          onBack={() => navigation.goBack()}
          titleAccessibilityLabel={isGroup ? 'Open group info' : 'Open profile'}
          onTitlePress={() => {
            if (!conversation) return;
            if (isGroup) {
              navigation.navigate('GroupChatInfo', { conversationId: conversation.id });
            } else if (resolvedPartnerId) {
              navigation.navigate('UserProfile', { userId: resolvedPartnerId });
            } else {
              navigation.navigate('ConversationInfo', { conversationId: conversation.id });
            }
          }}
          avatar={
            !isGroup ? (
              (() => {
                const avatarUri =
                  conversation?.avatar ||
                  (resolvedPartnerId ? profileMediaOverrides[resolvedPartnerId]?.avatar : undefined) ||
                  '';
                return (
                  <View style={styles.headerAvatarRing}>
                    <CachedImage
                      uri={avatarUri}
                      style={styles.headerAvatarImage}
                      contentFit="cover"
                    />
                  </View>
                );
              })()
            ) : null
          }
          rightAction={
            <View style={styles.headerActions}>
              <AnimatedPressable
                style={styles.headerActionBtn}
                onPress={() => setIsSearchActive((v) => !v)}
                activeOpacity={0.7}
                scaleValue={0.9}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel={isSearchActive ? 'Close search' : 'Search in conversation'}
                accessibilityState={{ selected: isSearchActive }}>
                <Ionicons name="search-outline" size={20} color={Colors.textSecondary} />
              </AnimatedPressable>
              <AnimatedPressable
                style={styles.headerActionBtn}
                onPress={() => {
                  if (!conversation) return;
                  navigation.navigate(isGroup ? 'GroupChatInfo' : 'ConversationInfo', { conversationId: conversation.id });
                }}
                activeOpacity={0.7}
                scaleValue={0.9}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel={isGroup ? 'Group info' : 'Conversation info'}>
                <Ionicons name="information-circle-outline" size={20} color={Colors.textSecondary} />
              </AnimatedPressable>
            </View>
          }
        />
      }
      keyboardAvoiding
      scrollEnabled={false}
    >



      {isSearchActive && (

        <View style={styles.searchBarRow}>

          <AppSearchBar

            placeholder="Search in chat"

            value={searchQuery}

            onChangeText={(q: string) => { setSearchQuery(q); setSearchMatchIndex(0); }}

            containerStyle={styles.searchBar}

            inputProps={{}}

          />

          {searchMatches.length > 0 && (

            <View style={styles.searchNav}>

              <Text style={styles.searchCount}>{searchMatchIndex + 1}/{searchMatches.length}</Text>

              <AnimatedPressable

                onPress={() => setSearchMatchIndex((i) => Math.max(0, i - 1))}

                activeOpacity={0.7}

                scaleValue={0.9}

                hapticFeedback="light"

              >

                <Ionicons name="chevron-up" size={20} color={Colors.textPrimary} />

              </AnimatedPressable>

              <AnimatedPressable

                onPress={() => setSearchMatchIndex((i) => Math.min(searchMatches.length - 1, i + 1))}

                activeOpacity={0.7}

                scaleValue={0.9}

                hapticFeedback="light"

              >

                <Ionicons name="chevron-down" size={20} color={Colors.textPrimary} />

              </AnimatedPressable>

            </View>

          )}

        </View>

      )}



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

        <TaggedItemCard itemId={routeItemId} navigation={navigation} formatFromFiat={formatFromFiat} currentUserId={currentUser?.id} />

      ) : null}




        {isSyncing ? (

          <SkeletonChatLoader count={6} />

        ) : messages.length ? (

          <FlatList

            ref={listRef}

            data={messages}

            renderItem={({ item, index }) => renderMessage(item, index)}

            keyExtractor={(item) => item.id}

            contentContainerStyle={styles.messageList}

            showsVerticalScrollIndicator={false}

            keyboardDismissMode="on-drag"

            keyboardShouldPersistTaps="always"

            onScroll={(e) => {

              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;

              const isNearBottom = contentSize.height - contentOffset.y - layoutMeasurement.height < 150;

              setShowScrollToBottom(!isNearBottom);

            }}

            scrollEventThrottle={200}

          />

        ) : (

          <View style={styles.emptyState}>

            <View style={styles.emptyIconCircle}>

              <Ionicons name="chatbubbles-outline" size={32} color={Colors.brand} />

            </View>

            <Text style={styles.emptyTitle}>No messages yet</Text>

            <Text style={styles.emptyBody}>

              Send a message or photo to get the conversation started.

            </Text>

            <View style={styles.emptyCtaRow}>

              <Ionicons name="arrow-down" size={16} color={Colors.textMuted} />

              <Caption color={Colors.textMuted}>Type below</Caption>

            </View>

          </View>

        )}



        <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, Space.sm) + 8 }]}>

          {replyTo ? (

            <ReplyQuote

              senderName={replyTo.senderLabel ?? 'Thryft user'}

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

            />

          ) : null}

          {isOffline && (

            <View style={styles.offlineBanner}>

              <Ionicons name="cloud-offline-outline" size={16} color={Colors.textSecondary} />

              <Text style={styles.offlineBannerText}>You are offline. Messages will be sent when you reconnect.</Text>

            </View>

          )}

          {recentlyDeleted.length > 0 && (

            <View style={styles.undoBanner}>

              <Text style={styles.undoBannerText}>

                {recentlyDeleted.length} message{recentlyDeleted.length === 1 ? '' : 's'} deleted

              </Text>

              <AnimatedPressable

                onPress={handleUndoDelete}

                activeOpacity={0.7}

                scaleValue={0.95}

                hapticFeedback="light"

                accessibilityLabel="Undo message deletion"

              >

                <Text style={styles.undoBannerAction}>Undo</Text>

              </AnimatedPressable>

            </View>

          )}

          <ChatComposerBar

            value={input}

            onChangeText={setInput}

            onSend={sendMessage}

            onAttachmentPress={() => setAttachmentPickerVisible(true)}

            onCameraPress={() => handleAttachmentSelect('camera')}

            placeholder="Message..."

            isSending={composerSending}

          />

        </View>


      <ChatActionSheet
        visible={attachmentPickerVisible}
        onClose={() => setAttachmentPickerVisible(false)}
        onSelect={(action) => {
          if (action === 'gallery' || action === 'camera') {
            handleAttachmentSelect(action);
          }
        }}
      />



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

            case 'delete':

              handleDeleteMessage(selectedMessage);

              break;

            default:

              break;

          }

        }}

        messageText={selectedMessage?.text ?? undefined}

        isOwnMessage={selectedMessage?.sender === 'me'}

      />

    </FlagshipScreen>

  );

}



const styles = StyleSheet.create({

  headerAvatarRing: {

    width: 42,

    height: 42,

    borderRadius: Radius.full,

    borderWidth: 2,

    borderColor: Colors.border,

    padding: 2,

    justifyContent: 'center',

    alignItems: 'center',

  },

  headerAvatarImage: {

    width: 34,

    height: 34,

    borderRadius: Radius.full,

  },

  headerActions: {

    flexDirection: 'row',

    gap: Space.xs,

  },

  headerActionBtn: {

    width: 40,

    height: 40,

    borderRadius: Radius.full,

    justifyContent: 'center',

    alignItems: 'center',

  },

  selectionToolbar: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'space-between',

    paddingHorizontal: Space.md,

    paddingVertical: Space.sm,

    backgroundColor: Colors.surfaceAlt,

    borderBottomWidth: StyleSheet.hairlineWidth,

    borderBottomColor: Colors.border,

    ...Elevation.subtle,

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

  itemCardRow: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: Space.sm,

    padding: Space.sm,

    borderRadius: Radius.lg,

    borderWidth: StyleSheet.hairlineWidth,

    ...Elevation.subtle,

  },

  itemThumb: {

    width: 44,

    height: 44,

    borderRadius: Radius.md,

    backgroundColor: Colors.surfaceAlt,

    overflow: 'hidden',

  },

  itemThumbImage: {

    width: 44,

    height: 44,

    borderRadius: Radius.md,

  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  itemQuickActions: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.sm,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  itemQuickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    paddingHorizontal: Space.sm,
    paddingVertical: 6,
    ...Elevation.subtle,
  },
  itemQuickText: {
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
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

    paddingHorizontal: Space.xl,

  },

  emptyIconCircle: {

    width: 72,

    height: 72,

    borderRadius: Radius.full,

    backgroundColor: Colors.surface,

    alignItems: 'center',

    justifyContent: 'center',

    marginBottom: Space.sm,

    ...Elevation.subtle,

  },

  emptyTitle: {

    fontSize: Type.subtitle.size,

    fontFamily: TypeStyles.title.fontFamily,

    color: Colors.textPrimary,

    textAlign: 'center',

    letterSpacing: Type.subtitle.letterSpacing,

  },

  emptyBody: {

    fontSize: Type.caption.size,

    fontFamily: TypeStyles.body.fontFamily,

    color: Colors.textSecondary,

    textAlign: 'center',

    lineHeight: Type.caption.lineHeight,

    marginTop: Space.xs,

  },

  emptyCtaRow: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: Space.xs,

    marginTop: Space.md,

  },



  messageList: {

    paddingVertical: Space.sm,

  },

  dateWrap: {

    alignItems: 'center',

    marginVertical: Space.md,

  },

  datePill: {

    backgroundColor: Colors.surfaceAlt,

    borderRadius: Radius.full,

    paddingHorizontal: Space.sm,

    paddingVertical: Space.xs,

  },

  dateText: {

    fontSize: Type.meta.size,

    fontFamily: TypeStyles.bodyEmphasis.fontFamily,

    textTransform: 'uppercase',

    letterSpacing: 0.5,

  },



  statusWrap: {

    marginVertical: Space.xs,

    paddingHorizontal: Space.md,

  },

  statusCardSolid: {

    gap: Space.xs,

    backgroundColor: Colors.surface,

    borderRadius: Radius.lg,

    padding: Space.sm,

    borderWidth: StyleSheet.hairlineWidth,

    borderColor: Colors.border,

    ...Elevation.subtle,

  },

  statusTitle: { marginBottom: Space.xs },

  statusBody: { lineHeight: 20 },

  statusLink: { marginTop: Space.sm },



  msgRow: {

    flexDirection: 'row',

    alignItems: 'flex-end',

    gap: Space.xs,

    paddingHorizontal: Space.md,

  },

  msgRowRight: {

    flexDirection: 'row-reverse',

  },



  offerCard: {

    maxWidth: '78%',

    gap: Space.xs,

    backgroundColor: Colors.surface,

    borderRadius: Radius.lg,

    padding: Space.sm,

    borderWidth: StyleSheet.hairlineWidth,

    borderColor: Colors.border,

    ...Elevation.subtle,

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

    fontSize: Type.priceLarge.size,

    fontFamily: TypeStyles.title.fontFamily,

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

  passBtn: {

    flex: 1,

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'center',

    gap: 6,

    backgroundColor: Colors.surfaceAlt,

    borderRadius: Radius.md,

    paddingVertical: 10,

    borderWidth: 0.5,

    borderColor: Colors.border,

  },

  passBtnText: {

    fontSize: Type.caption.size,

    fontFamily: TypeStyles.bodyEmphasis.fontFamily,

    color: Colors.textPrimary,

  },

  acceptBtn: {

    flex: 1,

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'center',

    gap: 6,

    backgroundColor: Colors.brand,

    borderRadius: Radius.md,

    paddingVertical: 10,

    borderWidth: 1,

    borderColor: Colors.brand,

  },

  acceptBtnText: {

    fontSize: Type.caption.size,

    fontFamily: TypeStyles.bodyEmphasis.fontFamily,

    color: Colors.textInverse,

  },



  linkPreviewWrap: {

    maxWidth: '78%',

    alignSelf: 'flex-start',

    marginTop: Space.xs,

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

    backgroundColor: Colors.surfaceAlt,

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

    ...Elevation.subtle,

  },

  undoBanner: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'space-between',

    backgroundColor: Colors.surfaceAlt,

    borderTopWidth: StyleSheet.hairlineWidth,

    borderTopColor: Colors.border,

    marginHorizontal: -Space.md,

    marginTop: -Space.xs,

    marginBottom: Space.xs,

    paddingHorizontal: Space.md,

    paddingVertical: Space.sm,

  },

  undoBannerText: {

    color: Colors.textSecondary,

    fontSize: Type.caption.size,

    fontFamily: TypeStyles.bodyEmphasis.fontFamily,

  },

  undoBannerAction: {

    color: Colors.brand,

    fontSize: Type.caption.size,

    fontFamily: TypeStyles.bodyEmphasis.fontFamily,

  },

  searchBarRow: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: Space.sm,

    paddingHorizontal: Space.md,

    paddingVertical: Space.sm,

    backgroundColor: Colors.background,

    borderBottomWidth: StyleSheet.hairlineWidth,

    borderBottomColor: Colors.border,

  },

  searchBar: {

    flex: 1,

    backgroundColor: Colors.surfaceAlt,

    borderRadius: Radius.full,

    paddingHorizontal: Space.md,

    minHeight: 40,

  },

  searchNav: {

    flexDirection: 'row',

    alignItems: 'center',

    gap: Space.sm,

  },

  searchCount: {

    fontSize: Type.caption.size,

    fontFamily: TypeStyles.bodyEmphasis.fontFamily,

    color: Colors.textMuted,

    minWidth: 32,

    textAlign: 'center',

  },

  offlineBanner: {

    flexDirection: 'row',

    alignItems: 'center',

    justifyContent: 'center',

    gap: Space.xs,

    backgroundColor: Colors.surfaceAlt,

    borderTopWidth: StyleSheet.hairlineWidth,

    borderTopColor: Colors.border,

    marginHorizontal: -Space.md,

    marginTop: -Space.xs,

    marginBottom: Space.xs,

    paddingHorizontal: Space.md,

    paddingVertical: Space.sm,

  },

  offlineBannerText: {

    color: Colors.textSecondary,

    fontSize: Type.caption.size,

    fontFamily: TypeStyles.bodyEmphasis.fontFamily,

  },

});