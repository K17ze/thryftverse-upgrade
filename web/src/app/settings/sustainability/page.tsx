import type { Metadata } from 'next';
import { SettingsScaffold } from '@/components/settings/SettingsScaffold';
import { SustainabilityView } from '@/components/settings/SustainabilityView';

export const metadata: Metadata = {
  title: 'Sustainability settings',
};

export default function SustainabilitySettingsPage() {
  return (
    <SettingsScaffold title="Sustainability">
      <SustainabilityView />
    </SettingsScaffold>
  );
}
