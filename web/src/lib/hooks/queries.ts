'use client';

/** Query hooks — the only path from screens to data. */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { data, DATA_MODE } from '@/lib/api/client';
import type { Conversation, Message, NewConversationInput, User } from '@/lib/contracts/domain';
import {
  appendFixtureMessage,
  createFixtureConversation,
  CONVERSATIONS,
  USERS,
} from '@/lib/data/fixtures';
import * as usersService from '@/lib/api/services/users';
import * as chatService from '@/lib/api/services/chat';
import { uploadImageFile } from '@/lib/api/services/uploads';
import { isLocalMediaUri } from '@/lib/utils/media';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated } from '@/lib/store/useStore';
import { useInboxPrefs } from '@/lib/store/inboxPrefs';

export function useListings(category?: string, query?: string) {
  return useQuery({
    queryKey: ['listings', category ?? 'all', query ?? ''],
    queryFn: () => data.listings(category, query),
  });
}

export function useFeed() {
  return useQuery({ queryKey: ['feed'], queryFn: () => data.feed() });
}

export function useListing(id: string) {
  return useQuery({
    queryKey: ['listing', id],
    queryFn: () => data.listing(id),
  });
}

export function useSellerListings(sellerId: string) {
  return useQuery({
    queryKey: ['seller-listings', sellerId],
    queryFn: () => data.sellerListings(sellerId),
    enabled: !!sellerId,
  });
}

export function useUser(id: string) {
  return useQuery({ queryKey: ['user', id], queryFn: () => data.user(id) });
}

export function useUserByUsername(username: string) {
  return useQuery({
    queryKey: ['user-by-username', username],
    queryFn: () => data.userByUsername(username),
  });
}

export function useReviews(userId: string) {
  return useQuery({ queryKey: ['reviews', userId], queryFn: () => data.reviews(userId) });
}

/**
 * Conversation list — the single unread-accounting source every badge path
 * reads (header pill, mobile tab badge, inbox row). Muted threads keep
 * their data but report `unread: false` here, so a mute suppresses every
 * badge at once and unmuting restores it — display-time suppression, never
 * a write against the thread itself. Resolution order per thread: local
 * override (inboxPrefs, hydrated) → live `isMuted` → not muted.
 */
export function useConversations() {
  const { user } = useSession();
  const hydrated = useHydrated();
  const mutedOverrides = useInboxPrefs((s) => s.muted);
  const query = useQuery({
    queryKey: ['conversations', user?.id ?? 'guest'],
    queryFn: () => data.conversations(user?.id),
  });
  const conversations = useMemo(() => {
    if (!query.data || !hydrated) return query.data;
    return query.data.map((c) => {
      const muted = mutedOverrides[c.id] ?? c.isMuted === true;
      return muted && (c.unread || (c.unreadCount ?? 0) > 0)
        ? { ...c, unread: false, unreadCount: 0 }
        : c;
    });
  }, [query.data, hydrated, mutedOverrides]);
  return { ...query, data: conversations };
}

export function useConversation(id: string) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['conversation', id, user?.id ?? 'guest'],
    queryFn: () => data.conversation(id, user?.id),
    refetchInterval: 15_000,
  });
}

export function useSendMessage(conversationId: string) {
  const qc = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: (text: string) => data.sendMessage(conversationId, { text }, user?.id),
    onSuccess: () => {
      // The inbox row previews the last message — the list re-reads too.
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      return qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
    },
  });
}

/**
 * Mark a conversation read — one write path for the thread surface and the
 * inbox list. Fixture mode clears the unread flag on the module dataset so
 * refetches keep it read; live mode posts the read edge the mobile chatApi
 * calls. Either way the 'conversations'/'conversation' caches are rewritten
 * so the header pill, tab badge and row badge drop on the same write.
 */
