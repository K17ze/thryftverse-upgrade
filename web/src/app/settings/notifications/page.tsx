import type { Metadata } from 'next';
import { SettingsScaffold } from '@/components/settings/SettingsScaffold';
import { NotificationPrefsView } from '@/components/settings/NotificationPrefsView';

export const metadata: Metadata = {
  title: 'Notification settings',
};

export default function NotificationSettingsPage() {
  return (
    <SettingsScaffold title="Notifications">
      <NotificationPrefsView />
    </SettingsScaffold>
  );
}
