import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { EmptyState } from '../EmptyState';
import { RootStackParamList } from '../../navigation/types';
import type { InboxSegment } from '../../hooks/inbox';

type NavT = NativeStackNavigationProp<RootStackParamList>;

export interface InboxEmptyStateProps {
  syncError: string;
  isOffline: boolean;
  listingFilterId?: string;
  searchQuery: string;
  segment: InboxSegment;
  onRetry: () => Promise<void>;
  onShowAll: () => void;
  onClearSearch: () => void;
  onViewAll: () => void;
}

export function InboxEmptyState({
  syncError,
  isOffline,
  listingFilterId,
  searchQuery,
  segment,
  onRetry,
  onShowAll,
  onClearSearch,
  onViewAll,
}: InboxEmptyStateProps) {
  const navigation = useNavigation<NavT>();

  // A failed load with an empty list is an error state, not
  // "no conversations" — never let the two collapse together.
  if (syncError) {
    return (
      <EmptyState
        icon="cloud-offline-outline"
        title="Couldn't load messages"
        subtitle={isOffline ? 'You are offline. Reconnect and retry.' : 'Check your connection or retry.'}
        ctaLabel="Retry"
        onCtaPress={() => void onRetry()}
      />
    );
  }
  if (listingFilterId) {
    return (
      <EmptyState
        icon="chatbubbles-outline"
        title="No conversations about this listing"
        subtitle="When buyers message you about this item, their conversations will appear here."
        ctaLabel="Show all"
        onCtaPress={onShowAll}
      />
    );
  }
  if (searchQuery.trim()) {
    return (
      <EmptyState
        icon="search-outline"
        title="No matching conversations"
        subtitle="Try another keyword or filter."
        ctaLabel="Clear search"
        onCtaPress={onClearSearch}
      />
    );
  }
  switch (segment) {
    case 'unread':
      return (
        <EmptyState
          icon="mail-open-outline"
          title="No unread messages"
          subtitle="You're all caught up."
          ctaLabel="View all"
          onCtaPress={onViewAll}
        />
      );
    case 'requests':
      return (
        <EmptyState
          icon="mail-unread-outline"
          title="No message requests"
          subtitle="Requests from people you don't follow will appear here."
          ctaLabel="View all"
          onCtaPress={onViewAll}
        />
      );
    case 'archived':
      return (
        <EmptyState
          icon="archive-outline"
          title="No archived conversations"
          subtitle="Archived chats will appear here."
          ctaLabel="View all"
          onCtaPress={onViewAll}
        />
      );
    case 'groups':
      return (
        <EmptyState
          icon="people-outline"
          title="No groups yet"
          subtitle="Create a group to chat with multiple people."
          ctaLabel="Create group"
          onCtaPress={() => navigation.navigate('CreateGroupChat')}
        />
      );
    case 'buying':
      return (
        <EmptyState
          icon="cart-outline"
          title="No buying conversations"
          subtitle="When you message a seller about a listing, it'll appear here."
          ctaLabel="Browse listings"
          onCtaPress={() => navigation.navigate('MainTabs')}
        />
      );
    case 'selling':
      return (
        <EmptyState
          icon="pricetag-outline"
          title="No selling conversations"
          subtitle="When buyers message you about your listings, they'll appear here."
          ctaLabel="View all"
          onCtaPress={onViewAll}
        />
      );
    default:
      return (
        <EmptyState
          icon="chatbubbles-outline"
          title="No conversations yet"
          subtitle="Start chatting with a seller to see your messages here."
          ctaLabel="Browse listings"
          onCtaPress={() => navigation.navigate('MainTabs')}
        />
      );
  }
}
