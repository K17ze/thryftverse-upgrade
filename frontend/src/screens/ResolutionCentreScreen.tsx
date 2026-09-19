import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  RefreshControl,
  ScrollView } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Typography, Radius, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useStore } from '../store/useStore';
import { haptics } from '../utils/haptics';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { SettingsInfoBanner } from '../components/settings/SettingsInfoBanner';
import { AppIcon } from '../components/common/AppIcon';
import { IconSize } from '../theme/iconTokens';
import { useAppTranslation } from '../i18n/useAppTranslation';
import type { SupportTicket } from '../store/useStore';

// The `t` returned by useAppTranslation is branded to the app's namespaces —
// typing helpers against this keeps key checking intact.
type AppTFunction = ReturnType<typeof useAppTranslation>['t'];

type TicketFilter = 'all' | 'open' | 'resolved' | 'closed';

const FILTERS: Array<{ value: TicketFilter; labelKey: string; accessibilityKey: string }> = [
  { value: 'all', labelKey: 'resolutionCentre.filterAll', accessibilityKey: 'resolutionCentre.a11yShowAll' },
  { value: 'open', labelKey: 'resolutionCentre.filterOpen', accessibilityKey: 'resolutionCentre.a11yShowOpen' },
  { value: 'resolved', labelKey: 'resolutionCentre.filterResolved', accessibilityKey: 'resolutionCentre.a11yShowResolved' },
  { value: 'closed', labelKey: 'resolutionCentre.filterClosed', accessibilityKey: 'resolutionCentre.a11yShowClosed' },
];

function getStatusConfig(colors: ThemeColors): Record<string, { labelKey: string; color: string; icon: string }> {
  return {
    open: { labelKey: 'resolutionCentre.statusOpen', color: colors.brand, icon: 'folder' },
    resolved: { labelKey: 'resolutionCentre.statusResolved', color: colors.successText, icon: 'checkmark-circle-outline' },
    closed: { labelKey: 'resolutionCentre.statusClosed', color: colors.textMuted, icon: 'close' },
  };
}

function formatRelativeDate(timestamp: number, t: AppTFunction): string {
  const now = Date.now();
  const diff = now - timestamp;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days === 0) return t('resolutionCentre.dateToday');
  if (days === 1) return t('resolutionCentre.dateYesterday');
  if (days < 7) return t('resolutionCentre.dateDaysAgo', { days });
  if (days < 30) return t('resolutionCentre.dateWeeksAgo', { weeks: Math.floor(days / 7) });
  return t('resolutionCentre.dateMonthsAgo', { months: Math.floor(days / 30) });
}

export default function ResolutionCentreScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { t } = useAppTranslation('settings');
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
    const statusLabel = t(statusCfg.labelKey);
    return (
      <View>
        <Pressable
          style={styles.ticketRow}
          onPress={() => navigation.navigate('SupportTicketDetail', { ticketId: item.id })}
          accessibilityRole="button"
          accessibilityLabel={t('resolutionCentre.a11yTicket', { topic: item.topicLabel, status: statusLabel })}
        >
          <AppIcon name={statusCfg.icon} size={IconSize.lg} color={statusCfg.color} opticalCenter accessible={false} />
          <View style={styles.ticketInfo}>
            <Text style={styles.ticketTopic} numberOfLines={1}>{item.topicLabel}</Text>
            <Text style={styles.ticketDetails} numberOfLines={2}>{item.details}</Text>
            <View style={styles.ticketMetaRow}>
              {/* TODO: replace `${statusCfg.color}12` with statusColorSubtle token when available */}
              <View style={[styles.statusPill, { backgroundColor: `${statusCfg.color}12` }]}>
                <Text style={[styles.ticketStatus, { color: statusCfg.color }]}>{statusLabel}</Text>
              </View>
              <Text style={styles.ticketDate}>
                {t('resolutionCentre.updated', { when: formatRelativeDate(item.updatedAt, t) })}
              </Text>
            </View>
          </View>
          <AppIcon name="forward" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
        </Pressable>
      </View>
    );
  }, [statusConfig, navigation, styles, t]);

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title={t('rows.resolutionCentre')}
          onBack={() => navigation.goBack()}
        />
      }
    >
      {/* Posture summary — flat canvas, no card chrome */}
      <SettingsInfoBanner
        tone="info"
        icon="headset"
        title={openCount > 0 ? t('resolutionCentre.openCount', { count: openCount }) : t('resolutionCentre.noneOpen')}
        description={t('resolutionCentre.totalCount', { count: supportTickets.length })}
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
              accessibilityLabel={t(opt.accessibilityKey)}
            >
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {t(opt.labelKey)}
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
          title={filter === 'open' ? t('resolutionCentre.emptyOpenTitle') : t('resolutionCentre.emptyTitle')}
          subtitle={filter === 'open'
            ? t('resolutionCentre.emptyOpenSubtitle')
            : t('resolutionCentre.emptySubtitle')}
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
    marginBottom: Space.sm },
  filterRailContent: {
    paddingHorizontal: Space.md,
    gap: Space.sm,
    alignItems: 'center' },
  filterChip: {
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 3,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    backgroundColor: colors.surface },
  filterChipActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brand },
  filterChipText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
  filterChipTextActive: {
    color: colors.textInverse,
    fontFamily: Typography.family.semibold },
  filterChipCount: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    opacity: 0.7 },
  listContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm },
  ticketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border },
  ticketInfo: {
    flex: 1,
    gap: Space.xs / 2 + 1 },
  ticketTopic: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  ticketDetails: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    lineHeight: TypographyV2.meta.size + 4 },
  ticketMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.xs },
  statusPill: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs / 2,
    borderRadius: Radius.full },
  ticketStatus: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  ticketDate: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted } });
}
