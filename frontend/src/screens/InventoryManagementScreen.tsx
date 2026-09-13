import React, { useMemo } from 'react';
import {
  View,
  ScrollView,
  RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps, RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import {
  useInventoryData,
  useInventoryFilters,
  useInventorySelection,
  useInventoryActions } from '../hooks/inventory';
import {
  InventorySearchBar,
  InventorySummaryRow,
  InventoryFilterRail,
  InventorySortMenu,
  InventoryList,
  InventoryBulkActionsBar,
  createInventoryScreenStyles } from '../components/inventory';

type Props = NativeStackScreenProps<RootStackParamList, 'InventoryManagement'>;

export default function InventoryManagementScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createInventoryScreenStyles(colors), [colors]);
  const { formatFromFiat } = useFormattedPrice();

  const {
    listings,
    setListings,
    isLoading,
    isRefreshing,
    isLoadingMore,
    isOffline,
    error,
    summary,
    load,
    loadMore,
    onRefresh } = useInventoryData();

  const {
    searchQuery,
    setSearchQuery,
    activeFilter,
    setActiveFilter,
    sortOption,
    setSortOption,
    sortMenuOpen,
    setSortMenuOpen,
    filteredListings } = useInventoryFilters(listings);

  const {
    selectionMode,
    selectedIds,
    enterSelectionMode,
    toggleSelection,
    exitSelectionMode } = useInventorySelection();

  const {
    pendingActionIds,
    confirmSheet,
    dismissConfirmSheet,
    handleEdit,
    handleTogglePause,
    handleRelist,
    handleDelete,
    handleBulkPause,
    handleBulkDelete } = useInventoryActions({
    navigation,
    listings,
    setListings,
    selectedIds,
    exitSelectionMode,
    load });

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
        <InventorySearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          colors={colors}
          styles={styles}
        />

        {/* ── Summary header — flat canvas, hairline separators ── */}
        {listings.length > 0 ? (
          <InventorySummaryRow
            summary={summary}
            valueLabel={formatFromFiat(summary.totalValue, 'GBP')}
            colors={colors}
            styles={styles}
          />
        ) : null}

        {/* ── Filter tabs — underline indicator (InboxScreen segment rail pattern) ── */}
        <InventoryFilterRail
          activeFilter={activeFilter}
          onSelectFilter={setActiveFilter}
          colors={colors}
          styles={styles}
        />

        {/* ── Sort dropdown ── */}
        <InventorySortMenu
          sortOption={sortOption}
          sortMenuOpen={sortMenuOpen}
          onToggleMenu={() => setSortMenuOpen((v) => !v)}
          onSelectOption={(option) => { setSortOption(option); setSortMenuOpen(false); }}
          colors={colors}
          styles={styles}
        />

        {/* ── Inventory list ── */}
        {listings.length === 0 ? (
          <ScrollView
            contentContainerStyle={styles.emptyScroll}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
          >
            <EmptyState
              icon="bag-handle-outline"
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
            onEndReached={loadMore}
            isLoadingMore={isLoadingMore}
            selectionBarHeight={selectionMode ? 80 : 0}
          />
        )}
      </View>

      {/* ── Bulk actions bar ── */}
      {selectionMode ? (
        <InventoryBulkActionsBar
          selectedCount={selectedIds.size}
          onPause={() => void handleBulkPause(false)}
          onResume={() => void handleBulkPause(true)}
          onDelete={handleBulkDelete}
          onCancel={exitSelectionMode}
          colors={colors}
          styles={styles}
        />
      ) : null}

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={dismissConfirmSheet}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel}
        cancelLabel={confirmSheet.cancelLabel}
        onConfirm={() => { confirmSheet.onConfirm(); dismissConfirmSheet(); }}
        variant={confirmSheet.variant}
      />
    </FlagshipScreen>
  );
}
