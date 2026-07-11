import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ActiveTheme, Colors } from '../constants/colors';
import { Space, Typography } from '../theme/designTokens';
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
        {FILTERS.map((opt) => {
          const count = opt.value === 'all'
            ? supportTickets.length
            : supportTickets.filter((t) => t.status === opt.value).length;
          return (
            <Pressable
              key={opt.value}
              style={[styles.filterChip, filter === opt.value && styles.filterChipActive]}
              onPress={() => setFilter(opt.value)}
              accessibilityRole="button"
              accessibilityLabel={opt.accessibilityLabel}
            >
              <Text style={[styles.filterChipText, filter === opt.value && styles.filterChipTextActive]}>
                {opt.label}
                {count > 0 && ` (${count})`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading && supportTickets.length === 0 ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={Colors.brand} />
          <Text style={styles.centerStateText}>Loading your requests…</Text>
        </View>
      ) : filteredTickets.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="folder-open-outline" size={48} color={Colors.textMuted} />
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
                    <Text style={[styles.ticketStatus, { color: statusCfg.color }]}>{statusCfg.label}</Text>
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
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  filterChipActive: {
    borderColor: Colors.brand,
    backgroundColor: `${Colors.brand}08`,
  },
  filterChipText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },
  filterChipTextActive: {
    color: Colors.brand,
    fontFamily: Typography.family.semibold,
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
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  statusIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: 12,
    marginTop: 2,
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
  centerStateText: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
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
});
