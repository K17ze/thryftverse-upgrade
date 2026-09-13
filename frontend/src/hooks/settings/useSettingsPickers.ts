import React from 'react';
import { useToast } from '../../context/ToastContext';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import { useAppTheme } from '../../theme/ThemeContext';
import { useCurrencyPref } from '../useCurrencyPref';
import { useSettingsPreferences } from '../../context/SettingsPreferencesContext';
import { CURRENCIES, SupportedCurrencyCode } from '../../constants/currencies';
import {
  LANGUAGE_OPTIONS,
  SupportedLanguageOption } from '../../preferences/settingsPreferences';
import {
  getThemePreferenceLabel,
  ThemePreference,
  updateThemePreference } from '../../theme/themePreference';
import {
  ACCENT_PRESETS,
  getAccentPresetLabel,
  type AccentPreset } from '../../theme/accentPreference';

export interface UseSettingsPickersResult {
  // ── Display values (drive row subtitles/values) ──
  currencyCode: SupportedCurrencyCode;
  displayModeLabel: string;
  cycleDisplayMode: () => void;
  themePreference: ThemePreference;
  accentPreset: AccentPreset;
  selectedLanguage: SupportedLanguageOption;
  // ── Picker visibility ──
  currencyPickerVisible: boolean;
  setCurrencyPickerVisible: React.Dispatch<React.SetStateAction<boolean>>;
  themePickerVisible: boolean;
  setThemePickerVisible: React.Dispatch<React.SetStateAction<boolean>>;
  accentPickerVisible: boolean;
  setAccentPickerVisible: React.Dispatch<React.SetStateAction<boolean>>;
  languagePickerVisible: boolean;
  setLanguagePickerVisible: React.Dispatch<React.SetStateAction<boolean>>;
  // ── Options + selection ──
  currencyOptions: string[];
  selectedCurrencyOption: string | undefined;
  handleCurrencySelect: (option: string) => void;
  themeOptions: string[];
  selectedThemeOption: string | undefined;
  handleThemeSelect: (option: string) => Promise<void>;
  accentOptions: string[];
  selectedAccentOption: string;
  handleAccentSelect: (option: string) => void;
  handleLanguageSelect: (option: string) => void;
}

/**
 * Currency / theme / accent / language picker state for the Settings screen.
 * Owns the four BottomSheetPicker visibility flags, the option lists, and the
 * select handlers that write back to the preference stores.
 */
export function useSettingsPickers(): UseSettingsPickersResult {
  const { show } = useToast();
  const { t: ts } = useAppTranslation('settings');

  const {
    language: selectedLanguage,
    setLanguage } = useSettingsPreferences();

  const [currencyPickerVisible, setCurrencyPickerVisible] = React.useState(false);
  const [themePickerVisible, setThemePickerVisible] = React.useState(false);
  const [accentPickerVisible, setAccentPickerVisible] = React.useState(false);
  const [languagePickerVisible, setLanguagePickerVisible] = React.useState(false);

  const { themePreference, setThemePreference, accentPreset, setAccentPreset } = useAppTheme();

  const {
    currencyCode,
    displayModeLabel,
    setCurrencyCode,
    cycleDisplayMode } = useCurrencyPref();

  const currencyOptions = React.useMemo(
    () =>
      (Object.keys(CURRENCIES) as SupportedCurrencyCode[]).map(
        (code) => `${code} | ${CURRENCIES[code].name} (${CURRENCIES[code].symbol})`
      ),
    []
  );

  const selectedCurrencyOption = React.useMemo(
    () => currencyOptions.find((option) => option.startsWith(`${currencyCode} |`)),
    [currencyCode, currencyOptions]
  );

  const themeValues: ThemePreference[] = ['system', 'light', 'dark'];
  const themeOptions = React.useMemo(
    () => [ts('picker.themeSystem'), ts('picker.themeLight'), ts('picker.themeDark')],
    [ts]
  );
  const languageOptions = React.useMemo(() => [...LANGUAGE_OPTIONS], []);

  const selectedThemeOption = React.useMemo(
    () => {
      const idx = themeValues.indexOf(themePreference);
      return idx >= 0 ? themeOptions[idx] : undefined;
    },
    [themeOptions, themePreference]
  );

  const accentOptions = React.useMemo(
    () => ACCENT_PRESETS.map((p) => p.label),
    [],
  );
  const selectedAccentOption = React.useMemo(
    () => getAccentPresetLabel(accentPreset),
    [accentPreset],
  );

  const handleCurrencySelect = (option: string) => {
    const selectedCode = option.split(' | ')[0] as SupportedCurrencyCode;
    if (selectedCode !== currencyCode) {
      setCurrencyCode(selectedCode);
    }
  };

  const [isApplyingTheme, setIsApplyingTheme] = React.useState(false);

  const handleThemeSelect = async (option: string) => {
    const idx = themeOptions.indexOf(option);
    if (idx < 0) return;
    const nextPreference = themeValues[idx];
    if (nextPreference === themePreference) return;
    setThemePickerVisible(false);
    setIsApplyingTheme(true);
    show(`Applying ${getThemePreferenceLabel(nextPreference)} theme…`, 'info');
    await updateThemePreference(nextPreference, { reloadApp: true });
    // If reload fails (e.g. production without expo-updates), fall back to
    // the reactive context update so useAppTheme consumers still re-render.
    setThemePreference(nextPreference);
    setIsApplyingTheme(false);
  };

  const handleLanguageSelect = (option: string) => {
    if (!LANGUAGE_OPTIONS.includes(option as SupportedLanguageOption)) return;
    const nextLanguage = option as SupportedLanguageOption;
    if (nextLanguage === selectedLanguage) return;
    setLanguage(nextLanguage);
  };

  const handleAccentSelect = (option: string) => {
    const preset = ACCENT_PRESETS.find((p) => p.label === option);
    if (!preset || preset.id === accentPreset) return;
    setAccentPickerVisible(false);
    setAccentPreset(preset.id);
    show(`Accent changed to ${preset.label}`, 'success');
  };

  return {
    currencyCode,
    displayModeLabel,
    cycleDisplayMode,
    themePreference,
    accentPreset,
    selectedLanguage,
    currencyPickerVisible,
    setCurrencyPickerVisible,
    themePickerVisible,
    setThemePickerVisible,
    accentPickerVisible,
    setAccentPickerVisible,
    languagePickerVisible,
    setLanguagePickerVisible,
    currencyOptions,
    selectedCurrencyOption,
    handleCurrencySelect,
    themeOptions,
    selectedThemeOption,
    handleThemeSelect,
    accentOptions,
    selectedAccentOption,
    handleAccentSelect,
    handleLanguageSelect,
  };
}
