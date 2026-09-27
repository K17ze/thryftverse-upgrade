import type { Metadata } from 'next';
import { SettingsScaffold } from '@/components/settings/SettingsScaffold';
import { DataView } from '@/components/settings/DataView';

export const metadata: Metadata = {
  title: 'Data & privacy settings',
};

export default function DataSettingsPage() {
  return (
    <SettingsScaffold title="Data & privacy">
      <DataView />
    </SettingsScaffold>
  );
}
