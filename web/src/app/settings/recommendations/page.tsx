import type { Metadata } from 'next';
import { SettingsScaffold } from '@/components/settings/SettingsScaffold';
import { RecommendationsView } from '@/components/settings/RecommendationsView';

export const metadata: Metadata = {
  title: 'Recommendations settings',
};

export default function RecommendationsSettingsPage() {
  return (
    <SettingsScaffold title="Recommendations">
      <RecommendationsView />
    </SettingsScaffold>
  );
}
