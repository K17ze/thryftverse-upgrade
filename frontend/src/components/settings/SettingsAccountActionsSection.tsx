import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useStore } from '../../store/useStore';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { SettingsSignOutRow } from './SettingsSignOutRow';

type NavT = NativeStackNavigationProp<RootStackParamList>;

export interface SettingsAccountActionsSectionProps {
  /** Sign-out flow invoked after the in-row confirmation sheet confirms. */
  onSignOut: () => Promise<void> | void;
}

/** DESTRUCTIVE ACTIONS — separate group at the bottom. Per AGENTS.md §4 and
 *  App Store 5.1.1(v): destructive actions sit at the bottom of the settings
 *  list, separated from benign rows. Sign Out and Delete Account are grouped
 *  together with danger color. */
export function SettingsAccountActionsSection({ onSignOut }: SettingsAccountActionsSectionProps) {
  const navigation = useNavigation<NavT>();
  const { t: ts } = useAppTranslation('settings');
  const currentUser = useStore((state) => state.currentUser);

  return (
    <SettingsSection title={ts('sections.account')}>
      <SettingsSignOutRow
        username={currentUser?.username}
        onSignOut={onSignOut}
      />
      <SettingsRow
        icon="trash-outline"
        title={ts('rows.deleteAccount')}
        subtitle={ts('rows.deleteAccountSubtitle')}
        danger
        onPress={() => navigation.navigate('DeleteAccount')}
        isLast
        accessibilityLabel={ts('rows.deleteAccount')}
        accessibilityHint={ts('accessibility.deleteAccountHint')}
      />
    </SettingsSection>
  );
}
