import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ActiveTheme, Colors } from '../constants/colors';
import { Space, Typography, Radius } from '../theme/designTokens';
import { useStore } from '../store/useStore';
import { TradeHeader } from '../components/trade/TradeHeader';

type TicketFilter = 'all' | 'open' | 'resolved' | 'closed';

const FILTERS: Array<{ value: TicketFilter; label: string; accessibilityLabel: string }> = [
  { value: 'all', label: 'All', accessibilityLabel: 'Show all requests' },
  { value: 'open', label: 'Open', accessibilityLabel: 'Show open requests' },
  { value: 'resolved', label: 'Resolved', accessibilityLabel: 'Show resolved requests' },
  { value: 'closed', label: 'Closed', accessibilityLabel: 'Show closed requests' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  open: { label: 'Open', color: Colors.brand, icon: 'folder-open-outline' },
  resolved: { label: 'Resolved', color: Colors.success, icon: 'checkmark-circle-outline' },
  closed: { label: 'Closed', color: Colors.textMuted, icon: 'close-circle-outline' },
};

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

const SKELETON_COUNT = 4;

function TicketSkeleton() {
  return (
    <View style={styles.ticketCard}>
      <View style={[styles.statusIconWrap, { backgroundColor: Colors.surfaceAlt }]} />
      <View style={styles.ticketInfo}>
        <View style={styles.skeletonTopic} />
        <View style={styles.skeletonDetails} />
        <View style={styles.skeletonMetaRow}>
          <View style={styles.skeletonMetaShort} />
          <View style={styles.skeletonMetaLong} />
        </View>
      </View>
      <View style={styles.skeletonChevron} />
    </View>
  );
}

export default function ResolutionCentreScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
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

  return (
    <View style={styles.container}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} />

      <TradeHeader title="Resolution Centre" onBack={() => navigation.goBack()} />

      {/* Filter rail */}
      <View style={styles.filterRail}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRailContent}
        >
          {FILTERS.map((opt) => {
            const count = opt.value === 'all'
              ? supportTickets.length
              : supportTickets.filter((t) => t.status === opt.value).length;
            const isActive = filter === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setFilter(opt.value)}
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
      </View>

      {loading && supportTickets.length === 0 ? (
        <View style={styles.listContent}>
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <TicketSkeleton key={i} />
          ))}
        </View>
      ) : filteredTickets.length === 0 ? (
        <View style={styles.centerState}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="folder-open-outline" size={36} color={Colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>
            {filter === 'open' ? 'No open requests' : 'No support requests'}
          </Text>
          <Text style={styles.emptySub}>
            {filter === 'open'
              ? 'You have no open support requests right now.'
              : 'If you have an issue with an order, open the order and tap "Report an issue".'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredTickets}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.brand} />
          }
          renderItem={({ item }) => {
            const statusCfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.open;
            return (
              <Pressable
                style={styles.ticketCard}
                onPress={() => navigation.navigate('SupportTicketDetail', { ticketId: item.id })}
                accessibilityRole="button"
                accessibilityLabel={`Support request: ${item.topicLabel}, ${statusCfg.label}`}
              >
                <View style={[styles.statusIconWrap, { backgroundColor: `${statusCfg.color}15` }]}>
                  <Ionicons name={statusCfg.icon} size={18} color={statusCfg.color} />
                </View>
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
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  filterRail: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    paddingVertical: Space.sm,
  },
  filterRailContent: {
    paddingHorizontal: Space.md,
    gap: 8,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  filterChipActive: {
    borderColor: Colors.brand,
    backgroundColor: Colors.brand,
  },
  filterChipText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },
  filterChipTextActive: {
    color: Colors.textInverse,
    fontFamily: Typography.family.semibold,
  },
  filterChipCount: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    opacity: 0.7,
  },
  listContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  ticketCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    marginBottom: Space.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  statusIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ticketInfo: {
    flex: 1,
    gap: 3,
  },
  ticketTopic: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  ticketDetails: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  ticketMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  ticketStatus: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
  },
  ticketDate: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  emptySub: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  // ── Skeleton ──
  skeletonTopic: {
    width: '60%',
    height: 14,
    borderRadius: 4,
    backgroundColor: Colors.surfaceAlt,
  },
  skeletonDetails: {
    width: '90%',
    height: 12,
    borderRadius: 4,
    backgroundColor: Colors.surfaceAlt,
    marginTop: 2,
  },
  skeletonMetaRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
    alignItems: 'center',
  },
  skeletonMetaShort: {
    width: 50,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.surfaceAlt,
  },
  skeletonMetaLong: {
    width: 80,
    height: 10,
    borderRadius: 4,
    backgroundColor: Colors.surfaceAlt,
  },
  skeletonChevron: {
    width: 18,
    height: 18,
    borderRadius: 4,
    backgroundColor: Colors.surfaceAlt,
  },
});
