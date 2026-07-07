import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';

/**
 * Compatibility wrapper — private details editing has been unified into
 * EditProfileScreen. This screen redirects immediately so old navigation
 * entrypoints don't break, while ensuring there is only one canonical
 * profile/account editor.
 */
export default function AccountSettingsScreen() {
  const navigation = useNavigation();

  useEffect(() => {
    // Replace so Back from EditProfile doesn't return to this redirect stub.
    (navigation as any).replace('EditProfile');
  }, [navigation]);

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Private details"
          subtitle="Redirecting…"
          onBack={() => navigation.goBack()}
        />
      }
    >
      <View />
    </FlagshipScreen>
  );
}
