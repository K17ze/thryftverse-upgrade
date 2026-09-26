'use client';

import { SettingsScaffold } from '@/components/settings/SettingsScaffold';
import { PrivacyView } from '@/components/settings/PrivacyView';

export default function PrivacySettingsPage() {
  return (
    <SettingsScaffold title="Privacy">
      <PrivacyView />
    </SettingsScaffold>
  );
}
