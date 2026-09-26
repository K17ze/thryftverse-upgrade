'use client';

import { SettingsScaffold } from '@/components/settings/SettingsScaffold';
import { PostageView } from '@/components/settings/PostageView';

export default function PostageSettingsPage() {
  return (
    <SettingsScaffold title="Postage">
      <PostageView />
    </SettingsScaffold>
  );
}
