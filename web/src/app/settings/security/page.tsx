'use client';

import { SettingsScaffold } from '@/components/settings/SettingsScaffold';
import { SecurityView } from '@/components/settings/SecurityView';

export default function SecuritySettingsPage() {
  return (
    <SettingsScaffold title="Security">
      <SecurityView />
    </SettingsScaffold>
  );
}
