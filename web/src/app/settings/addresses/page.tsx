import type { Metadata } from 'next';
import { SettingsScaffold } from '@/components/settings/SettingsScaffold';
import { AddressesView } from '@/components/settings/AddressesView';

export const metadata: Metadata = {
  title: 'Saved addresses',
};

export default function AddressesSettingsPage() {
  return (
    <SettingsScaffold title="Saved addresses">
      <AddressesView />
    </SettingsScaffold>
  );
}
