import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  LayoutAnimation,
  Platform,
  UIManager,
  type StyleProp,
  type ImageStyle,
  type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FlashList, type FlashListProps } from '@shopify/flash-list';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps, RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Typography, Stroke, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';
import { CachedImage } from '../components/CachedImage';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useConnectivity } from '../hooks/useConnectivity';
import {
  fetchUserListingsFromApi,
  patchListingOnApi,
  deleteListingOnApi,
  type ListingApiItem } from '../services/listingsApi';
import {
  submitSellerHubBatchCommand,
  type SellerHubBatchResult } from '../services/sellerHubApi';
import { parseApiError } from '../lib/apiClient';
import { useFormattedPrice } from '../hooks/useFormattedPrice';

type Props = NativeStackScreenProps<RootStackParamList, 'InventoryManagement'>;

type FilterTab = 'all' | 'active' | 'sold' | 'paused' | 'draft';
type SortOption = 'recent' | 'price_high' | 'price_low' | 'most_viewed' | 'best_selling';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'sold', label: 'Sold' },
  { key: 'paused', label: 'Paused' },
  { key: 'draft', label: 'Draft' },
];

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: 'recent', label: 'Recently listed' },
  { key: 'price_high', label: 'Price (high to low)' },
  { key: 'price_low', label: 'Price (low to high)' },
  { key: 'most_viewed', label: 'Most viewed' },
  { key: 'best_selling', label: 'Best selling' },
];

// Enable LayoutAnimation for selection-mode transitions on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const InventoryFlashList = FlashList as unknown as React.ComponentType<
  FlashListProps<ListingApiItem> & { estimatedItemSize: number }
>;