export function useMarkConversationRead() {
  const qc = useQueryClient();
  const { user } = useSession();
  const userKey = user?.id ?? 'guest';
  return useCallback(
    (conversationId: string) => {
      const applyRead = (c: Conversation): Conversation =>
        c.unread || (c.unreadCount ?? 0) > 0
          ? { ...c, unread: false, unreadCount: 0 }
          : c;
      // Optimistic badge write — prefix keys cover every session variant.
      qc.setQueriesData<Conversation[]>({ queryKey: ['conversations'] }, (old) =>
        old?.map((c) => (c.id === conversationId ? applyRead(c) : c)),
      );
      qc.setQueriesData<Conversation | null>(
        { queryKey: ['conversation', conversationId] },
        (old) => (old ? applyRead(old) : old),
      );
      if (DATA_MODE === 'live') {
        // Idempotent server edge — a failed post leaves the optimistic
        // state until the 15s thread poll re-syncs server truth.
        void chatService
          .markConversationRead(conversationId)
          .then(() => qc.invalidateQueries({ queryKey: ['conversations'] }))
          .catch(() => {});
        return;
      }
      const convo = CONVERSATIONS.find((c) => c.id === conversationId);
      if (convo) {
        convo.unread = false;
        convo.unreadCount = 0;
      }
      void qc.invalidateQueries({ queryKey: ['conversations', userKey] });
    },
    [qc, userKey],
  );
}

export function useNotifications() {
  return useQuery({ queryKey: ['notifications'], queryFn: data.notifications });
}

/** Structured notification feed — the canonical /notifications contract
 *  (kind, text, time, image, href, unread). */
export function useNotificationEntries() {
  return useQuery({
    queryKey: ['notification-entries'],
    queryFn: () => data.notificationEntries(),
  });
}

export function useOrders() {
  return useQuery({ queryKey: ['orders'], queryFn: data.orders });
}

export function useMyListings() {
  return useQuery({ queryKey: ['my-listings'], queryFn: data.myListings });
}

// ============================================================================
// ORDERS — commerce-depth surface. Live mode delegates to the commerce
// service (/orders*); fixture mode writes the commerce fixture overlay and
// invalidates the 'orders' prefix — same posture as the mobile returnsApi.
// ============================================================================

import type { CommerceOrder, ReturnCase } from '@/lib/contracts/domain';
import {
  allCommerceOrders,
  applyReturnCaseTransition,
  cancelCommerceOrder,
  confirmOrderReceipt,
  markOrderDispatched,
  markOrderPaid,
  orderEnrichmentFor,
  requestReturnCase,
  requestReturnStepIn,
  respondToDispatchExtension,
  submitOrderReview,
  type ReturnCaseTransition,
} from '@/lib/data/fixtures-commerce';
import * as commerceService from '@/lib/api/services/commerce';

/** Full-vocabulary order list (purchases + sales) for the orders surfaces. */
export function useCommerceOrders() {
  return useQuery<CommerceOrder[]>({
    queryKey: ['orders', 'commerce'],
    queryFn: async () => {
      if (DATA_MODE === 'live') {
        const page = await commerceService.fetchOrders();
        return page.items;
      }
      const base = await data.orders();
      return allCommerceOrders(base);
    },
  });
}

/**
 * The order's active return case. Live mode queries the real returns API
 * (404 → no case); fixture mode reads the enrichment store — the same
 * field orderEnrichmentFor exposes inline.
 */
export function useOrderReturnCase(orderId: string) {
  return useQuery<ReturnCase | null>({
    queryKey: ['order', orderId, 'return-case'],
    queryFn: () =>
      DATA_MODE === 'live'
        ? commerceService.fetchOrderReturnCase(orderId)
        : Promise.resolve(
            orderEnrichmentReturnCase(orderId),
          ),
  });
}

/** Fixture-mode return case lookup — keeps useOrderReturnCase symmetric
 *  with the live query while detail pages still read enrichment inline. */
function orderEnrichmentReturnCase(orderId: string): ReturnCase | null {
  return orderEnrichmentFor(orderId).returnCase ?? null;
}

