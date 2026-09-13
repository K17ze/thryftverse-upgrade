import { useEffect, useMemo, useState } from 'react';
import { useBackendData } from '../../context/BackendDataContext';
import { useStore } from '../../store/useStore';
import { classifyConversation } from '../../utils/conversationClassification';
import type { InboxSegment } from './types';

/**
 * Owns the inbox filter surface state (search, segment rail, expanded
 * secondary filters, listing-scoped filter) and the derived conversation
 * projections: participant name lookup, the listing-scoped subset, the
 * visible sorted list, and the per-segment unread badge counts.
 */
export function useInboxFilters(routeListingId?: string) {
  const currentUser = useStore((state) => state.currentUser);
  const conversations = useStore((state) => state.conversations);
  const archivedIds = useStore((state) => state.archivedConversationIds);
  const messageRequests = useStore((state) => state.messageRequests);
  const { listings } = useBackendData();

  // ── Listing context filter (P2-06) ──
  // When navigated from ManageListing → Questions, the inbox scopes to
  // conversations about that specific listing. A local state override
  // lets the user clear the filter via "Show all" without navigating away.
  const [listingFilterId, setListingFilterId] = useState<string | undefined>(routeListingId);

  // Inbox is a mounted tab screen — re-seed when a later navigation carries
  // a different listingId (e.g. ManageListing → Questions for another item).
  useEffect(() => {
    if (routeListingId) setListingFilterId(routeListingId);
  }, [routeListingId]);
  const [searchQuery, setSearchQuery] = useState('');
  const [segment, setSegment] = useState<InboxSegment>('all');
  // Secondary filters (Unread, Archived, Groups) expand inline under the
  // filter icon — keeps the first viewport calm with the All/Buying/Selling/
  // Requests rail as the sole top-tier control.
  const [filterExpanded, setFilterExpanded] = useState(false);

  const participantNameLookup = useMemo(() => {
    const map = new Map<string, string>();
    map.set('me', currentUser?.username ?? 'you');
    if (currentUser?.id) {
      map.set(currentUser.id, currentUser.username);
    }
    for (const conversation of conversations) {
      for (const participant of conversation.participantProfiles ?? []) {
        map.set(participant.id, participant.displayName || participant.username);
      }
    }
    return map;
  }, [conversations, currentUser?.id, currentUser?.username]);

  // ── Listing-scoped filter ──
  // When a listingId filter is active, only conversations whose context
  // listing or itemId matches are shown. The filter is applied before
  // segment/search so the user sees a focused subset.
  const filteredByListing = useMemo(() => {
    if (!listingFilterId) return conversations;
    return conversations.filter((c) => {
      const contextListingId = c.context?.listing?.id;
      return contextListingId === listingFilterId || c.itemId === listingFilterId;
    });
  }, [conversations, listingFilterId]);

  const filteredListingTitle = useMemo(() => {
    if (!listingFilterId) return null;
    const listing = listings.find((l) => l.id === listingFilterId);
    return listing?.title ?? null;
  }, [listings, listingFilterId]);

  const visibleConversations = useMemo(() => {
    const normalizedQuery = String(searchQuery ?? '').trim().toLowerCase();
    const scoped = filteredByListing.filter((conversation) => {
      const isArchived = archivedIds.includes(conversation.id);
      const isRequest = messageRequests.includes(conversation.id);
      if (segment === 'unread' && !conversation.unread) return false;
      if (segment === 'groups' && conversation.type !== 'group') return false;
      if (segment === 'buying' && !classifyConversation(conversation, currentUser?.id).isBuying) return false;
      if (segment === 'selling' && !classifyConversation(conversation, currentUser?.id).isSelling) return false;
      if (segment === 'requests') return isRequest;
      if (segment === 'archived') return isArchived;

      // In 'all', hide requests and archived from main inbox

      if (segment === 'all' && (isArchived || isRequest)) return false;
      if (!normalizedQuery) return true;
      const counterpartyId = conversation.participantIds?.find((id) => id !== 'me' && id !== currentUser?.id);
      const title = conversation.type === 'group'
        ? conversation.title ?? 'group chat'
        : (counterpartyId ? participantNameLookup.get(counterpartyId) ?? 'Thryft user' : 'Thryft user');
      const corpus = [
        title,
        conversation.lastMessage ?? '',
        ...conversation.messages.slice(-10).map((m) => m.text ?? m.systemTitle ?? ''),
      ].join(' ').toLowerCase();
      return corpus.includes(normalizedQuery);
    });
    const ordered = [...scoped];
    ordered.sort((a, b) => {
      const pinDiff = Number(b.isPinned) - Number(a.isPinned);
      if (pinDiff !== 0) return pinDiff;
      const unreadDiff = Number(b.unread) - Number(a.unread);
      if (unreadDiff !== 0) return unreadDiff;
      return b.lastMessageTime.localeCompare(a.lastMessageTime);
    });
    return ordered;
  }, [filteredByListing, searchQuery, segment, currentUser?.id, participantNameLookup, archivedIds, messageRequests]);

  const buyingUnreadCount = useMemo(
    () => conversations.filter(
      (c) => !archivedIds.includes(c.id) && !messageRequests.includes(c.id) && c.unread && classifyConversation(c, currentUser?.id).isBuying
    ).length,
    [conversations, archivedIds, messageRequests, currentUser?.id]
  );
  const sellingUnreadCount = useMemo(
    () => conversations.filter(
      (c) => !archivedIds.includes(c.id) && !messageRequests.includes(c.id) && c.unread && classifyConversation(c, currentUser?.id).isSelling
    ).length,
    [conversations, archivedIds, messageRequests, currentUser?.id]
  );

  return {
    listingFilterId,
    setListingFilterId,
    filteredListingTitle,
    searchQuery,
    setSearchQuery,
    segment,
    setSegment,
    filterExpanded,
    setFilterExpanded,
    participantNameLookup,
    visibleConversations,
    buyingUnreadCount,
    sellingUnreadCount,
    messageRequests,
  };
}
