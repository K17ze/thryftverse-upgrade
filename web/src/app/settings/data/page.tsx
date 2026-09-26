'use client';

import { SettingsScaffold } from '@/components/settings/SettingsScaffold';
import { DataView } from '@/components/settings/DataView';

export default function DataSettingsPage() {
  return (
    <SettingsScaffold title="Data & privacy">
      <DataView />
    </SettingsScaffold>
  );
}
