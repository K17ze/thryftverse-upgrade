import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { t } from '../../i18n';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';
import { FeatureFlagDebugSection } from './FeatureFlagDebugSection';

type NavT = NativeStackNavigationProp<RootStackParamList>;

export interface SettingsAdvancedSectionProps {
  /** Developer-mode gate — the Advanced section is hidden from ordinary
   *  consumers and revealed only when developer mode is enabled
   *  (Settings → About → tap version 7 times). */
  visible: boolean;
}

/** ADVANCED (developer-only) — per spec 18: Developer mode keeps only raw
 *  debugging tools — not consumer agent features, which live in "Connected
 *  services" above. */
export function SettingsAdvancedSection({ visible }: SettingsAdvancedSectionProps) {
  const navigation = useNavigation<NavT>();
  const { t: ts } = useAppTranslation('settings');

  if (!visible) return null;

  return (
    <>
      <SettingsSection title={ts('sections.advanced')}>
        <SettingsRow
          icon="terminal-outline"
          title={ts('rows.runtimeSmokeTest')}
          subtitle={ts('rows.runtimeSmokeTestSubtitle')}
          onPress={() => navigation.navigate('RuntimeSmokeTest')}
          isFirst
        />
        {/* Model artifact registry — admin-gated ops surface (migration 144).
            Server enforces admin auth on every endpoint. */}
        <SettingsRow
          icon="cube-outline"
          title={t('modelRegistry.settingsRow')}
          subtitle={t('modelRegistry.settingsRowSubtitle')}
          onPress={() => navigation.navigate('ModelRegistry')}
          isLast
        />
      </SettingsSection>

      {/* Feature flag debug view — read-only flag status for QA teams.
          Shown only when developer mode is enabled (Advanced section). */}
      <FeatureFlagDebugSection />
    </>
  );
}
