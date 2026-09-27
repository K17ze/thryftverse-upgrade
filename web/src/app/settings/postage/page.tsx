import type { Metadata } from 'next';
import { SettingsScaffold } from '@/components/settings/SettingsScaffold';
import { PostageView } from '@/components/settings/PostageView';

export const metadata: Metadata = {
  title: 'Postage settings',
};

export default function PostageSettingsPage() {
  return (
    <SettingsScaffold title="Postage">
      <PostageView />
    </SettingsScaffold>
  );
}
