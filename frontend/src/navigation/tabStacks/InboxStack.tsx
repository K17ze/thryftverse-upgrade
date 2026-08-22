import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { InboxTabParamList } from '../types';

const Stack = createNativeStackNavigator<InboxTabParamList>();

const pushScreenOptions = {
  headerShown: false,
  gestureEnabled: true,
};

/**
 * Per-tab native-stack navigator for the Inbox tab.
 *
 * The inbox list is the root of this stack. Individual conversations
 * (Chat, GroupChat, etc.) live in the root stack because they are
 * reachable from multiple tabs (item detail, profile, push notifications).
 * All screens are lazy-loaded via `getComponent`.
 */
export function InboxStack() {
  return (
    <Stack.Navigator screenOptions={pushScreenOptions}>
      <Stack.Screen name="Inbox" getComponent={() => require('../../screens/InboxScreen').default} />
    </Stack.Navigator>
  );
}
