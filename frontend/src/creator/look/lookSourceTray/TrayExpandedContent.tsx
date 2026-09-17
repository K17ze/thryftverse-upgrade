/**
 * TrayExpandedContent — the expanded content block of LookSourceTray:
 * tab bar, search input, loading/error/empty states and the horizontal
 * item scroll of DraggableProductCards. Extracted verbatim from
 * LookSourceTray.tsx.
 */
import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  type StyleProp,
  type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { type SharedValue, type AnimatedStyle } from 'react-native-reanimated';
import { IconGrammar } from '../../../theme/designTokens';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import type { TabKey, TrayItem } from './lookSourceTrayShared';
import { DraggableProductCard } from './DraggableProductCard';
import { styles } from './lookSourceTrayStyles';

interface TrayExpandedContentProps {
  colors: ThemeColors;
  expanded: boolean;
  contentAnimStyle: StyleProp<AnimatedStyle<ViewStyle>>;
  tabs: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[];
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  isSearching: boolean;
  isSyncing: boolean;
  lastError: string | null;
  isEmpty: boolean;
  currentItems: TrayItem[];
  onItemPress: (item: TrayItem) => void;
  onDragStart: (item: TrayItem) => void;
  onDragEnd: (item: TrayItem, x: number, y: number, isOverCanvas: boolean) => void;
  previewX: SharedValue<number>;
  previewY: SharedValue<number>;
  previewVisible: SharedValue<number>;
  trayYSV: SharedValue<number>;
  onCanvasListingIds?: Set<string>;
}

export function TrayExpandedContent({
  colors,
  expanded,
  contentAnimStyle,
  tabs,
  activeTab,
  onTabChange,
  searchQuery,
  onSearchQueryChange,
  isSearching,
  isSyncing,
  lastError,
  isEmpty,
  currentItems,
  onItemPress,
  onDragStart,
  onDragEnd,
  previewX,
  previewY,
  previewVisible,
  trayYSV,
  onCanvasListingIds }: TrayExpandedContentProps) {
  const haptic = useHaptic();

  return (
    /* ── Expanded content ── */
    <Reanimated.View
      style={[styles.content, contentAnimStyle]}
      pointerEvents={expanded ? 'auto' : 'none'}
    >
      {/* Tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onTabChange(tab.key)}
              style={({ pressed }) => [
                styles.tabBtn,
                pressed && styles.tabBtnPressed,
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              accessibilityLabel={`${tab.label} tab`}
              accessibilityHint={`Shows items from your ${tab.label.toLowerCase()}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Ionicons
                name={tab.icon}
                size={24}
                color={isActive ? colors.brand : colors.textSecondary}
              />
              <Text
                style={[
                  styles.tabLabel,
                  { color: isActive ? colors.brand : colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
              {isActive && (
                <View style={[styles.tabIndicator, { backgroundColor: colors.brand }]} />
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Search input (only on search tab) */}
      {activeTab === 'search' && (
        <View style={[styles.searchRow, { borderBottomColor: colors.border }]}>
          <Ionicons name="search-outline" size={IconGrammar.metadata} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Search products..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={onSearchQueryChange}
            returnKeyType="search"
            accessibilityLabel="Search products"
            accessibilityHint="Search for products to add to your look"
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={() => { haptic.light(); onSearchQueryChange(''); }}
              hitSlop={8}
              accessibilityLabel="Clear search"
              accessibilityHint="Clears the search text"
              accessibilityRole="button"
            >
              <Ionicons name="close-circle" size={IconGrammar.metadata} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      )}

      {/* Loading state — search or initial backend sync */}
      {(isSearching || (isSyncing && activeTab !== 'search' && currentItems.length === 0)) && (
        <View style={styles.stateContainer}>
          <ActivityIndicator size="small" color={colors.brand} />
          <Text style={[styles.stateText, { color: colors.textSecondary }]}>
            {isSearching ? 'Searching…' : 'Loading items…'}
          </Text>
        </View>
      )}

      {/* Error state — backend sync failure for non-search tabs */}
      {!isSearching && !isSyncing && lastError && activeTab !== 'search' && isEmpty && (
        <View style={styles.stateContainer}>
          <Text style={[styles.stateText, { color: colors.textSecondary }]}>
            Couldn't load items. Pull to retry.
          </Text>
        </View>
      )}

      {/* Empty state — text-only, no decorative icon */}
      {!isSearching && !isSyncing && !(lastError && activeTab !== 'search') && isEmpty && (
        <View style={styles.stateContainer}>
          <Text style={[styles.stateText, { color: colors.textSecondary }]}>
            {activeTab === 'foryou' && 'No recommendations available'}
            {activeTab === 'closet' && 'No saved items yet'}
            {activeTab === 'listings' && 'No active listings'}
            {activeTab === 'search' && searchQuery.trim().length < 2 && 'Type to search products'}
            {activeTab === 'search' && searchQuery.trim().length >= 2 && 'No products found'}
          </Text>
        </View>
      )}

      {/* Item thumbnails — horizontal scroll with draggable cards */}
      {!isSearching && !isSyncing && !isEmpty && !(lastError && activeTab !== 'search' && currentItems.length === 0) && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.itemScroll}
        >
          {currentItems.map((item) => (
            <DraggableProductCard
              key={item.id}
              item={item}
              onPress={onItemPress}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              previewX={previewX}
              previewY={previewY}
              previewVisible={previewVisible}
              trayYSV={trayYSV}
              colors={colors}
              onCanvas={onCanvasListingIds?.has(item.id) ?? false}
            />
          ))}
        </ScrollView>
      )}
    </Reanimated.View>
  );
}
