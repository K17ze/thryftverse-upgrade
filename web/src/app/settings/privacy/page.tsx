import type { Metadata } from 'next';
import { SettingsScaffold } from '@/components/settings/SettingsScaffold';
import { PrivacyView } from '@/components/settings/PrivacyView';

export const metadata: Metadata = {
  title: 'Privacy settings',
};

export default function PrivacySettingsPage() {
  return (
    <SettingsScaffold title="Privacy">
      <PrivacyView />
    </SettingsScaffold>
  );
}
