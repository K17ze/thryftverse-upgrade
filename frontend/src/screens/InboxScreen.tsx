import React, { useCallback, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation, useScrollToTop, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { type FlashListRef } from '@shopify/flash-list';
import { useAppTheme } from '../theme/ThemeContext';
import type { Conversation } from '../domain';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { OfflineBanner } from '../components/OfflineBanner';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useInboxData,
  useInboxRealtime,
  useInboxFilters,
  useInboxActions,
  type InboxSegment,
} from '../hooks/inbox';
import { InboxHeader } from '../components/inbox/InboxHeader';
import { InboxFilters } from '../components/inbox/InboxFilters';
import { InboxSyncBanner, InboxListingFilterBanner } from '../components/inbox/InboxBanners';
import { InboxList } from '../components/inbox/InboxList';
import { InboxEmptyState } from '../components/inbox/InboxEmptyState';
import { InboxRow } from '../components/inbox/InboxRow';
import { InboxSheets } from '../components/inbox/InboxSheets';

type NavT = NativeStackNavigationProp<RootStackParamList>;
type InboxRoute = RouteProp<RootStackParamList, 'Inbox'>;
type ConvoItem = Conversation;

export default function InboxScreen() {
  const { colors } = useAppTheme();
  const navigation = useNavigation<NavT>();
  const route = useRoute<InboxRoute>();

  // Data lifecycle: focus refetch (initial mount + returns from Chat/offers/
  // orders), pull-to-refresh, connectivity, sync error, readiness milestones.
  const {
    refreshing,
    isLoading,
    syncError,
    isOffline,
    loadConversations,
    handleRefresh,
  } = useInboxData();

  // Realtime subscriptions — new-message events live-update inbox rows and
  // group identity updates keep titles/avatars current; both can trigger a
  // full reload for threads not yet in the local store.
  useInboxRealtime(loadConversations);

  // Filter surface: listing-scoped filter (seeded from route params), search,
  // segment rail, expanded secondary filters, and the derived list/counts.
  const {
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
  } = useInboxFilters(route.params?.listingId);

  // Row/conversation actions plus the confirmation and quick-action sheets.
  const {
    confirmSheet,
    actionSheet,
    dismissConfirmSheet,
    dismissActionSheet,
    handleDelete,
    handleMute,
    handleArchive,
    handleAcceptRequest,
    handleDeclineRequest,
    handlePin,
    handleToggleRead,
    handleQuickActions,
  } = useInboxActions();

  const currentUser = useStore((state) => state.currentUser);
  const mutedIds = useStore((state) => state.mutedConversationIds);
  const profileMediaOverrides = useStore((state) => state.profileMediaOverrides);
  const markConversationRead = useStore((state) => state.markConversationRead);
  const { listings } = useBackendData();

  const listRef = useRef<FlashListRef<Conversation>>(null);
  useScrollToTop(listRef);

  // Everything behind the sheets is hidden from screen readers while a sheet
  // is open — the sheets render outside the a11y wrap below.
  const sheetsOpen = actionSheet.visible || confirmSheet.visible;

  const handleOpenConversation = useCallback((id: string) => {
    markConversationRead(id);
    navigation.navigate('Chat', {
      conversationId: id,
      focusQuery: searchQuery.trim() || undefined,
    });
  }, [markConversationRead, navigation, searchQuery]);

  const handleSelectSecondaryFilter = useCallback((key: InboxSegment) => {
    setSegment(key);
    setFilterExpanded(false);
  }, [setSegment, setFilterExpanded]);

  // FlashList v2 performance: memoized renderItem prevents full re-render of
  // all visible conversation rows on every parent state change.
  // (Audit §FlashList v2 / LIST_RENDERING_POLICY.md §3.1)
  const renderItem = useCallback(({ item, index }: { item: ConvoItem; index: number }) => (
    <InboxRow
      item={item}
      index={index}
      currentUserId={currentUser?.id}
      participantNameLookup={participantNameLookup}
      isRequest={messageRequests.includes(item.id)}
      isMuted={mutedIds.includes(item.id)}
      profileMediaOverrides={profileMediaOverrides}
      itemThumbUri={item.itemId ? (listings.find((l) => l.id === item.itemId)?.images?.[0] ?? null) : undefined}
      onOpenConversation={handleOpenConversation}
      onQuickActions={handleQuickActions}
      onToggleRead={handleToggleRead}
      onArchive={handleArchive}
      onAcceptRequest={handleAcceptRequest}
      onDeclineRequest={handleDeclineRequest}
    />
  ), [
    currentUser,
    participantNameLookup,
    messageRequests,
    mutedIds,
    profileMediaOverrides,
    listings,
    handleOpenConversation,
    handleQuickActions,
    handleToggleRead,
    handleArchive,
    handleAcceptRequest,
    handleDeclineRequest,
  ]);

  return (
    <SafeAreaView testID="inbox-screen" edges={['top']} style={[styles.screenRoot, { backgroundColor: colors.background }]}>
      {/* Everything behind the sheets is hidden from screen readers while a
          sheet is open — but the sheets themselves must stay OUTSIDE this
          wrapper: BottomSheet renders in-tree, so hiding an ancestor would
          hide the open sheet too (audit M2). */}
      <View
        style={styles.a11yContentWrap}
        accessibilityElementsHidden={sheetsOpen}
        importantForAccessibility={sheetsOpen ? 'no-hide-descendants' : 'auto'}
      >
        <InboxHeader
          username={currentUser?.username}
          filterExpanded={filterExpanded}
          segment={segment}
          onToggleFilters={() => setFilterExpanded((v) => !v)}
        />
        <InboxFilters
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          segment={segment}
          onSelectSegment={setSegment}
          onSelectSecondaryFilter={handleSelectSecondaryFilter}
          filterExpanded={filterExpanded}
          buyingUnreadCount={buyingUnreadCount}
          sellingUnreadCount={sellingUnreadCount}
          requestsCount={messageRequests.length}
        />
        {isOffline && (
          <OfflineBanner message="You are offline" />
        )}
        {/* Slim sync banner only when content is on screen — with an empty
            list the EmptyState carries the error + retry instead. */}
        {!!syncError && visibleConversations.length > 0 && (
          <InboxSyncBanner onRetry={loadConversations} />
        )}
        {listingFilterId && (
          <InboxListingFilterBanner
            title={filteredListingTitle ?? 'Listing'}
            onShowAll={() => setListingFilterId(undefined)}
          />
        )}
        <InboxList
          listRef={listRef}
          data={visibleConversations}
          renderItem={renderItem}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          isLoading={isLoading}
          showRequestsBanner={segment === 'all' && messageRequests.length > 0 && !filterExpanded}
          requestsCount={messageRequests.length}
          emptyComponent={
            <InboxEmptyState
              syncError={syncError}
              isOffline={isOffline}
              listingFilterId={listingFilterId}
              searchQuery={searchQuery}
              segment={segment}
              onRetry={loadConversations}
              onShowAll={() => setListingFilterId(undefined)}
              onClearSearch={() => setSearchQuery('')}
              onViewAll={() => setSegment('all')}
            />
          }
        />
      </View>
      <InboxSheets
        confirmSheet={confirmSheet}
        onDismissConfirmSheet={dismissConfirmSheet}
        actionSheet={actionSheet}
        onDismissActionSheet={dismissActionSheet}
        onMuteConversation={handleMute}
        onPinConversation={handlePin}
        onDeleteConversation={handleDelete}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
  },
  // Wraps all behind-the-sheet content so one accessibilityElementsHidden
  // flag covers header, filters and the list. flex:1 keeps the geometry
  // identical to the screen root it fills.
  a11yContentWrap: {
    flex: 1,
  },
});
