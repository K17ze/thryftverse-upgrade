import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useSavedSearchAlerts } from '../hooks/useSavedSearchAlerts';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { EmptyState } from '../components/EmptyState';
import { Typography, Space, Radius, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';

type Props = NativeStackScreenProps<RootStackParamList, 'SavedSearches'>;

type FilterTab = 'all' | 'new';

function relativeTime(isoTs?: string): string | null {
  if (!isoTs) return null;
  const diffMs = Date.now() - new Date(isoTs).getTime();
  if (Number.isNaN(diffMs)) return null;
  const mins = Math.max(1, Math.floor(diffMs / (60 * 1000)));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function SavedSearchesScreen({ navigation }: Props) {
  const { colors, isDark } = useAppTheme();
  const savedSearches = useStore((s) => s.savedSearches);
  const removeSavedSearch = useStore((s) => s.removeSavedSearch);
  const toggleSavedSearchAlerts = useStore((s) => s.toggleSavedSearchAlerts);
  const markAllSavedSearchesSeen = useStore((s) => s.markAllSavedSearchesSeen);
  const updateBrowseFilters = useStore((s) => s.updateBrowseFilters);
  const alertResults = useSavedSearchAlerts();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  // Build a map of searchId → newMatches count
  const newMatchesMap = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const result of alertResults) {
      if (result.newMatches > 0) {
        map.set(result.searchId, result.newMatches);
      }
    }
    return map;
  }, [alertResults]);

  const totalNewMatches = React.useMemo(() => {
    let total = 0;
    for (const count of newMatchesMap.values()) total += count;
    return total;
  }, [newMatchesMap]);

  const filteredSearches = useMemo(() => {
    if (activeTab === 'new') {
      return savedSearches.filter((s) => (newMatchesMap.get(s.id) ?? 0) > 0);
    }
    return savedSearches;
  }, [activeTab, savedSearches, newMatchesMap]);

  const handleMarkAllSeen = () => {
    markAllSavedSearchesSeen();
  };

  const handleSearchPress = (query: string) => {
    updateBrowseFilters({ query });
    navigation.navigate('Browse', {
      categoryId: 'search',
      title: `Search: "${query}"`,
      searchQuery: query });
  };

  const handleDiscoverSellers = () => {
    navigation.navigate('GlobalSearch');
  };

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background },
    tabRow: {
      flexDirection: 'row',
      gap: Space.sm,
      marginBottom: Space.sm },
    tab: {
      flex: 1,
      paddingVertical: Space.xs + 1,
      paddingHorizontal: Space.smMd,
      borderRadius: Radius.lg,
      backgroundColor: colors.surface,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      alignItems: 'center' },
    tabActive: {
      backgroundColor: colors.brandSubtle,
      borderColor: colors.brand },
    tabText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted },
    tabTextActive: {
      color: colors.brand,
      fontFamily: Typography.family.semibold },
    noNewWrap: {
      alignItems: 'center',
      gap: Space.xs + 2,
      paddingVertical: Space.xl + Space.xl - 8 },
    noNewText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textMuted,
      textAlign: 'center' },
    listWrap: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm },
    sectionHint: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted,
      marginBottom: Space.md,
      letterSpacing: 0.2 },
    searchCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.smMd,
      paddingHorizontal: Space.sm + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border },
    searchMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.smMd },
    searchIconWrapInactive: {
      opacity: 0.6 },
    searchTextWrap: {
      flex: 1,
      gap: Space.xs / 2 + 1 },
    searchQuery: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      color: colors.textPrimary,
      flexShrink: 1 },
    searchQueryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 2 },
    newBadge: {
      backgroundColor: colors.brandSubtle,
      borderRadius: Radius.lg,
      paddingHorizontal: Space.xs + 3,
      paddingVertical: Space.xs / 2,
      flexShrink: 0 },
    newBadgeText: {
      fontSize: TypographyV2.meta.size - 1,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.brand,
      letterSpacing: 0.2 },
    newMatchesBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      backgroundColor: colors.brandSubtle,
      borderRadius: Radius.lg,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.xs + 2,
      marginBottom: Space.sm + 2 },
    newMatchesText: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.brand },
    searchMeta: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      color: colors.textMuted },
    searchActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs },
    actionBtn: {
      width: Space.xl + Space.xs + 4,
      height: Space.xl + Space.xs + 4,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center' } }), [colors]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />

      {/* Header */}
      <ScreenHeader
        title="Saved Searches"
        backIcon="arrow-back"
        onBack={() => navigation.goBack()}
        rightAction={
          totalNewMatches > 0 ? (
            <AnimatedPressable
              onPress={handleMarkAllSeen}
              accessibilityLabel="Mark all saved searches as seen"
              accessibilityRole="button"
            >
              <Ionicons name="checkmark-done" size={20} color={colors.brand} />
            </AnimatedPressable>
          ) : undefined
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
      >
        {savedSearches.length === 0 ? (
          <EmptyState
            icon="notifications-outline"
            title="No saved searches yet"
            subtitle="Save searches to get alerts on new items."
            ctaLabel="Start searching"
            onCtaPress={handleDiscoverSellers}
          />
        ) : (
          <View style={styles.listWrap}>
            {/* Filter tabs */}
            <View style={styles.tabRow}>
              <AnimatedPressable
                style={[styles.tab, activeTab === 'all' && styles.tabActive]}
                onPress={() => setActiveTab('all')}
                accessibilityLabel="Show all saved searches"
                accessibilityRole="button"
              >
                <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>
                  All ({savedSearches.length})
                </Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={[styles.tab, activeTab === 'new' && styles.tabActive]}
                onPress={() => setActiveTab('new')}
                accessibilityLabel="Show only saved searches with new matches"
                accessibilityRole="button"
              >
                <Text style={[styles.tabText, activeTab === 'new' && styles.tabTextActive]}>
                  New ({totalNewMatches})
                </Text>
              </AnimatedPressable>
            </View>

            <Text style={styles.sectionHint}>
              {filteredSearches.length} {filteredSearches.length === 1 ? 'search' : 'searches'}
              {' · '}
              {savedSearches.filter((s) => s.alertsEnabled).length} with alerts
            </Text>

            {totalNewMatches > 0 && (
              <View style={styles.newMatchesBanner}>
                <Ionicons name="notifications-outline" size={16} color={colors.brand} />
                <Text style={styles.newMatchesText}>
                  {totalNewMatches} new {totalNewMatches === 1 ? 'match' : 'matches'} across your saved searches
                </Text>
              </View>
            )}

            {filteredSearches.length === 0 ? (
              <View style={styles.noNewWrap}>
                <Ionicons name="checkmark-circle-outline" size={28} color={colors.textMuted} />
                <Text style={styles.noNewText}>All caught up — no new matches right now</Text>
              </View>
            ) : filteredSearches.map((search) => {
              const newCount = newMatchesMap.get(search.id) ?? 0;
              const checkedLabel = relativeTime(search.lastCheckedAt);
              return (
                <View key={search.id} style={styles.searchCard}>
                  <Pressable
                    style={styles.searchMain}
                    onPress={() => handleSearchPress(search.query)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel={`Search for ${search.query}${newCount > 0 ? `, ${newCount} new matches` : ''}`}
                    accessibilityRole="button"
                  >
                    <Ionicons
                      name={search.alertsEnabled ? 'notifications' : 'bookmark-outline'}
                      size={20}
                      color={search.alertsEnabled ? colors.brand : colors.textMuted}
                      style={!search.alertsEnabled && styles.searchIconWrapInactive}
                    />
                    <View style={styles.searchTextWrap}>
                      <View style={styles.searchQueryRow}>
                        <Text style={styles.searchQuery} numberOfLines={1}>{search.query}</Text>
                        {newCount > 0 && (
                          <View style={styles.newBadge}>
                            <Text style={styles.newBadgeText}>{newCount} new</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.searchMeta}>
                        {search.alertsEnabled ? 'Alerts on' : 'Alerts off'}
                        {search.filters.brands.length > 0 && ` · ${search.filters.brands.join(', ')}`}
                        {search.filters.sizes.length > 0 && ` · ${search.filters.sizes.join(', ')}`}
                        {search.filters.condition !== 'Any' && ` · ${search.filters.condition}`}
                        {checkedLabel && ` · checked ${checkedLabel}`}
                      </Text>
                    </View>
                  </Pressable>

                  <View style={styles.searchActions}>
                    <AnimatedPressable
                      style={styles.actionBtn}
                      onPress={() => toggleSavedSearchAlerts(search.id)}
                      accessibilityLabel={search.alertsEnabled ? 'Disable alerts' : 'Enable alerts'}
                      accessibilityRole="button"
                    >
                      <Ionicons
                        name={search.alertsEnabled ? 'notifications' : 'notifications-off-outline'}
                        size={20}
                        color={search.alertsEnabled ? colors.brand : colors.textMuted}
                      />
                    </AnimatedPressable>
                    <AnimatedPressable
                      style={styles.actionBtn}
                      onPress={() => removeSavedSearch(search.id)}
                      accessibilityLabel="Remove saved search"
                      accessibilityRole="button"
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </AnimatedPressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
