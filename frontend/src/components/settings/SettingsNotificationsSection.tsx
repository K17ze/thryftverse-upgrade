import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { useSettingsPreferences } from '../../context/SettingsPreferencesContext';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';

type NavT = NativeStackNavigationProp<RootStackParamList>;

export interface SettingsNotificationsSectionProps {
  /** OS-level push permission: null until probed (or probe failed). */
  pushPermissionGranted: boolean | null;
  /** True while the enable request is in flight. */
  isTogglingPush: boolean;
  onTogglePushPermission: (enable: boolean) => void;
}

/** NOTIFICATIONS — OS push permission toggle + category/email preferences. */
export function SettingsNotificationsSection({
  pushPermissionGranted,
  isTogglingPush,
  onTogglePushPermission }: SettingsNotificationsSectionProps) {
  const navigation = useNavigation<NavT>();
  const { t: ts } = useAppTranslation('settings');
  const {
    emailNotificationsEnabled,
    pushEnabledCount,
    pushTotalCount } = useSettingsPreferences();

  const notificationSummary = `${pushEnabledCount}/${pushTotalCount} categories`;

  return (
    <SettingsSection title={ts('sections.notifications')}>
      <SettingsRow
        icon="notifications"
        title={ts('rows.enableNotifications')}
        subtitle={pushPermissionGranted === null ? ts('rows.permissionUnknown') : pushPermissionGranted ? ts('rows.permissionAllowed') : ts('rows.permissionNotAllowed')}
        toggleValue={pushPermissionGranted === true}
        onToggle={(v) => void onTogglePushPermission(v)}
        disabled={isTogglingPush}
        isFirst
      />
      <SettingsRow
        icon="notifications"
        title={ts('rows.notificationCategories')}
        subtitle={notificationSummary}
        onPress={() => navigation.navigate('PushNotifications')}
      />
      <SettingsRow
        icon="options"
        title={ts('rows.notificationPreferences')}
        subtitle={ts('rows.notificationPreferencesSubtitle')}
        onPress={() => navigation.navigate('NotificationPreferences')}
      />
      <SettingsRow
        icon="mail"
        title={ts('rows.emailPreferences')}
        subtitle={emailNotificationsEnabled ? 'On' : 'Off'}
        onPress={() => navigation.navigate('EmailNotifications')}
        isLast
      />
    </SettingsSection>
  );
}
