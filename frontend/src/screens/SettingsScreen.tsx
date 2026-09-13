import React from 'react';
import { View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { t } from '../i18n';
import { useAppTranslation } from '../i18n/useAppTranslation';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { LanguagePickerSheet } from '../components/LanguagePickerSheet';
import { AppSearchBar } from '../components/ui/AppSearchBar';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { OfflineBanner } from '../components/OfflineBanner';
import { SettingsListSkeleton } from '../components/skeletons/SettingsListSkeleton';
import {
  SettingsIdentityRow,
  SettingsBalanceCard,
  SettingsVerificationPrompt,
  SettingsHealthPills,
  SettingsSearchResults,
  SettingsAccountSection,
  SettingsBuyingSellingSection,
  SettingsNotificationsSection,
  SettingsExperienceSection,
  SettingsConnectedServicesSection,
  SettingsHelpLegalSection,
  SettingsAdvancedSection,
  SettingsAccountActionsSection,
  createSettingsScreenStyles } from '../components/settings';
import {
  useSettingsScreenData,
  useSettingsPushPermission,
  useSettingsSearch,
  useSettingsPickers,
  useSettingsActions } from '../hooks/settings';
import { Space } from '../theme/designTokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

/**
 * Settings orchestrator — composes the search entry, sectioned navigation
 * rows, and preference pickers. All state lives in src/hooks/settings/ and
 * all rendering in src/components/settings/.
 */
export default function SettingsScreen({ navigation }: Props) {
  const { t: ts } = useAppTranslation('settings');

  const {
    isHydrating,
    walletBalance,
    isBiometricAvailable } = useSettingsScreenData();

  const {
    pushPermissionGranted,
    isTogglingPush,
    handleTogglePushPermission } = useSettingsPushPermission();

  const {
    searchQuery,
    setSearchQuery,
    isSearching,
    searchResults,
    showAdvancedDeveloper } = useSettingsSearch();

  const {
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
    handleLanguageSelect } = useSettingsPickers();

  const {
    handleLogout,
    handleClearSearchHistory,
    handleOpenExternal } = useSettingsActions();

  // ── Search overlay ──
  // Search is now inline — a search field at the top of the settings list
  // that filters settings in-place. No separate overlay screen needed.

  return (
    <View testID="settings-screen" style={{ flex: 1 }}>
    <FlagshipScreen
      header={
        <FlagshipHeader
          title={ts('header.title')}
          onBack={() => navigation.goBack()}
        />
      }
    >
      {/* ── Offline banner ── */}
      <OfflineBanner />

      {/* ── INLINE SEARCH — filters settings in-place ── */}
      <View style={{ marginBottom: Space.md }}>
        <AppSearchBar
          placeholder={ts('search.placeholder')}
          value={searchQuery}
          onChangeText={setSearchQuery}
          containerStyle={styles.searchField}
        />
      </View>

      {isHydrating ? (
        /* ── HYDRATION SKELETON — persist store loading user/session data ── */
        <SettingsListSkeleton />
      ) : isSearching ? (
        /* ── SEARCH RESULTS — flat filtered list ── */
        <SettingsSearchResults
          results={searchResults}
          onSelectResult={(key) => {
            setSearchQuery('');
            (navigation.navigate as (key: keyof RootStackParamList) => void)(key);
          }}
        />
      ) : (
        <>
          {/* ── IDENTITY — compact flat row, no card ── */}
          <SettingsIdentityRow />

          {/* ── Thryft Balance Card — Depop flagship benchmark (settings reference.png) ── */}
          <SettingsBalanceCard walletBalance={walletBalance} />

          {/* ── Verification prompt — shows when identity/seller verification
              is not yet complete. Email verification alone does not grant
              a trust badge (P0-UI-3). ── */}
          <SettingsVerificationPrompt />

          {/* ── ACCOUNT HEALTH INDICATOR — compact status pills ──
              Shows completed security steps at a glance. Each pill is a
              checkmark + label. Incomplete steps are omitted (not shown as
              red warnings — the verification prompt above handles that). */}
          <SettingsHealthPills />

          {/* ── YOUR ACCOUNT (profile, security, privacy) ── */}
          <SettingsAccountSection isBiometricAvailable={isBiometricAvailable} />

          {/* ── BUYING & SELLING (payments, payouts, orders, co-own, disputes) ── */}
          <SettingsBuyingSellingSection />

          {/* ── NOTIFICATIONS ── */}
          <SettingsNotificationsSection
            pushPermissionGranted={pushPermissionGranted}
            isTogglingPush={isTogglingPush}
            onTogglePushPermission={handleTogglePushPermission}
          />

          {/* ── EXPERIENCE (appearance, language, currency, accessibility, recommendations) ── */}
          <SettingsExperienceSection
            themePreference={themePreference}
            accentPreset={accentPreset}
            displayModeLabel={displayModeLabel}
            currencyCode={currencyCode}
            selectedLanguage={selectedLanguage}
            onOpenThemePicker={() => setThemePickerVisible(true)}
            onOpenAccentPicker={() => setAccentPickerVisible(true)}
            onCycleDisplayMode={cycleDisplayMode}
            onOpenCurrencyPicker={() => setCurrencyPickerVisible(true)}
            onOpenLanguagePicker={() => setLanguagePickerVisible(true)}
            onClearSearchHistory={handleClearSearchHistory}
          />

          {/* ── CONNECTED SERVICES ── */}
          {/* Per spec 18: Agents are a normal product destination, not hidden
              behind developer mode. Create Agent is intentionally excluded from
              Settings — it lives in the Agents home and profile menu. */}
          <SettingsConnectedServicesSection />

          {/* ── HELP & LEGAL (support, safety, terms, about) ── */}
          <SettingsHelpLegalSection onOpenExternal={handleOpenExternal} />

          {/* ── ADVANCED (developer-only) ── */}
          {/* Per spec 18: Developer mode keeps only raw debugging tools — not
              consumer agent features, which now live in "Connected services"
              above. Gated behind developer mode (Settings → About → tap version
              7 times) so ordinary consumers never see implementation technology. */}
          <SettingsAdvancedSection visible={showAdvancedDeveloper} />

          {/* ── DESTRUCTIVE ACTIONS — separate group at the bottom ── */}
          {/* Per AGENTS.md §4 and App Store 5.1.1(v): destructive actions sit
              at the bottom of the settings list, separated from benign rows.
              Sign Out and Delete Account are grouped together with danger color. */}
          <SettingsAccountActionsSection onSignOut={handleLogout} />
          </>
      )}
    </FlagshipScreen>

      {/* BottomSheetPickers MUST be rendered OUTSIDE FlagshipScreen's
          ScrollView. When inside the ScrollView, absoluteFill fills the
          scrollable content container — not the screen viewport — so the
          sheet renders below the fold and is invisible to the user. */}
      <BottomSheetPicker
        visible={currencyPickerVisible}
        onClose={() => setCurrencyPickerVisible(false)}
        title={t('settings.picker.currencyTitle')}
        options={currencyOptions}
        selectedValue={selectedCurrencyOption}
        onSelect={handleCurrencySelect}
        searchable
      />

      <LanguagePickerSheet
        visible={languagePickerVisible}
        onClose={() => setLanguagePickerVisible(false)}
        selectedLanguage={selectedLanguage}
        onSelect={handleLanguageSelect}
      />

      <BottomSheetPicker
        visible={themePickerVisible}
        onClose={() => setThemePickerVisible(false)}
        title={t('settings.picker.themeTitle')}
        options={themeOptions}
        selectedValue={selectedThemeOption}
        onSelect={handleThemeSelect}
      />

      <BottomSheetPicker
        visible={accentPickerVisible}
        onClose={() => setAccentPickerVisible(false)}
        title="Accent colour"
        options={accentOptions}
        selectedValue={selectedAccentOption}
        onSelect={handleAccentSelect}
      />
    </View>
  );
}

const styles = createSettingsScreenStyles();
