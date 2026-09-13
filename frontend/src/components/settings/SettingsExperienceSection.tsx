import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { useSettingsPreferences } from '../../context/SettingsPreferencesContext';
import { CURRENCIES, SupportedCurrencyCode } from '../../constants/currencies';
import {
  SupportedLanguageOption,
  getLanguageEndonym } from '../../preferences/settingsPreferences';
import {
  getThemePreferenceLabel,
  ThemePreference } from '../../theme/themePreference';
import {
  getAccentPresetLabel,
  type AccentPreset } from '../../theme/accentPreference';
import { SettingsSection } from './SettingsSection';
import { SettingsRow } from './SettingsRow';

type NavT = NativeStackNavigationProp<RootStackParamList>;

export interface SettingsExperienceSectionProps {
  themePreference: ThemePreference;
  accentPreset: AccentPreset;
  displayModeLabel: string;
  currencyCode: SupportedCurrencyCode;
  selectedLanguage: SupportedLanguageOption;
  onOpenThemePicker: () => void;
  onOpenAccentPicker: () => void;
  onCycleDisplayMode: () => void;
  onOpenCurrencyPicker: () => void;
  onOpenLanguagePicker: () => void;
  onClearSearchHistory: () => void;
}

/** EXPERIENCE — appearance, language, currency, accessibility,
 *  recommendations. */
export function SettingsExperienceSection({
  themePreference,
  accentPreset,
  displayModeLabel,
  currencyCode,
  selectedLanguage,
  onOpenThemePicker,
  onOpenAccentPicker,
  onCycleDisplayMode,
  onOpenCurrencyPicker,
  onOpenLanguagePicker,
  onClearSearchHistory }: SettingsExperienceSectionProps) {
  const navigation = useNavigation<NavT>();
  const { t: ts } = useAppTranslation('settings');
  const { analyticsOptOut, setAnalyticsOptOut } = useSettingsPreferences();

  return (
    <SettingsSection title={ts('sections.experience')}>
      <SettingsRow
        glyph="theme-palette"
        title={ts('rows.theme')}
        value={getThemePreferenceLabel(themePreference)}
        onPress={onOpenThemePicker}
        isFirst
      />
      <SettingsRow
        icon="color-palette-outline"
        title="Accent colour"
        value={getAccentPresetLabel(accentPreset)}
        onPress={onOpenAccentPicker}
      />
      <SettingsRow
        icon="repeat"
        title={ts('rows.currencyDisplay')}
        value={displayModeLabel}
        onPress={onCycleDisplayMode}
      />
      <SettingsRow
        glyph="currency-local"
        title={ts('rows.localCurrency')}
        value={`${currencyCode} (${CURRENCIES[currencyCode].symbol})`}
        onPress={onOpenCurrencyPicker}
      />
      <SettingsRow
        glyph="language-globe"
        title={ts('rows.language')}
        value={getLanguageEndonym(selectedLanguage)}
        onPress={onOpenLanguagePicker}
      />
      <SettingsRow
        glyph="content-sliders"
        title={ts('rows.contentPreferences')}
        subtitle={ts('rows.contentPreferencesSubtitle')}
        onPress={() => navigation.navigate('Personalisation')}
      />
      <SettingsRow
        glyph="ai-smart"
        title={ts('rows.recommendations')}
        subtitle={ts('rows.recommendationsSubtitle')}
        onPress={() => navigation.navigate('AIPreferences')}
      />
      <SettingsRow
        glyph="feed-list"
        title={ts('rows.yourFeed')}
        subtitle={ts('rows.yourFeedSubtitle')}
        onPress={() => navigation.navigate('YourAlgorithm')}
      />
      <SettingsRow
        icon="accessibility"
        title={ts('rows.accessibility')}
        subtitle={ts('rows.accessibilitySubtitle')}
        onPress={() => navigation.navigate('AccessibilitySettings')}
      />
      <SettingsRow
        glyph="history-clock"
        title={ts('rows.searchHistory')}
        subtitle={ts('rows.searchHistorySubtitle')}
        onPress={() => void onClearSearchHistory()}
      />
      <SettingsRow
        glyph="connection-link"
        title={ts('rows.dataSharing')}
        subtitle={ts('rows.dataSharingSubtitle')}
        toggleValue={!analyticsOptOut}
        onToggle={(v) => setAnalyticsOptOut(!v)}
        isLast
      />
    </SettingsSection>
  );
}