/**
 * Order actions — live mode posts to /orders/:id/* and the returns API;
 * fixture mode mutates the overlay. Every branch is a real call — live
 * mode never simulates a transition the server hasn't confirmed, and an
 * unverifiable action throws instead of reporting success. Each returns
 * the invalidation promise so callers can await the re-read.
 */
export function useOrderActions(orderId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['order', orderId, 'return-case'] });
    return qc.invalidateQueries({ queryKey: ['orders'] });
  };
  return {
    /** Buyer completed payment on a 'created' order. Fixture only — live
     *  checkout is the payment-intent flow on /checkout, so a live 'created'
     *  order has no honest web pay path and this throws if reached. */
    payOrder: () => {
      if (DATA_MODE === 'live') {
        return Promise.reject(
          new Error('Payment can only be completed through checkout'),
        );
      }
      markOrderPaid(orderId);
      return invalidate();
    },
    confirmReceipt: () => {
      if (DATA_MODE === 'live') return commerceService.confirmDelivery(orderId).then(invalidate);
      confirmOrderReceipt(orderId);
      return invalidate();
    },
    markDispatched: (trackingNumber?: string) => {
      if (DATA_MODE === 'live') {
        return commerceService
          .shipOrder(orderId, { trackingNumber })
          .then(invalidate);
      }
      markOrderDispatched(orderId, trackingNumber);
      return invalidate();
    },
    cancelOrder: () => {
      if (DATA_MODE === 'live') return commerceService.cancelOrder(orderId).then(invalidate);
      cancelCommerceOrder(orderId);
      return invalidate();
    },
    respondExtension: (accept: boolean, extensionId?: string) => {
      if (DATA_MODE === 'live') {
        return commerceService
          .respondDispatchExtension(orderId, accept, extensionId)
          .then(invalidate);
      }
      respondToDispatchExtension(orderId, accept);
      return invalidate();
    },
    leaveReview: (rating: number, text: string) => {
      if (DATA_MODE === 'live') {
        return commerceService
          .reviewOrder(orderId, { rating, text })
          .then(() => {
            void qc.invalidateQueries({ queryKey: ['reviews'] });
            return invalidate();
          });
      }
      submitOrderReview(orderId, rating, text);
      void qc.invalidateQueries({ queryKey: ['reviews'] });
      return invalidate();
    },
    requestReturn: (input: {
      reasonId: string;
      reasonLabel: string;
      note: string;
      amountGbp: number | null;
      /** Buyer-attached evidence URLs — mirrors returnsApi RequestReturnInput. */
      evidenceMediaUrls?: string[];
    }) => {
      if (DATA_MODE === 'live') {
        return commerceService
          .requestReturn(orderId, {
            reason: input.reasonId,
            description: input.note || undefined,
            evidenceMediaUrls: input.evidenceMediaUrls?.length
              ? input.evidenceMediaUrls
              : undefined,
            requestedAmountGbp: input.amountGbp ?? undefined,
          })
          .then(invalidate);
      }
      requestReturnCase(orderId, input);
      return invalidate();
    },
    /** Platform step-in is keyed by the return case, not the order —
     *  the caller passes the live case id. */
    stepIn: (returnCaseId?: string) => {
      if (DATA_MODE === 'live') {
        if (!returnCaseId) {
          return Promise.reject(new Error('No return case to escalate'));
        }
        return commerceService.requestReturnStepIn(returnCaseId).then(invalidate);
      }
      requestReturnStepIn(orderId);
      return invalidate();
    },
    /** Return-case transitions — live mode routes each transition to the
     *  verified /return-cases/:id/* endpoint; fixture mode applies the
     *  state-machine write to the enrichment store. */
    returnCaseAction: (action: ReturnCaseTransition, returnCaseId?: string) => {
      if (DATA_MODE === 'live') {
        if (!returnCaseId) {
          return Promise.reject(new Error('No return case to act on'));
        }
        let call: Promise<unknown>;
        switch (action.type) {
          case 'decision':
            call = commerceService.respondToReturnCase(returnCaseId, {
              decision: action.decision,
              reason: action.reason,
            });
            break;
          case 'reverse_shipment':
            call = commerceService.provideReturnShipment(returnCaseId, {
              carrier: action.carrier,
              trackingNumber: action.trackingNumber,
              labelUrl: action.labelUrl,
            });
            break;
          case 'receipt':
            call = commerceService.confirmReturnReceipt(returnCaseId);
            break;
          case 'inspection':
            call = commerceService.recordReturnInspection(returnCaseId, {
              notes: action.notes,
              condition: action.condition,
            });
            break;
          case 'remedy':
            call = commerceService.proposeReturnRemedy(returnCaseId, {
              remedy: action.remedy,
              // The server rejects an explicit amount on non-partial remedies.
              amountGbp: action.remedy === 'partial_refund' ? action.amountGbp : undefined,
              notes: action.notes,
            });
            break;
          case 'remedy_accept':
            call = commerceService.acceptReturnRemedy(returnCaseId);
            break;
          case 'remedy_reject':
            call = commerceService.rejectReturnRemedy(returnCaseId, action.reason);
            break;
          case 'appeal':
            call = commerceService.appealReturnCase(returnCaseId, action.reason);
            break;
        }
        return call.then(invalidate);
      }
      applyReturnCaseTransition(orderId, action);
      return invalidate();
    },
  };
}

