import type { Metadata } from 'next';
import { SettingsScaffold } from '@/components/settings/SettingsScaffold';
import { AccountControlView } from '@/components/settings/AccountControlView';

export const metadata: Metadata = {
  title: 'Account control',
};

export default function AccountControlPage() {
  return (
    <SettingsScaffold title="Account control">
      <AccountControlView />
    </SettingsScaffold>
  );
}
