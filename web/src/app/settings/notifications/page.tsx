'use client';

import { SettingsScaffold } from '@/components/settings/SettingsScaffold';
import { NotificationPrefsView } from '@/components/settings/NotificationPrefsView';

export default function NotificationSettingsPage() {
  return (
    <SettingsScaffold title="Notifications">
      <NotificationPrefsView />
    </SettingsScaffold>
  );
}