// ============================================================================
// MESSAGING — member directory, thread creation, media-capable sends.
// Live mode calls the chat service; fixture mode mutates the module dataset
// (same store pattern as useSupportTickets / useCollectionActions).
// ============================================================================

const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));

/** Directory of messageable members — everyone but the viewer, filtered. */
export function useMemberDirectory(query: string) {
  const q = query.trim().toLowerCase();
  return useQuery({
    queryKey: ['member-directory', q],
    queryFn: async (): Promise<User[]> => {
      if (DATA_MODE === 'live') {
        return usersService.searchUsers(q);
      }
      await tick();
      return USERS.filter(
        (u) => u.id !== 'me' && (!q || u.username.toLowerCase().includes(q)),
      );
    },
  });
}

/**
 * Create a DM or group thread — mirrors mobile createDmConversationOnApi /
 * createGroupConversationOnApi. One member = DM (reuses an existing thread);
 * two or more members = group (title required by the caller). Returns the
 * conversation so callers can navigate to /inbox/[id].
 */
export function useCreateConversation() {
  const qc = useQueryClient();
  const { user } = useSession();
  // Readers key on the session user ('guest' while signed out) — writes
  // must land on the same scope or the new thread never appears.
  const userKey = user?.id ?? 'guest';
  return useMutation({
    mutationFn: async (input: NewConversationInput): Promise<Conversation> => {
      if (DATA_MODE === 'live') {
        if (input.memberIds.length > 1) {
          return chatService.createGroupConversation(
            {
              title: input.title ?? 'Group',
              participantIds: input.memberIds,
              description: input.description,
            },
            user?.id,
          );
        }
        return chatService.createDmConversation(input.memberIds[0], user?.id);
      }
      await tick(140);
      return createFixtureConversation(input);
    },
    onSuccess: (conversation) => {
      // The fixture write already mutated the cached array — re-issue fresh
      // references so subscribers re-render, then let refetches confirm.
      qc.setQueryData<Conversation>(
        ['conversation', conversation.id, userKey],
        conversation,
      );
      qc.setQueryData<Conversation[]>(['conversations', userKey], (old) =>
        old ? [...old] : [conversation],
      );
      qc.invalidateQueries({ queryKey: ['conversations', userKey] });
    },
  });
}

