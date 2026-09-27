import type { Metadata } from 'next';
import { SettingsScaffold } from '@/components/settings/SettingsScaffold';
import { MessagingSettingsView } from './MessagingSettingsView';

export const metadata: Metadata = {
  title: 'Chat settings',
};

export default function MessagingSettingsPage() {
  return (
    <SettingsScaffold title="Chat settings">
      <MessagingSettingsView />
    </SettingsScaffold>
  );
}
