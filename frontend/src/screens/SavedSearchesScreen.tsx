import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useSavedSearchAlerts } from '../hooks/useSavedSearchAlerts';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';
import { Typography, Space } from '../theme/designTokens';

type Props = StackScreenProps<RootStackParamList, 'SavedSearches'>;

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
      searchQuery: query,
    });
  };

  const handleDiscoverSellers = () => {
    navigation.navigate('GlobalSearch');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />

      {/* Header */}
      <View style={styles.header}>
        <AnimatedPressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={26} color={colors.textPrimary} />
        </AnimatedPressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Saved Searches</Text>
        {totalNewMatches > 0 ? (
          <AnimatedPressable
            style={styles.markSeenBtn}
            onPress={handleMarkAllSeen}
            accessibilityLabel="Mark all saved searches as seen"
            accessibilityRole="button"
          >
            <Ionicons name="checkmark-done" size={20} color={colors.brand} />
          </AnimatedPressable>
        ) : (
          <View style={styles.backBtn} />
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
      >
        {savedSearches.length === 0 ? (
          <EmptyState
            icon="notifications-outline"
            title="No saved searches yet"
            subtitle="Save a search from the search results page to get alerts when new items match. It's the easiest way to catch drops before anyone else."
            ctaLabel="Start searching"
            onCtaPress={handleDiscoverSellers}
          />
        ) : (
          <View style={styles.listWrap}>
            {/* Filter tabs */}
            <View style={styles.tabRow}>
              <AnimatedPressable
                style={[styles.tab, activeTab === 'all' && styles.tabActive, { backgroundColor: activeTab === 'all' ? `${colors.brand}12` : colors.surface, borderColor: activeTab === 'all' ? colors.brand : colors.border }]}
                onPress={() => setActiveTab('all')}
                accessibilityLabel="Show all saved searches"
                accessibilityRole="button"
              >
                <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive, { color: activeTab === 'all' ? colors.brand : colors.textMuted }]}>
                  All ({savedSearches.length})
                </Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={[styles.tab, activeTab === 'new' && styles.tabActive, { backgroundColor: activeTab === 'new' ? `${colors.brand}12` : colors.surface, borderColor: activeTab === 'new' ? colors.brand : colors.border }]}
                onPress={() => setActiveTab('new')}
                accessibilityLabel="Show only saved searches with new matches"
                accessibilityRole="button"
              >
                <Text style={[styles.tabText, activeTab === 'new' && styles.tabTextActive, { color: activeTab === 'new' ? colors.brand : colors.textMuted }]}>
                  New ({totalNewMatches})
                </Text>
              </AnimatedPressable>
            </View>

            <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
              {filteredSearches.length} {filteredSearches.length === 1 ? 'search' : 'searches'}
              {' · '}
              {savedSearches.filter((s) => s.alertsEnabled).length} with alerts
            </Text>

            {totalNewMatches > 0 && (
              <View style={[styles.newMatchesBanner, { backgroundColor: `${colors.brand}10` }]}>
                <Ionicons name="sparkles" size={16} color={colors.brand} />
                <Text style={[styles.newMatchesText, { color: colors.brand }]}>
                  {totalNewMatches} new {totalNewMatches === 1 ? 'match' : 'matches'} across your saved searches
                </Text>
              </View>
            )}

            {filteredSearches.length === 0 ? (
              <View style={styles.noNewWrap}>
                <Ionicons name="checkmark-circle-outline" size={28} color={colors.textMuted} />
                <Text style={[styles.noNewText, { color: colors.textMuted }]}>All caught up — no new matches right now</Text>
              </View>
            ) : filteredSearches.map((search) => {
              const newCount = newMatchesMap.get(search.id) ?? 0;
              const checkedLabel = relativeTime(search.lastCheckedAt);
              return (
                <View key={search.id} style={[styles.searchCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Pressable
                    style={styles.searchMain}
                    onPress={() => handleSearchPress(search.query)}
                    accessibilityLabel={`Search for ${search.query}${newCount > 0 ? `, ${newCount} new matches` : ''}`}
                    accessibilityRole="button"
                  >
                    <View style={[
                      styles.searchIconWrap,
                      { backgroundColor: colors.surfaceAlt },
                      !search.alertsEnabled && styles.searchIconWrapInactive,
                    ]}>
                      <Ionicons
                        name={search.alertsEnabled ? 'notifications' : 'bookmark-outline'}
                        size={18}
                        color={search.alertsEnabled ? colors.brand : colors.textMuted}
                      />
                    </View>
                    <View style={styles.searchTextWrap}>
                      <View style={styles.searchQueryRow}>
                        <Text style={[styles.searchQuery, { color: colors.textPrimary }]} numberOfLines={1}>{search.query}</Text>
                        {newCount > 0 && (
                          <View style={[styles.newBadge, { backgroundColor: `${colors.brand}15` }]}>
                            <Text style={[styles.newBadgeText, { color: colors.brand }]}>{newCount} new</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.searchMeta, { color: colors.textMuted }]}>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markSeenBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: Typography.family.bold,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Space.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  tabActive: {
    borderWidth: 1,
  },
  tabText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
  },
  tabTextActive: {
    fontFamily: Typography.family.semibold,
  },
  noNewWrap: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 40,
  },
  noNewText: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
  },
  listWrap: {
    paddingHorizontal: 16,
    paddingTop: Space.sm,
  },
  sectionHint: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    marginBottom: Space.md,
    letterSpacing: 0.2,
  },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 0.5,
    marginBottom: 8,
  },
  searchMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  searchIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchIconWrapInactive: {
    opacity: 0.6,
  },
  searchTextWrap: {
    flex: 1,
    gap: 3,
  },
  searchQuery: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    flexShrink: 1,
  },
  searchQueryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  newBadge: {
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    flexShrink: 0,
  },
  newBadgeText: {
    fontSize: 10,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.2,
  },
  newMatchesBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: Space.sm + 2,
  },
  newMatchesText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Typography.family.semibold,
  },
  searchMeta: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
  },
  searchActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
