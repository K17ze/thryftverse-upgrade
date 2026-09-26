'use client';

import { SettingsScaffold } from '@/components/settings/SettingsScaffold';
import { AccessibilityView } from '@/components/settings/AccessibilityView';

export default function AccessibilitySettingsPage() {
  return (
    <SettingsScaffold title="Accessibility">
      <AccessibilityView />
    </SettingsScaffold>
  );
}
