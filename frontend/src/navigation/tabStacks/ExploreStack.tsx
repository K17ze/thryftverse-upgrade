import React from 'react';
import { Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ExploreTabParamList } from '../types';

const Stack = createNativeStackNavigator<ExploreTabParamList>();

const pushScreenOptions = {
  headerShown: false,
  gestureEnabled: true,
};

const filterScreenOptions = {
  presentation: Platform.select({
    ios: 'formSheet' as const,
    android: 'modal' as const,
    default: 'modal' as const,
  }),
  headerShown: false,
  gestureEnabled: true,
};

/**
 * Per-tab native-stack navigator for the Explore (search/browse) tab.
 *
 * Preserves the Explore tab's navigation history independently of other
 * tabs. Category drill-down, filters, and saved searches stay scoped to
 * this tab. All screens are lazy-loaded via `getComponent`.
 */
export function ExploreStack() {
  return (
    <Stack.Navigator screenOptions={pushScreenOptions}>
      <Stack.Screen name="Explore" getComponent={() => require('../../screens/SearchScreen').default} />
      <Stack.Screen name="GlobalSearch" getComponent={() => require('../../screens/GlobalSearchScreen').default} />
      <Stack.Screen name="CategoryDetail" getComponent={() => require('../../screens/CategoryDetailScreen').default} />
      <Stack.Screen name="CategoryTree" getComponent={() => require('../../screens/CategoryTreeScreen').default} />
      <Stack.Screen name="Browse" getComponent={() => require('../../screens/BrowseScreen').default} />
      <Stack.Screen name="Filter" getComponent={() => require('../../screens/FilterScreen').default} options={filterScreenOptions} />
      <Stack.Screen name="SavedSearches" getComponent={() => require('../../screens/SavedSearchesScreen').default} />
      <Stack.Screen name="CollectionDetail" getComponent={() => require('../../screens/CollectionDetailScreen').default} />
    </Stack.Navigator>
  );
}
