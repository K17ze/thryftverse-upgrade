import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { haptics } from '../../utils/haptics';
import { Control } from '../../theme/designTokens';
import type { NotificationFilter } from './notificationViewModels';

export interface NotificationHeaderActionsProps {
  activeFilter: NotificationFilter;
  unreadCount: number;
  onOpenFilters: () => void;
  onOpenPreferences: () => void;
  onMarkAllRead: () => void;
}

/**
 * Header right-action cluster: overflow filter funnel (filled when a filter
 * is active), notification preferences, and mark-all-as-read (only rendered
 * while unread notifications exist).
 */
export function NotificationHeaderActions({
  activeFilter,
  unreadCount,
  onOpenFilters,
  onOpenPreferences,
  onMarkAllRead,
}: NotificationHeaderActionsProps) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.headerActions}>
      <AnimatedPressable
        style={styles.headerAction}
        onPress={() => { haptics.tap(); onOpenFilters(); }}
        accessibilityLabel="Filter notifications"
        accessibilityRole="button"
        hapticFeedback="light"
      >
        <Ionicons
          name={activeFilter !== 'all' ? 'filter' : 'filter-outline'}
          size={20}
          color={activeFilter !== 'all' ? colors.brand : colors.textSecondary}
        />
      </AnimatedPressable>
      <AnimatedPressable
        style={styles.headerAction}
        onPress={onOpenPreferences}
        accessibilityLabel="Manage notification preferences"
        accessibilityRole="button"
        hapticFeedback="light"
      >
        <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
      </AnimatedPressable>
      {unreadCount > 0 ? (
        <AnimatedPressable
          style={styles.headerAction}
          onPress={onMarkAllRead}
          accessibilityRole="button"
          accessibilityLabel={`Mark all ${unreadCount} notifications as read`}
          hapticFeedback="light"
        >
          <Ionicons name="checkmark-done-outline" size={22} color={colors.textPrimary} />
        </AnimatedPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center' },
  headerAction: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
});