export default function InventoryManagementScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const { isOffline } = useConnectivity();
  const currentUser = useStore((state) => state.currentUser);
  const { currencyCode, formatFromFiat } = useFormattedPrice();

  const [listings, setListings] = useState<ListingApiItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [sortOption, setSortOption] = useState<SortOption>('recent');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  // Bulk selection
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Action-in-flight tracking (per-row optimistic status updates)
  const [pendingActionIds, setPendingActionIds] = useState<Set<string>>(new Set());

  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    variant: 'default' | 'danger';
  }>(() => ({ visible: false, title: '', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', onConfirm: () => {}, variant: 'default' as const }));

  const load = useCallback(async (silent = false) => {
    if (!currentUser?.id) {
      setIsLoading(false);
      return;
    }
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const res = await fetchUserListingsFromApi(currentUser.id, { limit: 200 });
      setListings(res.items);
    } catch (err) {
      const isNetworkError = isOffline || (err instanceof Error && /network|fetch|timeout/i.test(err.message));
      const parsed = parseApiError(err, isNetworkError ? 'You appear to be offline. Check your connection and try again.' : undefined);
      setError(parsed.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [currentUser?.id, isOffline]);

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      void load();
    }, [load])
  );

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    void load(true);
  }, [load]);

  // ── Derived summary ──
  const summary = useMemo(() => {
    const active = listings.filter((l) => l.status === 'active');
    const sold = listings.filter((l) => l.status === 'sold');
    const paused = listings.filter((l) => l.status === 'paused');
    const draft = listings.filter((l) => l.status === 'draft');
    const totalValue = active.reduce((sum, l) => sum + l.priceGbp, 0);
    return {
      total: listings.length,
      active: active.length,
      sold: sold.length,
      paused: paused.length,
      draft: draft.length,
      totalValue };
  }, [listings]);

  // ── Filtered + sorted list ──
  const filteredListings = useMemo(() => {
    let result = listings;
    if (activeFilter !== 'all') {
      result = result.filter((l) => l.status === activeFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          (l.brand ?? '').toLowerCase().includes(q)
      );
    }
    const sorted = [...result];
    switch (sortOption) {
      case 'price_high':
        sorted.sort((a, b) => b.priceGbp - a.priceGbp);
        break;
      case 'price_low':
        sorted.sort((a, b) => a.priceGbp - b.priceGbp);
        break;
      case 'most_viewed':
        sorted.sort((a, b) => (b.engagement?.views ?? 0) - (a.engagement?.views ?? 0));
        break;
      case 'best_selling':
        sorted.sort((a, b) => {
          const aSold = a.status === 'sold' ? 1 : 0;
          const bSold = b.status === 'sold' ? 1 : 0;
          if (bSold !== aSold) return bSold - aSold;
          return (b.engagement?.likes ?? 0) - (a.engagement?.likes ?? 0);
        });
        break;
      case 'recent':
      default:
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
    }
    return sorted;
  }, [listings, activeFilter, searchQuery, sortOption]);

  // ── Row actions ──
  const handleEdit = useCallback((item: ListingApiItem) => {
    haptic.light();
    navigation.navigate('EditListing', { itemId: item.id });
  }, [navigation, haptic]);

  const handleTogglePause = useCallback(async (item: ListingApiItem) => {
    if (pendingActionIds.has(item.id)) return;
    const isPaused = item.status === 'paused';
    const nextStatus = isPaused ? 'active' : 'paused';
    haptic.medium();
    setPendingActionIds((prev) => new Set(prev).add(item.id));
    // Optimistic update
    setListings((prev) =>
      prev.map((l) => (l.id === item.id ? { ...l, status: nextStatus } : l))
    );
    try {
      await patchListingOnApi(item.id, { status: nextStatus as 'active' | 'paused' });
      show(isPaused ? 'Listing resumed' : 'Listing paused', 'success');
    } catch (err) {
      // Revert on failure
      setListings((prev) =>
        prev.map((l) => (l.id === item.id ? { ...l, status: item.status } : l))
      );
      const parsed = parseApiError(err);
      show(parsed.message, 'error');
    } finally {
      setPendingActionIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }, [pendingActionIds, haptic, show]);

  const handleRelist = useCallback((item: ListingApiItem) => {
    haptic.light();
    navigation.navigate('EditListing', { itemId: item.id });
  }, [navigation, haptic]);

  const handleDelete = useCallback((item: ListingApiItem) => {
    haptic.heavy();
    setConfirmSheet({
      visible: true,
      title: 'Delete listing',
      message: `Delete "${item.title}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
      onConfirm: async () => {
        if (pendingActionIds.has(item.id)) return;
        setPendingActionIds((prev) => new Set(prev).add(item.id));
        setListings((prev) => prev.filter((l) => l.id !== item.id));
        try {
          await deleteListingOnApi(item.id);
          show('Listing deleted', 'success');
        } catch (err) {
          // Re-fetch to restore on failure
          void load(true);
          const parsed = parseApiError(err);
          show(parsed.message, 'error');
        } finally {
          setPendingActionIds((prev) => {
            const next = new Set(prev);
            next.delete(item.id);
            return next;
          });
        }
      } });
  }, [pendingActionIds, haptic, show, load]);

  // ── Bulk selection ──
  const enterSelectionMode = useCallback((itemId: string) => {
    haptic.medium();
    if (!reducedMotion) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setSelectionMode(true);
    setSelectedIds(new Set([itemId]));
  }, [haptic, reducedMotion]);

  const toggleSelection = useCallback((itemId: string) => {
    haptic.selection();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, [haptic]);

  const exitSelectionMode = useCallback(() => {
    haptic.light();
    if (!reducedMotion) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, [haptic, reducedMotion]);

  const handleBulkPause = useCallback(async (resume: boolean) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const command = resume ? 'resume' : 'pause';
    const nextStatus = resume ? 'active' : 'paused';
    haptic.medium();
    setPendingActionIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    const originalStatuses = new Map(ids.map((id) => [id, listings.find((l) => l.id === id)?.status ?? 'active']));
    // Optimistic update — apply to all selected
    setListings((prev) =>
      prev.map((l) => (selectedIds.has(l.id) ? { ...l, status: nextStatus } : l))
    );
    try {
      const idempotencyKey = `bulk-${command}-${ids.slice().sort().join('-')}`;
      const response = await submitSellerHubBatchCommand(
        command,
        ids.map((id) => ({ listingId: id })),
        idempotencyKey,
      );
      // Apply per-item receipts truthfully.
      // Per Report 17 P0: partial failure is a firstclass result.
      // The UI never restores a committed row because a sibling failed.
      const applied: string[] = [];
      const rejected: string[] = [];
      const unknown: string[] = [];
      for (const result of response.results) {
        if (result.state === 'applied') applied.push(result.listingId);
        else if (result.state === 'rejected') rejected.push(result.listingId);
        else unknown.push(result.listingId);
      }
      // Revert only rejected and unknown items to their original status
      if (rejected.length > 0 || unknown.length > 0) {
        setListings((prev) =>
          prev.map((l) => {
            if (rejected.includes(l.id) || unknown.includes(l.id)) {
              const orig = originalStatuses.get(l.id);
              return orig ? { ...l, status: orig } : l;
            }
            return l;
          })
        );
        // Re-fetch to reconcile unknown items with server truth
        if (unknown.length > 0) {
          void load(true);
        }
      }
      // Build truthful toast message
      if (response.state === 'complete') {
        show(`${ids.length} listing${ids.length === 1 ? '' : 's'} ${resume ? 'resumed' : 'paused'}`, 'success');
        exitSelectionMode();
      } else {
        const parts: string[] = [];
        if (applied.length > 0) parts.push(`${applied.length} ${resume ? 'resumed' : 'paused'}`);
        if (rejected.length > 0) parts.push(`${rejected.length} failed`);
        if (unknown.length > 0) parts.push(`${unknown.length} checking`);
        show(parts.join(' · '), applied.length > 0 ? 'success' : 'error');
        if (applied.length === ids.length) exitSelectionMode();
      }
    } catch (err) {
      // Network/transport error — revert all to original since we can't
      // confirm any item was committed
      setListings((prev) =>
        prev.map((l) => {
          if (selectedIds.has(l.id)) {
            const orig = originalStatuses.get(l.id);
            return orig ? { ...l, status: orig } : l;
          }
          return l;
        })
      );
      const parsed = parseApiError(err);
      show(parsed.message, 'error');
    } finally {
      setPendingActionIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  }, [selectedIds, listings, haptic, show, exitSelectionMode, load]);

  const handleBulkDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    haptic.heavy();
    setConfirmSheet({
      visible: true,
      title: `Delete ${ids.length} listing${ids.length === 1 ? '' : 's'}`,
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
      onConfirm: async () => {
        setPendingActionIds((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.add(id));
          return next;
        });
        const snapshot = [...listings];
        // Optimistic: remove all selected from the list
        setListings((prev) => prev.filter((l) => !selectedIds.has(l.id)));
        try {
          const idempotencyKey = `bulk-delete-${ids.slice().sort().join('-')}`;
          const response = await submitSellerHubBatchCommand(
            'delete',
            ids.map((id) => ({ listingId: id })),
            idempotencyKey,
          );
          // Apply per-item receipts truthfully
          const applied: string[] = [];
          const rejected: string[] = [];
          const unknown: string[] = [];
          for (const result of response.results) {
            if (result.state === 'applied') applied.push(result.listingId);
            else if (result.state === 'rejected') rejected.push(result.listingId);
            else unknown.push(result.listingId);
          }
          // Restore rejected items to the list
          if (rejected.length > 0 || unknown.length > 0) {
            const itemsToRestore = snapshot.filter(
              (l) => rejected.includes(l.id) || unknown.includes(l.id),
            );
            setListings((prev) => [...prev, ...itemsToRestore]);
            // Re-fetch to reconcile unknown items
            if (unknown.length > 0) {
              void load(true);
            }
          }
          if (response.state === 'complete') {
            show(`${ids.length} listing${ids.length === 1 ? '' : 's'} deleted`, 'success');
            exitSelectionMode();
          } else {
            const parts: string[] = [];
            if (applied.length > 0) parts.push(`${applied.length} deleted`);
            if (rejected.length > 0) parts.push(`${rejected.length} failed`);
            if (unknown.length > 0) parts.push(`${unknown.length} checking`);
            show(parts.join(' · '), applied.length > 0 ? 'success' : 'error');
            if (applied.length === ids.length) exitSelectionMode();
          }
        } catch (err) {
          // Network/transport error — restore all items
          setListings(snapshot);
          const parsed = parseApiError(err);
          show(parsed.message, 'error');
        } finally {
          setPendingActionIds((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => next.delete(id));
            return next;
          });
        }
      } });
  }, [selectedIds, listings, haptic, show, exitSelectionMode, load]);

  // ── States ──
  if (isLoading) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Inventory" onBack={() => navigation.goBack()} />}>
        <FlagshipState variant="loading" title="Loading inventory..." />
      </FlagshipScreen>
    );
  }

  if (error && listings.length === 0) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Inventory" onBack={() => navigation.goBack()} />}>
        <FlagshipState
          variant={isOffline ? 'offline' : 'error'}
          title={isOffline ? 'You are offline' : 'Could not load inventory'}
          subtitle={error}
          actionLabel="Try again"
          onAction={() => void load()}
        />
      </FlagshipScreen>
    );
  }

  const showFilteredEmpty = listings.length > 0 && filteredListings.length === 0;

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Inventory"
          onBack={() => navigation.goBack()}
          rightAction={
            <AnimatedPressable
              style={styles.headerAction}
              onPress={() => navigation.navigate('Sell')}
              accessibilityRole="button"
              accessibilityLabel="Create new listing"
              hapticFeedback="light"
            >
              <Ionicons name="add-circle-outline" size={24} color={colors.textPrimary} />
            </AnimatedPressable>
          }
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <View style={styles.root}>
        {/* ── Search bar ── */}
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by title or brand"
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            accessibilityLabel="Search inventory"
          />
          {searchQuery.length > 0 ? (
            <Pressable
              onPress={() => setSearchQuery('')}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {/* ── Summary header — flat canvas, hairline separators ── */}
        {listings.length > 0 ? (
          <View style={styles.summaryRow}>
            <SummaryCell label="Items" value={String(summary.total)} colors={colors} styles={styles} />
            <SummaryCell label="Active" value={String(summary.active)} colors={colors} styles={styles} accent={colors.success} />
            <SummaryCell label="Sold" value={String(summary.sold)} colors={colors} styles={styles} accent={colors.textMuted} />
            <SummaryCell label="Paused" value={String(summary.paused)} colors={colors} styles={styles} accent={colors.warning} />
            <SummaryCell label="Value" value={formatFromFiat(summary.totalValue, currencyCode)} colors={colors} styles={styles} accent={colors.brand} last />
          </View>
        ) : null}

        {/* ── Filter tabs — underline indicator (InboxScreen segment rail pattern) ── */}
        <View style={styles.filterRail}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRailContent}>
            {FILTER_TABS.map((tab) => {
              const isActive = tab.key === activeFilter;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => { haptic.selection(); setActiveFilter(tab.key); }}
                  style={styles.filterTab}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`${tab.label} filter`}
                >
                  <Text
                    style={[
                      styles.filterTabLabel,
                      { color: isActive ? colors.textPrimary : colors.textMuted },
                      isActive && { fontFamily: Typography.family.semibold },
                    ]}
                    numberOfLines={1}
                  >
                    {tab.label}
                  </Text>
                  <View style={[styles.filterIndicator, isActive && { backgroundColor: colors.textPrimary }]} />
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Sort dropdown ── */}
        <View style={styles.sortRow}>
          <Pressable
            onPress={() => setSortMenuOpen((v) => !v)}
            style={styles.sortTrigger}
            accessibilityRole="button"
            accessibilityLabel={`Sort by ${SORT_OPTIONS.find((o) => o.key === sortOption)?.label}`}
          >
            <Ionicons name="swap-vertical-outline" size={14} color={colors.textMuted} />
            <Text style={styles.sortTriggerText} numberOfLines={1}>
              {SORT_OPTIONS.find((o) => o.key === sortOption)?.label ?? 'Sort'}
            </Text>
            <Ionicons name={sortMenuOpen ? 'chevron-up' : 'chevron-down'} size={12} color={colors.textMuted} />
          </Pressable>
        </View>

        {/* Sort menu — inline dropdown */}
        {sortMenuOpen ? (
          <View style={styles.sortMenu}>
            {SORT_OPTIONS.map((opt) => {
              const isActive = opt.key === sortOption;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => { haptic.selection(); setSortOption(opt.key); setSortMenuOpen(false); }}
                  style={[styles.sortMenuItem, opt.key === SORT_OPTIONS[SORT_OPTIONS.length - 1].key && { borderBottomWidth: 0 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Sort by ${opt.label}`}
                >
                  <Text
                    style={[
                      styles.sortMenuItemText,
                      { color: isActive ? colors.brand : colors.textPrimary },
                      isActive && { fontFamily: Typography.family.semibold },
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {isActive ? <Ionicons name="checkmark" size={16} color={colors.brand} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* ── Inventory list ── */}
        {listings.length === 0 ? (
          <ScrollView
            contentContainerStyle={styles.emptyScroll}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
          >
            <EmptyState
              icon="cube-outline"
              title="No listings yet"
              subtitle="Create your first listing to start selling."
              ctaLabel="Create listing"
              onCtaPress={() => navigation.navigate('Sell')}
            />
          </ScrollView>
        ) : showFilteredEmpty ? (
          <View style={styles.filteredEmptyWrap}>
            <EmptyState
              icon="filter-outline"
              title="No items match this filter"
              subtitle={searchQuery ? `No results for "${searchQuery}" in ${activeFilter}.` : `No ${activeFilter} listings.`}
              density="compact"
            />
          </View>
        ) : (
          <InventoryList
            listings={filteredListings}
            colors={colors}
            styles={styles}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            pendingActionIds={pendingActionIds}
            onLongPress={enterSelectionMode}
            onPressRow={(item) => {
              if (selectionMode) {
                toggleSelection(item.id);
              } else {
                navigation.navigate('ManageListing', { itemId: item.id });
              }
            }}
            onEdit={handleEdit}
            onTogglePause={handleTogglePause}
            onRelist={handleRelist}
            onDelete={handleDelete}
            onToggleSelect={toggleSelection}
            isRefreshing={isRefreshing}
            onRefresh={onRefresh}
            selectionBarHeight={selectionMode ? 80 : 0}
          />
        )}
      </View>

      {/* ── Bulk actions bar ── */}
      {selectionMode ? (
        <View
          style={[styles.bulkBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}
        >
          <View style={styles.bulkBarInfo}>
            <Text style={styles.bulkBarCount}>{selectedIds.size} selected</Text>
          </View>
          <View style={styles.bulkBarActions}>
            <Pressable
              onPress={() => void handleBulkPause(false)}
              style={styles.bulkActionBtn}
              accessibilityRole="button"
              accessibilityLabel="Pause selected listings"
            >
              <Ionicons name="pause-outline" size={18} color={colors.textPrimary} />
              <Text style={styles.bulkActionText}>Pause</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleBulkPause(true)}
              style={styles.bulkActionBtn}
              accessibilityRole="button"
              accessibilityLabel="Resume selected listings"
            >
              <Ionicons name="play-outline" size={18} color={colors.textPrimary} />
              <Text style={styles.bulkActionText}>Resume</Text>
            </Pressable>
            <Pressable
              onPress={handleBulkDelete}
              style={styles.bulkActionBtn}
              accessibilityRole="button"
              accessibilityLabel="Delete selected listings"
            >
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
              <Text style={[styles.bulkActionText, { color: colors.danger }]}>Delete</Text>
            </Pressable>
            <Pressable
              onPress={exitSelectionMode}
              style={styles.bulkActionBtn}
              accessibilityRole="button"
              accessibilityLabel="Cancel selection"
            >
              <Text style={styles.bulkCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel}
        cancelLabel={confirmSheet.cancelLabel}
        onConfirm={() => { confirmSheet.onConfirm(); setConfirmSheet((s) => ({ ...s, visible: false })); }}
        variant={confirmSheet.variant}
      />
    </FlagshipScreen>
  );
}

// ── Summary cell (flat canvas, hairline separators) ──
function SummaryCell({
  label,
  value,
  colors,
  styles,
  accent,
  last }: {
  label: string;
  value: string;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  accent?: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.summaryCell, !last && { borderRightColor: colors.border }]}>
      <Text style={[styles.summaryValue, { color: accent ?? colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

// ── Inventory list ──
function InventoryList({
  listings,
  colors,
  styles,
  selectionMode,
  selectedIds,
  pendingActionIds,
  onLongPress,
  onPressRow,
  onEdit,
  onTogglePause,
  onRelist,
  onDelete,
  onToggleSelect,
  isRefreshing,
  onRefresh,
  selectionBarHeight }: {
  listings: ListingApiItem[];
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  selectionMode: boolean;
  selectedIds: Set<string>;
  pendingActionIds: Set<string>;
  onLongPress: (id: string) => void;
  onPressRow: (item: ListingApiItem) => void;
  onEdit: (item: ListingApiItem) => void;
  onTogglePause: (item: ListingApiItem) => void;
  onRelist: (item: ListingApiItem) => void;
  onDelete: (item: ListingApiItem) => void;
  onToggleSelect: (id: string) => void;
  isRefreshing: boolean;
  onRefresh: () => void;
  selectionBarHeight: number;
}) {
  const renderItem = useCallback(({ item, index }: { item: ListingApiItem; index: number }) => (
    <InventoryRow
      item={item}
      isLast={index === listings.length - 1}
      colors={colors}
      styles={styles}
      selectionMode={selectionMode}
      isSelected={selectedIds.has(item.id)}
      isPendingAction={pendingActionIds.has(item.id)}
      onLongPress={() => onLongPress(item.id)}
      onPress={() => onPressRow(item)}
      onEdit={() => onEdit(item)}
      onTogglePause={() => onTogglePause(item)}
      onRelist={() => onRelist(item)}
      onDelete={() => onDelete(item)}
      onToggleSelect={() => onToggleSelect(item.id)}
    />
  ), [listings, colors, styles, selectionMode, selectedIds, pendingActionIds, onLongPress, onPressRow, onEdit, onTogglePause, onRelist, onDelete, onToggleSelect]);

  return (
    <InventoryFlashList
      data={listings}
      renderItem={renderItem}
      estimatedItemSize={72}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
      ListFooterComponent={<View style={{ height: selectionBarHeight || Space.xl }} />}
    />
  );
}

// ── Inventory row — flat canvas, hairline separator between rows ──
function InventoryRow({
  item,
  isLast,
  colors,
  styles,
  selectionMode,
  isSelected,
  isPendingAction,
  onLongPress,
  onPress,
  onEdit,
  onTogglePause,
  onRelist,
  onDelete,
  onToggleSelect }: {
  item: ListingApiItem;
  isLast: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  selectionMode: boolean;
  isSelected: boolean;
  isPendingAction: boolean;
  onLongPress: () => void;
  onPress: () => void;
  onEdit: () => void;
  onTogglePause: () => void;
  onRelist: () => void;
  onDelete: () => void;
  onToggleSelect: () => void;
}) {
  const { currencyCode, currencySymbol, formatFromFiat } = useFormattedPrice();
  const statusConfig = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.unknown;
  const statusColor =
    statusConfig.accent === 'success' ? colors.success
    : statusConfig.accent === 'muted' ? colors.textMuted
    : statusConfig.accent === 'warning' ? colors.warning
    : statusConfig.accent === 'brand' ? colors.brand
    : colors.textMuted;

  const views = item.engagement?.views ?? 0;
  const saves = item.engagement?.wishlistCount ?? 0;
  const likes = item.engagement?.likes ?? 0;
  const isPaused = item.status === 'paused';
  const isSold = item.status === 'sold';

  return (
    <View style={[styles.rowWrap, !isLast && { borderBottomColor: colors.border }]}>
      <AnimatedPressable
        style={styles.row}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={400}
        activeOpacity={0.88}
        accessibilityLabel={`${item.title}, ${currencySymbol}${item.priceGbp.toFixed(2)}, status: ${item.status}`}
        accessibilityRole="button"
        accessibilityHint={selectionMode ? 'Tap to toggle selection' : 'Tap to view listing details. Long-press to select.'}
      >
        {/* Selection checkbox */}
        {selectionMode ? (
          <Pressable
            onPress={onToggleSelect}
            style={[styles.selectCheckbox, isSelected && { backgroundColor: colors.brand, borderColor: colors.brand }]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={isSelected ? 'Deselect listing' : 'Select listing'}
            hitSlop={4}
          >
            {isSelected ? <Ionicons name="checkmark" size={14} color={colors.textInverse} /> : null}
          </Pressable>
        ) : null}

        {/* Thumbnail */}
        {item.images[0] ? (
          <CachedImage
            uri={item.images[0]}
            style={styles.thumbnail as StyleProp<ImageStyle>}
            containerStyle={styles.thumbnailWrap as StyleProp<ViewStyle>}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.thumbnailWrap, styles.thumbnailFallback]}>
            <Ionicons name="bag-handle-outline" size={20} color={colors.textMuted} />
          </View>
        )}

        {/* Body */}
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.rowPrice}>{formatFromFiat(item.priceGbp, currencyCode)}</Text>
          <View style={styles.rowMetaRow}>
            {/* Status badge */}
            <View style={styles.statusBadge}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>{statusConfig.label}</Text>
            </View>
            {/* Engagement metrics */}
            <View style={styles.metricsRow}>
              <Metric icon="eye-outline" value={views} colors={colors} styles={styles} />
              <Metric icon="bookmark-outline" value={saves} colors={colors} styles={styles} />
              <Metric icon="heart-outline" value={likes} colors={colors} styles={styles} />
            </View>
          </View>
        </View>

        {/* Quick actions */}
        {isPendingAction ? (
          <ActivityIndicator size="small" color={colors.textMuted} style={styles.rowSpinner} />
        ) : (
          <View style={styles.quickActions}>
            <IconButton icon="create-outline" onPress={onEdit} color={colors.textSecondary} label="Edit listing" />
            <IconButton
              icon={isPaused ? 'play-outline' : 'pause-outline'}
              onPress={onTogglePause}
              color={colors.textSecondary}
              label={isPaused ? 'Resume listing' : 'Pause listing'}
            />
            {isSold ? (
              <IconButton icon="repeat-outline" onPress={onRelist} color={colors.textSecondary} label="Relist item" />
            ) : null}
            <IconButton icon="trash-outline" onPress={onDelete} color={colors.danger} label="Delete listing" />
          </View>
        )}
      </AnimatedPressable>
    </View>
  );
}

function Metric({
  icon,
  value,
  colors,
  styles }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: number;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.metricItem}>
      <Ionicons name={icon} size={13} color={colors.textMuted} />
      <Text style={styles.metricText}>{value}</Text>
    </View>
  );
}

function IconButton({
  icon,
  onPress,
  color,
  label }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  color: string;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={stylesShared.iconActionBtn}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={18} color={color} />
    </Pressable>
  );
}

const stylesShared = StyleSheet.create({
  iconActionBtn: {
    width: Control.chrome,
    height: Control.chrome,
    justifyContent: 'center',
    alignItems: 'center' } });

// ── Status config ──
const STATUS_CONFIG: Record<string, { label: string; accent: 'success' | 'muted' | 'warning' | 'brand' | 'default' }> = {
  active: { label: 'Active', accent: 'success' },
  sold: { label: 'Sold', accent: 'muted' },
  paused: { label: 'Paused', accent: 'warning' },
  draft: { label: 'Draft', accent: 'brand' },
  reserved: { label: 'Reserved', accent: 'warning' },
  unknown: { label: 'Unknown', accent: 'default' } };

// ── Theme-dependent styles ──
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1 },
    headerAction: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center' },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      backgroundColor: colors.surfaceAlt,
      marginHorizontal: Space.md,
      marginTop: Space.sm,
      borderRadius: Radius.md },
    searchIcon: {
      marginLeft: Space.xs },
    searchInput: {
      flex: 1,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      paddingVertical: Space.sm,
      color: colors.textPrimary },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      paddingVertical: Space.sm,
      paddingHorizontal: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    summaryCell: {
      flex: 1,
      alignItems: 'center',
      gap: Space.xs / 2,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: colors.border,
      paddingHorizontal: Space.xs },
    summaryValue: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing },
    summaryLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    filterRail: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    filterRailContent: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.md,
      gap: Space.md },
    filterTab: {
      paddingVertical: Space.sm,
      position: 'relative' },
    filterTabLabel: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing },
    filterIndicator: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: Stroke.emphasis,
      borderRadius: Radius.none, // Hairline indicator — intentionally 1pt
      backgroundColor: 'transparent' },
    sortRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs },
    sortTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.xs,
      paddingHorizontal: Space.sm },
    sortTriggerText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted },
    sortMenu: {
      marginHorizontal: Space.md,
      marginBottom: Space.sm,
      borderRadius: Radius.md,
      overflow: 'hidden',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border },
    sortMenuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm + 2,
      paddingHorizontal: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    sortMenuItemText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily },
    listScroll: {
      flex: 1 },
    listContent: {
      flexGrow: 1 },
    emptyScroll: {
      flex: 1 },
    filteredEmptyWrap: {
      flex: 1,
      justifyContent: 'center',
      paddingVertical: Space.xl },
    rowWrap: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2 },
    selectCheckbox: {
      // Intentional checkbox size
      width: Control.icon,
      height: Control.icon,
      borderRadius: Radius.sm,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center' },
    thumbnailWrap: {
      // Intentional thumbnail size
      width: Control.hit + Space.sm,
      height: Control.hit + Space.sm,
      borderRadius: Radius.md,
      overflow: 'hidden' },
    thumbnail: {
      width: Control.hit + Space.sm,
      height: Control.hit + Space.sm },
    thumbnailFallback: {
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center' },
    rowBody: {
      flex: 1,
      gap: Space.xs - 1,
      minWidth: 0 },
    rowTitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      color: colors.textPrimary },
    rowPrice: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing,
      color: colors.textPrimary },
    rowMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Space.sm },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs },
    statusDot: {
      width: Space.xs + 2,
      height: Space.xs + 2,
      borderRadius: Radius.sm },
    statusText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    metricsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm },
    metricItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs - 1 },
    metricText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted },
    quickActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs / 2 },
    rowSpinner: {
      marginRight: Space.sm },
    bulkBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.surface },
    bulkBarInfo: {
      flex: 1 },
    bulkBarCount: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary },
    bulkBarActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm },
    bulkActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingVertical: Space.sm - 2,
      paddingHorizontal: Space.xs },
    bulkActionText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textPrimary },
    bulkCancelText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textSecondary } });
}
