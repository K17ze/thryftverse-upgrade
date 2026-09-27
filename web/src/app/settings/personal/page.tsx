import type { Metadata } from 'next';
import { SettingsScaffold } from '@/components/settings/SettingsScaffold';
import { PersonalInfoView } from '@/components/settings/PersonalInfoView';

export const metadata: Metadata = {
  title: 'Personal info',
};

export default function PersonalInfoPage() {
  return (
    <SettingsScaffold title="Personal info">
      <PersonalInfoView />
    </SettingsScaffold>
  );
}
