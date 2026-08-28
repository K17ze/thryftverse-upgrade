import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Typography, Radius, Type, Stroke } from '../theme/designTokens';
import { useStore } from '../store/useStore';
import { haptics } from '../utils/haptics';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { SettingsInfoBanner } from '../components/settings/SettingsInfoBanner';
import type { SupportTicket } from '../store/useStore';

type TicketFilter = 'all' | 'open' | 'resolved' | 'closed';

const FILTERS: Array<{ value: TicketFilter; label: string; accessibilityLabel: string }> = [
  { value: 'all', label: 'All', accessibilityLabel: 'Show all requests' },
  { value: 'open', label: 'Open', accessibilityLabel: 'Show open requests' },
  { value: 'resolved', label: 'Resolved', accessibilityLabel: 'Show resolved requests' },
  { value: 'closed', label: 'Closed', accessibilityLabel: 'Show closed requests' },
];

function getStatusConfig(colors: ThemeColors): Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> {
  return {
  open: { label: 'Open', color: colors.brand, icon: 'folder-open-outline' },
  resolved: { label: 'Resolved', color: colors.success, icon: 'checkmark-circle-outline' },
  closed: { label: 'Closed', color: colors.textMuted, icon: 'close-circle-outline' },
  };
}

function formatRelativeDate(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function ResolutionCentreScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const statusConfig = useMemo(() => getStatusConfig(colors), [colors]);
  const [filter, setFilter] = useState<TicketFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const supportTickets = useStore((state) => state.supportTickets);
  const loadSupportTicketsFromApi = useStore((state) => state.loadSupportTicketsFromApi);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      loadSupportTicketsFromApi()
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => { cancelled = true; };
    }, [loadSupportTicketsFromApi])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSupportTicketsFromApi().catch(() => {});
    setRefreshing(false);
  }, [loadSupportTicketsFromApi]);

  const filteredTickets = filter === 'all'
    ? [...supportTickets].sort((a, b) => b.updatedAt - a.updatedAt)
    : supportTickets
        .filter((t) => t.status === filter)
        .sort((a, b) => b.updatedAt - a.updatedAt);

  const openCount = supportTickets.filter((t) => t.status === 'open').length;

  // FlashList v2 performance: memoized renderItem prevents full re-render of
  // all visible ticket rows on every parent state change.
  // (Audit §FlashList v2 / LIST_RENDERING_POLICY.md §3.1)
  const renderTicketItem = useCallback(({ item }: { item: SupportTicket; index: number }) => {
    const statusCfg = statusConfig[item.status] ?? statusConfig.open;
    return (
      <View>
        <Pressable
          style={styles.ticketRow}
          onPress={() => navigation.navigate('SupportTicketDetail', { ticketId: item.id })}
          accessibilityRole="button"
          accessibilityLabel={`Support request: ${item.topicLabel}, ${statusCfg.label}`}
        >
          <Ionicons name={statusCfg.icon} size={24} color={statusCfg.color} />
          <View style={styles.ticketInfo}>
            <Text style={styles.ticketTopic} numberOfLines={1}>{item.topicLabel}</Text>
            <Text style={styles.ticketDetails} numberOfLines={2}>{item.details}</Text>
            <View style={styles.ticketMetaRow}>
              <View style={[styles.statusPill, { backgroundColor: `${statusCfg.color}12` }]}>
                <Text style={[styles.ticketStatus, { color: statusCfg.color }]}>{statusCfg.label}</Text>
              </View>
              <Text style={styles.ticketDate}>Updated {formatRelativeDate(item.updatedAt)}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
      </View>
    );
  }, [statusConfig, navigation, styles, colors.textMuted]);

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Resolution Centre"
          onBack={() => navigation.goBack()}
        />
      }
    >
      {/* Posture summary — flat canvas, no card chrome */}
      <SettingsInfoBanner
        tone="info"
        icon="headset"
        title={openCount > 0 ? `${openCount} open request${openCount !== 1 ? 's' : ''}` : 'No open requests'}
        description={`${supportTickets.length} total ticket${supportTickets.length !== 1 ? 's' : ''}`}
      />

      {/* Filter rail */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRailContent}
        style={styles.filterRail}
      >
        {FILTERS.map((opt) => {
          const count = opt.value === 'all'
            ? supportTickets.length
            : supportTickets.filter((t) => t.status === opt.value).length;
          const isActive = filter === opt.value;
          return (
            <Pressable
              key={opt.value}
              style={({ pressed }) => [styles.filterChip, isActive && styles.filterChipActive, pressed && { opacity: 0.7 }]}
              onPress={() => { haptics.selection(); setFilter(opt.value); }}
              accessibilityRole="button"
              accessibilityLabel={opt.accessibilityLabel}
            >
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {opt.label}
                {count > 0 && (
                  <Text style={styles.filterChipCount}> {count}</Text>
                )}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading && supportTickets.length === 0 ? (
        <FlagshipState variant="loading" />
      ) : filteredTickets.length === 0 ? (
        <FlagshipState
          variant="empty"
          icon="folder-open-outline"
          title={filter === 'open' ? 'No open requests' : 'No support requests'}
          subtitle={filter === 'open'
            ? 'You have no open support requests right now.'
            : 'If you have an issue with an order, open the order and tap "Report an issue".'}
        />
      ) : (
        <FlashList
          data={filteredTickets}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.brand} />
          }
          // Performance: support ticket lists can grow long; FlashList v2
          // handles recycling automatically.
          renderItem={renderTicketItem}
        />
      )}
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  filterRail: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingVertical: Space.sm,
    marginBottom: Space.sm,
  },
  filterRailContent: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 3,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brand,
  },
  filterChipText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
  },
  filterChipTextActive: {
    color: colors.textInverse,
    fontFamily: Typography.family.semibold,
  },
  filterChipCount: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    opacity: 0.7,
  },
  listContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  ticketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  ticketInfo: {
    flex: 1,
    gap: Space.xs / 2 + 1,
  },
  ticketTopic: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  ticketDetails: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
    lineHeight: Type.caption.size + 4,
  },
  ticketMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.xs,
  },
  statusPill: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs / 2,
    borderRadius: Radius.full,
  },
  ticketStatus: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
  },
  ticketDate: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
  },
  });
}
