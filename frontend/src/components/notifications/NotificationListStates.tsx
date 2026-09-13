import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { EmptyState } from '../EmptyState';
import { SkeletonLoader } from '../SkeletonLoader';
import { Radius, Space } from '../../theme/designTokens';
import {
  filterLabelForKey,
  type NotificationFilter } from './notificationViewModels';

function NotificationSkeletonRows({ count }: { count: number }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <>
      {Array.from({ length: count }, (_, index) => index).map((index) => (
        <View key={index} style={styles.notificationSkeletonRow}>
          <SkeletonLoader width={40} height={40} borderRadius={Radius.md} />
          <View style={styles.notificationSkeletonCopy}>
            <SkeletonLoader width={index % 2 === 0 ? '58%' : '44%'} height={13} borderRadius={Radius.sm} />
            <SkeletonLoader width={index % 2 === 0 ? '88%' : '76%'} height={11} borderRadius={Radius.sm} style={{ marginTop: Space.sm }} />
            <SkeletonLoader width="30%" height={9} borderRadius={Radius.sm} style={{ marginTop: Space.sm }} />
          </View>
        </View>
      ))}
    </>
  );
}

/** Full-list loading skeleton shown while the first page is in flight. */
export function NotificationListLoading() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.notificationSkeletonList} accessibilityLabel="Loading notifications">
      <NotificationSkeletonRows count={5} />
    </View>
  );
}

/** Pagination footer skeleton shown while the next page is in flight. */
export function NotificationListFooter() {
  return (
    <View accessibilityLabel="Loading more notifications">
      <NotificationSkeletonRows count={2} />
    </View>
  );
}

export interface NotificationListEmptyProps {
  isLoading: boolean;
  hasSyncError: boolean;
  hasNotifications: boolean;
  activeFilter: NotificationFilter;
  onRetry: () => void;
  onDiscover: () => void;
}

/**
 * List empty state, in priority order:
 *   1. loading skeleton (first page in flight)
 *   2. sync error with no cached items (retryable)
 *   3. non-'all' filter with notifications present (filtered-empty)
 *   4. fully caught up (discover CTA)
 */
export function NotificationListEmpty({
  isLoading,
  hasSyncError,
  hasNotifications,
  activeFilter,
  onRetry,
  onDiscover,
}: NotificationListEmptyProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (isLoading) {
    return <NotificationListLoading />;
  }

  if (hasSyncError && !hasNotifications) {
    return (
      <EmptyState
        density="compact"
        icon="cloud-offline-outline"
        title="Couldn't load notifications"
        subtitle="Pull down to refresh and try again."
        iconColor={colors.textMuted}
        ctaLabel="Retry"
        onCtaPress={onRetry}
      />
    );
  }

  if (activeFilter !== 'all' && hasNotifications) {
    return (
      <EmptyState
        density="compact"
        icon="notifications-outline"
        title={`No ${filterLabelForKey(activeFilter).toLowerCase()} yet`}
        subtitle="Switch to 'All' to see everything."
        iconColor={colors.textMuted}
      />
    );
  }

  return (
    <EmptyState
      density="compact"
      graphic={
        <View style={styles.caughtUpGraphic}>
          <Ionicons name="checkmark-circle" size={40} color={colors.brand} />
        </View>
      }
      title="You're all caught up"
      subtitle="Nothing needs your attention right now."
      hint="Explore new arrivals while you're here."
      ctaLabel="Discover listings"
      onCtaPress={onDiscover}
      iconColor={colors.brand}
    />
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  caughtUpGraphic: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.sm },
  notificationSkeletonList: {
    paddingTop: Space.sm },
  notificationSkeletonRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border },
  notificationSkeletonCopy: {
    flex: 1 },
  });
}
