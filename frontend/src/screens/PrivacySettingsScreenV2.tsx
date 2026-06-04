import React from 'react';
import { Linking } from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { SettingsPage } from '../components/settings/SettingsPage';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';

type Props = StackScreenProps<RootStackParamList, 'PrivacySettings'>;

export default function PrivacySettingsScreenV2({ navigation }: Props) {
  const { show } = useToast();
  const accountPreferences = useStore((s) => s.accountPreferences);
  const updateAccountPreferences = useStore((s) => s.updateAccountPreferences);
  const blockedCount = useStore((s) => s.blockedUsers.length);

  const handleOpenExternal = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      show('Unable to open link', 'error');
    }
  };

  return (
    <SettingsPage title="Privacy Controls" onBack={() => navigation.goBack()}>
      {/* Profile visibility */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
        <SettingsSection title="Profile">
          <SettingsRow
            icon="eye-outline"
            title="Private Profile"
            subtitle="Only approved followers can see your full profile and listings"
            toggleValue={accountPreferences.privateProfile}
            onToggle={(v) => updateAccountPreferences({ privateProfile: v })}
            isFirst
            isLast
          />
        </SettingsSection>
      </Reanimated.View>

      {/* Activity */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(60)}>
        <SettingsSection title="Activity">
          <SettingsRow
            icon="bag-outline"
            title="Holiday Mode"
            subtitle="Pause your listings and hide your shop while you’re away"
            toggleValue={accountPreferences.holidayMode}
            onToggle={(v) => updateAccountPreferences({ holidayMode: v })}
            isFirst
            isLast
          />
        </SettingsSection>
      </Reanimated.View>

      {/* Safety */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(120)}>
        <SettingsSection title="Safety">
          <SettingsRow
            icon="people-circle-outline"
            title="Blocked users"
            value={blockedCount > 0 ? `${blockedCount}` : 'None'}
            onPress={() => navigation.navigate('BlockedUsers')}
            isFirst
          />
          <SettingsRow
            icon="chatbubble-ellipses-outline"
            title="Chat privacy"
            subtitle="Who can message me, read receipts, and more"
            onPress={() => navigation.navigate('ChatSettings')}
            isLast
          />
        </SettingsSection>
      </Reanimated.View>

      {/* Data */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(180)}>
        <SettingsSection title="Data & transparency">
          <SettingsRow
            icon="document-text-outline"
            title="Privacy Policy"
            onPress={() => void handleOpenExternal('https://thryftverse.app/privacy')}
            isFirst
          />
          <SettingsRow
            icon="shield-checkmark-outline"
            title="Terms of Service"
            onPress={() => void handleOpenExternal('https://thryftverse.app/terms')}
            isLast
          />
        </SettingsSection>
      </Reanimated.View>
    </SettingsPage>
  );
}
