import type { Metadata } from 'next';
import { SettingsScaffold } from '@/components/settings/SettingsScaffold';
import { PersonalisationView } from '@/components/settings/PersonalisationView';

export const metadata: Metadata = {
  title: 'Personalisation',
};

export default function PersonalisationPage() {
  return (
    <SettingsScaffold title="Personalisation">
      <PersonalisationView />
    </SettingsScaffold>
  );
}
