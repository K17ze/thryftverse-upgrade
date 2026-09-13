import React, { useCallback } from 'react';
import { View } from 'react-native';
import { ListRenderItem } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { OfflineBanner } from '../components/OfflineBanner';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { useStore } from '../store/useStore';
import { useConnectivity } from '../hooks/useConnectivity';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { useSettingsPreferences } from '../context/SettingsPreferencesContext';
import { isQuietHoursActive } from '../preferences/settingsPreferences';
import {
  SwipeableNotificationRow,
  NotificationSectionHeader,
  NotificationFilterTabs,
  NotificationFilterSheet,
  NotificationHeaderActions,
  QuietHoursBadge,
  NotificationsList } from '../components/notifications';
import type { NotificationListItem } from '../components/notifications/notificationViewModels';
import { useNotificationFeed, useNotificationActions } from '../hooks/notifications';
import { Space } from '../theme/designTokens';
type NavT = NativeStackNavigationProp<RootStackParamList>;

export default function NotificationsScreen() {
  const navigation = useNavigation<NavT>();
  const currentUser = useStore((state) => state.currentUser);
  const { isOffline } = useConnectivity();
  const { quietHours } = useSettingsPreferences();
  const quietActive = isQuietHoursActive(quietHours);

  const {
    notifications,
    setNotifications,
    isLoading,
    isLoadingMore,
    hasSyncError,
    isRefreshing,
    activeFilter,
    setActiveFilter,
    overflowVisible,
    setOverflowVisible,
    registerSwipeableRef,
    unreadCount,
    hasUnread,
    filterCounts,
    flattenedData,
    syncNotifications,
    loadMore,
    handleRefresh,
  } = useNotificationFeed();

  const {
    handleSwipeMarkRead,
    handleSwipeDismiss,
    handleMarkAllAsRead,
    handleOpenNotification,
  } = useNotificationActions({
    notifications,
    setNotifications,
    hasUnread,
  });

  const renderListItem = useCallback<ListRenderItem<NotificationListItem>>(
    ({ item }) => {
      if (item.type === 'header') {
        return (
          <NotificationSectionHeader
            sectionTitle={item.sectionTitle}
            unreadCount={item.unreadCount}
            isAttention={item.isAttention}
            itemCount={item.itemCount}
          />
        );
      }
      return (
        <SwipeableNotificationRow
          card={item.card}
          currentUserId={currentUser?.id}
          registerSwipeableRef={registerSwipeableRef}
          onOpen={handleOpenNotification}
          onSwipeMarkRead={handleSwipeMarkRead}
          onSwipeDismiss={handleSwipeDismiss}
        />
      );
    },
    [
      currentUser?.id,
      registerSwipeableRef,
      handleOpenNotification,
      handleSwipeMarkRead,
      handleSwipeDismiss,
    ]
  );

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Notifications"
          onBack={() => navigation.goBack()}
          rightAction={
            <NotificationHeaderActions
              activeFilter={activeFilter}
              unreadCount={unreadCount}
              onOpenFilters={() => setOverflowVisible(true)}
              onOpenPreferences={() => navigation.navigate('NotificationPreferences')}
              onMarkAllRead={handleMarkAllAsRead}
            />
          }
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >

      {/* Primary filter tabs — pill-style, always visible */}
      <NotificationFilterTabs
        activeFilter={activeFilter}
        filterCounts={filterCounts}
        onSelect={setActiveFilter}
      />

      {quietActive ? (
        <QuietHoursBadge onPress={() => navigation.navigate('PushNotifications')} />
      ) : null}

      {isOffline ? (
        <OfflineBanner onRetry={() => void handleRefresh()} />
      ) : null}

      {/* Sync error banner — visible when refresh fails but cached notifications exist */}
      {hasSyncError && notifications.length > 0 ? (
        <View style={{ paddingHorizontal: Space.md, marginBottom: Space.sm }}>
          <SyncRetryBanner
            message="Couldn't refresh notifications. Showing cached items."
            onRetry={() => void syncNotifications()}
            isRetrying={isLoading}
            telemetryContext="notifications_sync"
          />
        </View>
      ) : null}

      <NotificationsList
        data={flattenedData}
        renderItem={renderListItem}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
        onEndReached={loadMore}
        isLoading={isLoading}
        isLoadingMore={isLoadingMore}
        hasSyncError={hasSyncError}
        hasNotifications={notifications.length > 0}
        activeFilter={activeFilter}
        onRetry={() => void syncNotifications()}
        onDiscover={() => navigation.navigate('MainTabs')}
      />

      {/* Filter sheet — all filters behind a single overflow funnel icon */}
      <NotificationFilterSheet
        visible={overflowVisible}
        onDismiss={() => setOverflowVisible(false)}
        activeFilter={activeFilter}
        filterCounts={filterCounts}
        onSelect={(filter) => {
          setActiveFilter(filter);
          setOverflowVisible(false);
        }}
      />
    </FlagshipScreen>
  );
}
