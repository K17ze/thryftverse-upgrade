import React from 'react';
import { Linking } from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { updateActivityStatus, updateSearchVisibility } from '../services/accountApi';

type Props = StackScreenProps<RootStackParamList, 'PrivacySettings'>;

export default function PrivacySettingsScreen({ navigation }: Props) {
  const { show } = useToast();
  const accountPreferences = useStore((s) => s.accountPreferences);
  const updateAccountPreferences = useStore((s) => s.updateAccountPreferences);
  const blockedCount = useStore((s) => s.blockedUsers.length);

  // Local state for new toggles (synced to backend on change)
  const [activityStatusVisible, setActivityStatusVisible] = React.useState(true);
  const [searchVisibility, setSearchVisibility] = React.useState<'visible' | 'hidden'>('visible');

  const handleOpenExternal = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      show('Unable to open link', 'error');
    }
  };

  const handleActivityStatusToggle = async (v: boolean) => {
    setActivityStatusVisible(v);
    try {
      await updateActivityStatus(v);
      show(v ? 'Activity status visible' : 'Activity status hidden', 'success');
    } catch {
      setActivityStatusVisible(!v);
      show('Failed to update activity status', 'error');
    }
  };

  const handleSearchVisibilityToggle = async (v: boolean) => {
    const next = v ? 'visible' : 'hidden';
    setSearchVisibility(next);
    try {
      await updateSearchVisibility(next);
      show(v ? 'Visible in search' : 'Hidden from search', 'success');
    } catch {
      setSearchVisibility(v ? 'hidden' : 'visible');
      show('Failed to update search visibility', 'error');
    }
  };

  return (
    <FlagshipScreen header={<FlagshipHeader title="Privacy & safety" onBack={() => navigation.goBack()} />}>
      <SettingsSection title="Visibility" noCard>
        <SettingsRow
          icon="eye-outline"
          title="Private profile"
          subtitle="Only approved followers can see your full profile and listings"
          toggleValue={accountPreferences.privateProfile}
          onToggle={(v) => updateAccountPreferences({ privateProfile: v })}
          isFirst
        />
        <SettingsRow
          icon="radio-button-on-outline"
          title="Activity status"
          subtitle="Show when you're online and active"
          toggleValue={activityStatusVisible}
          onToggle={handleActivityStatusToggle}
        />
        <SettingsRow
          icon="search-outline"
          title="Search visibility"
          subtitle="Allow others to find you in search"
          toggleValue={searchVisibility === 'visible'}
          onToggle={handleSearchVisibilityToggle}
          isLast
        />
      </SettingsSection>

      <SettingsSection title="Shop activity" noCard>
        <SettingsRow
          icon="bag-outline"
          title="Holiday mode"
          subtitle="Pause your listings and hide your shop while you're away"
          toggleValue={accountPreferences.holidayMode}
          onToggle={(v) => updateAccountPreferences({ holidayMode: v })}
          isFirst
          isLast
        />
      </SettingsSection>

      <SettingsSection title="Messaging" noCard>
        <SettingsRow
          icon="chatbubble-ellipses-outline"
          title="Chat privacy"
          subtitle="Who can message you, read receipts, blocked users"
          onPress={() => navigation.navigate('ChatSettings')}
          isFirst
          isLast
        />
      </SettingsSection>

      <SettingsSection title="Blocked users" noCard>
        <SettingsRow
          icon="ban-outline"
          title="Manage blocked users"
          subtitle={blockedCount > 0 ? `${blockedCount} blocked` : 'None blocked'}
          onPress={() => navigation.navigate('BlockedUsers')}
          isFirst
          isLast
        />
      </SettingsSection>

      <SettingsSection title="Legal" noCard>
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
    </FlagshipScreen>
  );
}