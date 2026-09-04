import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { HomeTabParamList } from '../types';
import { withScreenErrorBoundary } from '../../components/ScreenErrorBoundary';

const Stack = createNativeStackNavigator<HomeTabParamList>();

const pushScreenOptions = {
  headerShown: false,
  gestureEnabled: true,
};

/**
 * Per-tab native-stack navigator for the Home (discovery) tab.
 *
 * Preserves the Home tab's navigation history independently of other tabs
 * so switching away and back restores the user's discovery depth.
 * All screens are lazy-loaded via `getComponent` to keep the initial
 * bundle size minimal.
 *
 * HomeScreen is wrapped with ScreenErrorBoundary so a render crash on the
 * primary discovery surface shows a recoverable fallback instead of crashing
 * the entire app.
 */
export function HomeStack() {
  return (
    <Stack.Navigator screenOptions={pushScreenOptions}>
      <Stack.Screen
        name="Home"
        getComponent={withScreenErrorBoundary(
          () => require('../../screens/HomeScreen').default,
          'Home',
        )}
      />
      <Stack.Screen name="ExploreCollection" getComponent={() => require('../../screens/ExploreCollectionScreen').default} />
      <Stack.Screen name="LookDetail" getComponent={() => require('../../screens/LookDetailScreen').default} />
      <Stack.Screen name="GalleriaCollectionDetail" getComponent={() => require('../../screens/GalleriaCollectionDetailScreen').default} />
      <Stack.Screen name="MoodboardHome" getComponent={() => require('../../screens/MoodboardHomeScreen').default} />
      <Stack.Screen name="YourAlgorithm" getComponent={() => require('../../screens/YourAlgorithmScreen').default} />
      <Stack.Screen name="StyleQuiz" getComponent={() => require('../../screens/StyleQuizScreen').default} options={{ presentation: 'modal' as const, gestureEnabled: true }} />
    </Stack.Navigator>
  );
}
