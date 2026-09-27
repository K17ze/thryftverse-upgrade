import type { Metadata } from 'next';
import { SettingsScaffold } from '@/components/settings/SettingsScaffold';
import { ConnectedAccountsView } from '@/components/settings/ConnectedAccountsView';

export const metadata: Metadata = {
  title: 'Connected accounts',
};

export default function ConnectedAccountsPage() {
  return (
    <SettingsScaffold title="Connected accounts">
      <ConnectedAccountsView />
    </SettingsScaffold>
  );
}
