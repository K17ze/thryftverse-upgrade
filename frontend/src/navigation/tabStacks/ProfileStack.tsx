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
      <Stack.Screen name="EditProfile" getComponent={() => require('../../screens/EditProfileScreen').default} />
      <Stack.Screen name="Settings" getComponent={() => require('../../screens/SettingsScreen').default} />
      <Stack.Screen name="AccountSettings" getComponent={() => require('../../screens/AccountSettingsScreen').default} />
      <Stack.Screen name="AccountControl" getComponent={() => require('../../screens/AccountControlScreen').default} />
      <Stack.Screen name="DeleteAccount" getComponent={() => require('../../screens/DeleteAccountScreen').default} />
      <Stack.Screen name="DataExport" getComponent={() => require('../../screens/DataExportScreen').default} />
      <Stack.Screen name="Personalisation" getComponent={() => require('../../screens/PersonalisationScreen').default} />
      <Stack.Screen name="SavedAddresses" getComponent={() => require('../../screens/SavedAddressesScreen').default} />
      <Stack.Screen name="Payments" getComponent={() => require('../../screens/PaymentsScreen').default} />
      <Stack.Screen name="NotificationsList" getComponent={() => require('../../screens/NotificationsScreen').default} />
      <Stack.Screen name="PushNotifications" getComponent={() => require('../../screens/PushNotificationsScreen').default} />
      <Stack.Screen name="ChangePassword" getComponent={() => require('../../screens/ChangePasswordScreen').default} />
      <Stack.Screen name="TwoFactorSetup" getComponent={() => require('../../screens/TwoFactorSetupScreen').default} />
      <Stack.Screen name="HelpSupport" getComponent={() => require('../../screens/HelpSupportScreen').default} />
      <Stack.Screen name="ConnectedAccounts" getComponent={() => require('../../screens/ConnectedAccountsScreen').default} />
      <Stack.Screen name="EmailNotifications" getComponent={() => require('../../screens/EmailNotificationsScreen').default} />
      <Stack.Screen name="AccessibilitySettings" getComponent={() => require('../../screens/AccessibilitySettingsScreen').default} />
      <Stack.Screen name="AIPreferences" getComponent={() => require('../../screens/AIPreferencesScreen').default} />
      <Stack.Screen name="SustainabilityPreferences" getComponent={() => require('../../screens/SustainabilityPreferencesScreen').default} />
      <Stack.Screen name="DataPrivacy" getComponent={() => require('../../screens/DataPrivacyScreen').default} />
      <Stack.Screen name="NotificationPreferences" getComponent={() => require('../../screens/NotificationPreferencesScreen').default} />
      <Stack.Screen name="AIAgentIntegration" getComponent={() => require('../../screens/AIAgentIntegrationScreen').default} />
      <Stack.Screen name="AgentActivity" getComponent={() => require('../../screens/AgentActivityScreen').default} />
      <Stack.Screen name="ChatSettings" getComponent={() => require('../../screens/ChatSettingsScreen').default} />
      <Stack.Screen name="ActiveSessions" getComponent={() => require('../../screens/ActiveSessionsScreen').default} />
      <Stack.Screen name="BlockedUsers" getComponent={() => require('../../screens/BlockedUsersScreen').default} />
      <Stack.Screen name="PrivacySettings" getComponent={() => require('../../screens/PrivacySettingsScreen').default} />
      <Stack.Screen name="About" getComponent={() => require('../../screens/AboutScreen').default} />
      <Stack.Screen name="MutedConversations" getComponent={() => require('../../screens/MutedConversationsScreen').default} />
      <Stack.Screen name="ArchivedConversations" getComponent={() => require('../../screens/ArchivedConversationsScreen').default} />
      <Stack.Screen name="ManageQuickReplies" getComponent={() => require('../../screens/ManageQuickRepliesScreen').default} />
      <Stack.Screen name="Closet" getComponent={() => require('../../screens/ClosetScreen').default} />
      <Stack.Screen name="Verification" getComponent={() => require('../../screens/VerificationScreen').default} />
      <Stack.Screen name="VerificationStatus" getComponent={() => require('../../screens/VerificationStatusScreen').default} />
      <Stack.Screen name="SellerVerification" getComponent={() => require('../../screens/SellerVerificationScreen').default} />
      <Stack.Screen name="KYCVerification" getComponent={() => require('../../screens/KYCVerificationScreen').default} />
    </Stack.Navigator>
  );
}