export interface SendChatMessageInput {
  text?: string;
  mediaUri?: string;
  /** Attachment kind — 'image'/'video' render media bubbles; 'document'
   *  posts type:'document' + metadata (mirrors mobile
   *  sendConversationMessageOnApi), 'voice' posts type:'voice' with the
   *  duration/waveform metadata. */
  mediaType?: 'image' | 'video' | 'document' | 'voice';
  /** The staged File behind a blob: mediaUri — live mode uploads it
   *  (presign → PUT → finalize) before the message posts. */
  file?: File;
  documentName?: string;
  documentMimeType?: string;
  voiceDurationMs?: number;
  voiceWaveform?: number[];
  replyToMessageId?: string;
}

/**
 * Send a message — text and/or media. Live mode uploads staged files to
 * media storage first so the server only ever receives canonical URIs
 * (a blob:/data: pick no other client could load), then posts the
 * discriminated {type, text, mediaUri} payload. Fixture mode appends
 * through the store grammar (row preview falls through text → Photo →
 * systemTitle → Offer) so the inbox row updates on the same write.
 */
export function useSendChatMessage(conversationId: string) {
  const qc = useQueryClient();
  const { user } = useSession();
  const userKey = user?.id ?? 'guest';
  return useMutation({
    mutationFn: async (input: SendChatMessageInput): Promise<void> => {
      if (DATA_MODE === 'live') {
        let mediaUri = input.mediaUri;
        if (input.file) {
          mediaUri = await uploadImageFile(input.file, 'chat');
        } else if (mediaUri && isLocalMediaUri(mediaUri)) {
          // A local pick without its File can't be uploaded — fail the send
          // rather than posting a URI no recipient could resolve.
          throw new Error('Attachment could not be uploaded');
        }
        await chatService.sendChatMessage(
          conversationId,
          {
            text: input.text,
            mediaUri,
            mediaType: input.mediaType,
            replyToMessageId: input.replyToMessageId,
            documentName: input.documentName,
            documentMimeType: input.documentMimeType,
            voiceDurationMs: input.voiceDurationMs,
            voiceWaveform: input.voiceWaveform,
          },
          user?.id,
        );
        return;
      }
      await tick(60);
      if (!user) throw new Error('Sign in to send messages');
      const isDoc = input.mediaType === 'document';
      const isVoice = input.mediaType === 'voice';
      const message: Message = {
        id: `local-${Date.now()}`,
        senderId: user.id,
        sender: 'me',
        text: input.text,
        mediaUri: !isDoc && !isVoice ? input.mediaUri : undefined,
        mediaType:
          input.mediaType === 'image' || input.mediaType === 'video'
            ? input.mediaType
            : undefined,
        replyToMessageId: input.replyToMessageId,
        // Document/voice carry their own uri fields — never mediaUri, so
        // a PDF can never leak into the photo path.
        documentUri: isDoc ? input.mediaUri : undefined,
        documentName: isDoc ? input.documentName : undefined,
        documentMimeType: isDoc ? input.documentMimeType : undefined,
        voiceUri: isVoice ? input.mediaUri : undefined,
        voiceDurationMs: isVoice ? input.voiceDurationMs : undefined,
        voiceWaveform: isVoice ? input.voiceWaveform : undefined,
        type: isDoc
          ? 'document'
          : isVoice
            ? 'voice'
            : input.mediaUri
              ? 'media'
              : 'text',
        timestamp: new Date().toISOString(),
        readStatus: 'sent',
      };
      appendFixtureMessage(conversationId, message);
    },
    onSuccess: () => {
      // Fresh references around the mutated fixture objects so the thread
      // and the inbox row re-render on the same write. Keys match the
      // session-scoped readers (['conversation', id, userKey]).
      qc.setQueryData<Conversation | null>(
        ['conversation', conversationId, userKey],
        (old) => (old ? { ...old, messages: [...old.messages] } : old),
      );
      qc.setQueryData<Conversation[]>(['conversations', userKey], (old) =>
        old ? [...old] : old,
      );
      qc.invalidateQueries({ queryKey: ['conversation', conversationId, userKey] });
      qc.invalidateQueries({ queryKey: ['conversations', userKey] });
    },
  });
}
