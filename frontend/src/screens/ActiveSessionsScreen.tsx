import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';

/**
 * Compatibility wrapper — session management is owned by
 * AccountSecurityScreen, the canonical security center backed by
 * /account-security/sessions (redacted inventory, server-derived
 * current-session marker, isRevoked state, idempotent revocation).
 * This screen redirects immediately so legacy entrypoints keep working
 * while a single surface owns session review and revocation.
 */
export default function ActiveSessionsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useEffect(() => {
    // Replace so Back from AccountSecurity doesn't return to this redirect stub.
    navigation.replace('AccountSecurity');
  }, [navigation]);

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Active sessions"
          subtitle="Redirecting…"
          onBack={() => navigation.goBack()}
        />
      }
    >
      <View />
    </FlagshipScreen>
  );
}
