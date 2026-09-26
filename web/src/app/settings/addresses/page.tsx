'use client';

import { SettingsScaffold } from '@/components/settings/SettingsScaffold';
import { AddressesView } from '@/components/settings/AddressesView';

export default function AddressesSettingsPage() {
  return (
    <SettingsScaffold title="Saved addresses">
      <AddressesView />
    </SettingsScaffold>
  );
}
