import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';

type NavT = NativeStackNavigationProp<RootStackParamList>;

/** CONNECTED SERVICES — per spec 18: Agents are a normal product
 *  destination, not hidden behind developer mode. Create Agent is
 *  intentionally excluded from Settings — it lives in the Agents home and
 *  profile menu. */
export function SettingsConnectedServicesSection() {
  const navigation = useNavigation<NavT>();
  const { t: ts } = useAppTranslation('settings');

  return (
    <SettingsSection title={ts('sections.connectedServices')}>
      <SettingsRow
        icon="people"
        title={ts('rows.agents')}
        subtitle={ts('rows.agentsSubtitle')}
        onPress={() => navigation.navigate('BotDirectory')}
        isFirst
      />
      <SettingsRow
        icon="key"
        title={ts('rows.connections')}
        subtitle={ts('rows.connectionsSubtitle')}
        onPress={() => navigation.navigate('AIAgentIntegration')}
      />
      <SettingsRow
        icon="profile"
        title={ts('rows.yourAgents')}
        subtitle={ts('rows.yourAgentsSubtitle')}
        onPress={() => navigation.navigate('CustomBots')}
        isLast
      />
    </SettingsSection>
  );
}
