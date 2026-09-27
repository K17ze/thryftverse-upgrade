import type { Metadata } from 'next';
import { SettingsScaffold } from '@/components/settings/SettingsScaffold';
import { AccessibilityView } from '@/components/settings/AccessibilityView';

export const metadata: Metadata = {
  title: 'Accessibility settings',
};

export default function AccessibilitySettingsPage() {
  return (
    <SettingsScaffold title="Accessibility">
      <AccessibilityView />
    </SettingsScaffold>
  );
}
