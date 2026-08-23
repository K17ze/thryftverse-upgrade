import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ProfileTabParamList } from '../types';

const Stack = createNativeStackNavigator<ProfileTabParamList>();

const pushScreenOptions = {
  headerShown: false,
  gestureEnabled: true,
};

/**
 * Per-tab native-stack navigator for the Profile tab.
 *
 * Preserves the Profile tab's navigation history (settings drill-down,
 * followers/following, verification flows) independently of other tabs.
 * All screens are lazy-loaded via `getComponent`.
 */
export function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={pushScreenOptions}>
      <Stack.Screen name="Profile" getComponent={() => require('../../screens/MyProfileScreen').default} />
    </Stack.Navigator>
  );
}
