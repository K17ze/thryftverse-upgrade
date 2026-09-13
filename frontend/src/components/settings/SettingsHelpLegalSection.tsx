import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';

type NavT = NativeStackNavigationProp<RootStackParamList>;

export interface SettingsHelpLegalSectionProps {
  /** Opens an external URL, showing an error toast when the link fails. */
  onOpenExternal: (url: string) => void;
}

/** HELP & LEGAL — support, terms, privacy, about (version/legal footer). */
export function SettingsHelpLegalSection({ onOpenExternal }: SettingsHelpLegalSectionProps) {
  const navigation = useNavigation<NavT>();
  const { t: ts } = useAppTranslation('settings');

  return (
    <SettingsSection title={ts('sections.helpLegal')}>
      <SettingsRow
        icon="help"
        title={ts('rows.helpCentre')}
        onPress={() => navigation.navigate('HelpSupport')}
        isFirst
      />
      <SettingsRow
        icon="document"
        title={ts('rows.termsOfService')}
        onPress={() => void onOpenExternal('https://thryftverse.app/terms')}
      />
      <SettingsRow
        glyph="privacy-document"
        title={ts('rows.privacyPolicy')}
        onPress={() => void onOpenExternal('https://thryftverse.app/privacy')}
      />
      <SettingsRow
        icon="info"
        title={ts('rows.aboutThryftverse')}
        value="v1.0.0"
        onPress={() => navigation.navigate('About')}
        isLast
      />
    </SettingsSection>
  );
}
