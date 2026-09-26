'use client';

/** Query hooks — the only path from screens to data. */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { data, DATA_MODE } from '@/lib/api/client';
import type { Conversation, Message, NewConversationInput, User } from '@/lib/contracts/domain';
import {
  appendFixtureMessage,
  createFixtureConversation,
  USERS,
} from '@/lib/data/fixtures';
import * as usersService from '@/lib/api/services/users';
import * as chatService from '@/lib/api/services/chat';
import { useSession } from '@/lib/session/SessionProvider';

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

export function useConversations() {
  const { user } = useSession();
  return useQuery({
    queryKey: ['conversations', user?.id ?? 'guest'],
    queryFn: () => data.conversations(user?.id),
  });
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
    mutationFn: (text: string) => data.sendMessage(conversationId, text, user?.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversation', conversationId] }),
  });
}

export function useNotifications() {
  return useQuery({ queryKey: ['notifications'], queryFn: data.notifications });
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

import type { CommerceOrder } from '@/lib/contracts/domain';
import {
  allCommerceOrders,
  applyReturnCaseTransition,
  cancelCommerceOrder,
  confirmOrderReceipt,
  markOrderDispatched,
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
 * Order actions — live mode posts to /orders/:id/*; fixture mode mutates
 * the overlay. Each returns the invalidation promise so callers can await
 * the re-read.
 */
export function useOrderActions(orderId: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['orders'] });
  return {
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
    respondExtension: (accept: boolean) => {
      // No dedicated live endpoint on the shared backend yet — dispatch
      // extension accept/decline stays fixture-scoped.
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
    }) => {
      requestReturnCase(orderId, input);
      return invalidate();
    },
    stepIn: () => {
      requestReturnStepIn(orderId);
      return invalidate();
    },
    returnCaseAction: (action: ReturnCaseTransition) => {
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
      qc.setQueryData<Conversation>(['conversation', conversation.id], conversation);
      qc.setQueryData<Conversation[]>(['conversations'], (old) =>
        old ? [...old] : [conversation],
      );
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export interface SendChatMessageInput {
  text?: string;
  mediaUri?: string;
  mediaType?: 'image' | 'video';
}

/**
 * Send a message — text and/or media. Fixture mode appends through the
 * store grammar (row preview falls through text → 📷 Photo → systemTitle →
 * Offer) so the inbox row updates on the same write.
 */
export function useSendChatMessage(conversationId: string) {
  const qc = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: async (input: SendChatMessageInput): Promise<void> => {
      if (DATA_MODE === 'live') {
        await chatService.sendChatMessage(conversationId, input.text ?? '', user?.id);
        return;
      }
      await tick(60);
      const message: Message = {
        id: `local-${Date.now()}`,
        senderId: 'me',
        sender: 'me',
        text: input.text,
        mediaUri: input.mediaUri,
        mediaType: input.mediaType,
        type: input.mediaUri ? 'media' : 'text',
        timestamp: new Date().toISOString(),
        readStatus: 'sent',
      };
      appendFixtureMessage(conversationId, message);
    },
    onSuccess: () => {
      // Fresh references around the mutated fixture objects so the thread
      // and the inbox row re-render on the same write.
      qc.setQueryData<Conversation | null>(['conversation', conversationId], (old) =>
        old ? { ...old, messages: [...old.messages] } : old,
      );
      qc.setQueryData<Conversation[]>(['conversations'], (old) => (old ? [...old] : old));
      qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
