import type { Metadata } from 'next';
import { SettingsScaffold } from '@/components/settings/SettingsScaffold';
import { SecurityView } from '@/components/settings/SecurityView';

export const metadata: Metadata = {
  title: 'Security settings',
};

export default function SecuritySettingsPage() {
  return (
    <SettingsScaffold title="Security">
      <SecurityView />
    </SettingsScaffold>
  );
}
