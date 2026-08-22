import { useQuery } from '@tanstack/react-query';
import { fetchConversationsFromApi } from '../services/chatApi';
import { fetchChatBotsFromApi } from '../services/chatApi';
import { fetchCustomBotsFromApi } from '../services/botsApi';
import { listCollections } from '../services/collectionsApi';
import {
  listSupportTickets,
  listSupportTicketsForOrder,
} from '../services/supportApi';
import { fetchMyProfile } from '../services/profileApi';
import type { Conversation, ChatBot } from '../domain';
import type { Collection } from '../services/collectionsApi';
import type { SupportTicket } from '../services/supportApi';
import type { ProfileUser } from '../services/profileApi';

const STALE_TIME_5_MIN = 5 * 60 * 1000;
const STALE_TIME_2_MIN = 2 * 60 * 1000;
const STALE_TIME_1_MIN = 60 * 1000;

/**
 * useInboxData — React Query hook that fetches conversations for the inbox
 * screen. Replaces the `useEffect + fetchConversationsFromApi + upsertConversation`
 * Zustand pattern in InboxScreen.
 *
 * Query key: `['chat', 'conversations']`
 * Stale time: 2 minutes (conversations change frequently).
 */
export function useInboxData() {
  return useQuery<Conversation[]>({
    queryKey: ['chat', 'conversations'],
    queryFn: () => fetchConversationsFromApi(),
    staleTime: STALE_TIME_2_MIN,
  });
}

/**
 * useChatBotsData — React Query hook that fetches system chat bots.
 * Replaces the `loadBotsFromApi` Zustand action used by BotDirectoryScreen
 * and InboxScreen.
 *
 * Query key: `['chat', 'bots', 'system']`
 * Stale time: 5 minutes (bots rarely change).
 */
export function useChatBotsData() {
  return useQuery<ChatBot[]>({
    queryKey: ['chat', 'bots', 'system'],
    queryFn: () => fetchChatBotsFromApi(),
    staleTime: STALE_TIME_5_MIN,
  });
}

/**
 * useCustomBotsData — React Query hook that fetches the current user's
 * custom bots. Replaces the `loadBotsFromApi` Zustand action used by
 * CustomBotsScreen.
 *
 * Query key: `['chat', 'bots', 'custom']`
 * Stale time: 5 minutes (custom bots change infrequently).
 */
export function useCustomBotsData() {
  return useQuery<ChatBot[]>({
    queryKey: ['chat', 'bots', 'custom'],
    queryFn: () => fetchCustomBotsFromApi(),
    staleTime: STALE_TIME_5_MIN,
  });
}

/**
 * useClosetData — React Query hook that fetches the current user's
 * collections. Replaces the `loadCollectionsFromApi` Zustand action used
 * by ClosetScreen.
 *
 * Query key: `['user', 'collections', 'me']`
 * Stale time: 5 minutes (collections change infrequently).
 */
export function useClosetData() {
  return useQuery<Collection[]>({
    queryKey: ['user', 'collections', 'me'],
    queryFn: () => listCollections(),
    staleTime: STALE_TIME_5_MIN,
  });
}

/**
 * useSupportTicketsData — React Query hook that fetches all support tickets
 * for the current user. Replaces the `loadSupportTicketsFromApi` Zustand
 * action used by ResolutionCentreScreen.
 *
 * Query key: `['support', 'tickets']`
 * Stale time: 1 minute (ticket status may update frequently).
 */
export function useSupportTicketsData() {
  return useQuery<SupportTicket[]>({
    queryKey: ['support', 'tickets'],
    queryFn: () => listSupportTickets(),
    staleTime: STALE_TIME_1_MIN,
  });
}

/**
 * useOrderSupportTicketsData — React Query hook that fetches support tickets
 * for a specific order. Replaces the `loadSupportTicketsForOrderFromApi`
 * Zustand action used by OrderSupportScreen and OrderDetailScreen.
 *
 * Query key: `['support', 'tickets', 'order', orderId]`
 * Stale time: 1 minute.
 *
 * @param orderId - The order ID to fetch tickets for.
 */
export function useOrderSupportTicketsData(orderId: string | undefined) {
  return useQuery<SupportTicket[]>({
    queryKey: orderId
      ? ['support', 'tickets', 'order', orderId]
      : ['support', 'tickets', 'order', 'none'],
    queryFn: () => listSupportTicketsForOrder(orderId!),
    enabled: Boolean(orderId),
    staleTime: STALE_TIME_1_MIN,
  });
}

/**
 * useMyProfileData — React Query hook that fetches the current user's
 * profile. Replaces the `fetchMyProfile` Zustand action used by
 * MyProfileScreen, EditProfileScreen, and AuthLandingScreen.
 *
 * Query key: `['user', 'profile', 'me']`
 * Stale time: 5 minutes (profile data changes infrequently).
 */
export function useMyProfileData() {
  return useQuery<ProfileUser>({
    queryKey: ['user', 'profile', 'me'],
    queryFn: () => fetchMyProfile(),
    staleTime: STALE_TIME_5_MIN,
  });
}
