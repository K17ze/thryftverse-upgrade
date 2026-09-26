'use client';

import { SettingsScaffold } from '@/components/settings/SettingsScaffold';
import { SustainabilityView } from '@/components/settings/SustainabilityView';

export default function SustainabilitySettingsPage() {
  return (
    <SettingsScaffold title="Sustainability">
      <SustainabilityView />
    </SettingsScaffold>
  );
}
