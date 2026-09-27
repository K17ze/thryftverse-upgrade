import type { Metadata } from 'next';
import { SettingsScaffold } from '@/components/settings/SettingsScaffold';
import { RecoveryCodesView } from '@/components/settings/RecoveryCodesView';

export const metadata: Metadata = {
  title: 'Recovery codes',
};

export default function RecoveryCodesPage() {
  return (
    <SettingsScaffold title="Recovery codes">
      <RecoveryCodesView />
    </SettingsScaffold>
  );
}
