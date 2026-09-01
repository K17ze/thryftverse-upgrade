import React from 'react';
import { Linking, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { logoutFromSession } from '../services/authApi';
import { clearUserScopedQueryCache } from '../platform/server';
import { CURRENCIES, SupportedCurrencyCode } from '../constants/currencies';
import { useCurrencyPref } from '../hooks/useCurrencyPref';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { LanguagePickerSheet } from '../components/LanguagePickerSheet';
import { useToast } from '../context/ToastContext';
import {
  LANGUAGE_OPTIONS,
  SupportedLanguageOption,
  getLanguageEndonym } from '../preferences/settingsPreferences';
import { useSettingsPreferences } from '../context/SettingsPreferencesContext';
import {
  getPushPermissionStatus,
  requestPushPermissionWithContext,
  resetPushPermissionAskedFlag } from '../lib/pushPermission';
import {
  getThemePreferenceLabel,
  ThemePreference,
  updateThemePreference } from '../theme/themePreference';
import { useAppTheme } from '../theme/ThemeContext';
import { useBiometricGate } from '../hooks/useBiometricGate';
import { t } from '../i18n';
import { useAppTranslation } from '../i18n/useAppTranslation';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { AppSearchBar } from '../components/ui/AppSearchBar';
import { FlatRow } from '../components/ui/FlatRow';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { OfflineBanner } from '../components/OfflineBanner';
import { SettingsSignOutRow } from '../components/settings/SettingsSignOutRow';
import { SettingsListSkeleton } from '../components/skeletons/SettingsListSkeleton';

import { Space, FontFamily, Radius } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useFeatureFlag, type FeatureFlagKey } from '../analytics';
type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

// All feature flags defined in src/analytics/types.ts. Listed here so the
// debug view shows every flag the app can evaluate — QA can verify flag
// states without navigating to each consuming screen.
const ALL_FEATURE_FLAGS: FeatureFlagKey[] = [
  'new_home_feed',
  'live_shopping_enabled',
  'co_own_v2',
  'ai_listing_assist',
  'moodboard_beta',
  'conversational_search',
  'advanced_filters',
  'seller_analytics_v2',
];

/**
 * Read-only feature flag debug section for QA teams.
 *
 * Renders each flag name and its current boolean value. Shown only inside
 * the developer-gated "Advanced" section so ordinary consumers never see
 * implementation detail. Uses the existing `useFeatureFlag` hook — no new
 * hooks, no new dependencies.
 */
function FeatureFlagDebugSection() {
  const { colors } = useAppTheme();
  return (
    <View style={flagStyles.container}>
      <Text style={[flagStyles.heading, { color: colors.textMuted }]}>
        Feature flags
      </Text>
      {ALL_FEATURE_FLAGS.map((flag) => (
        <FeatureFlagRow key={flag} flagKey={flag} />
      ))}
    </View>
  );
}

/** Single flag row — calls the hook and renders the live value. */
function FeatureFlagRow({ flagKey }: { flagKey: FeatureFlagKey }) {
  const { colors } = useAppTheme();
  const enabled = useFeatureFlag(flagKey);
  return (
    <View style={[flagStyles.row, { borderBottomColor: colors.borderSubtle }]}>
      <Text style={[flagStyles.flagName, { color: colors.textSecondary }]}>
        {flagKey}
      </Text>
      <View
        style={[
          flagStyles.statusPill,
          { backgroundColor: enabled ? colors.successSubtle : colors.surfaceAlt },
        ]}
      >
        <View
          style={[
            flagStyles.statusDot,
            { backgroundColor: enabled ? colors.success : colors.textMuted },
          ]}
        />
        <Text
          style={[
            flagStyles.statusText,
            { color: enabled ? colors.success : colors.textMuted },
          ]}
        >
          {enabled ? 'On' : 'Off'}
        </Text>
      </View>
    </View>
  );
}

const flagStyles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm },
  heading: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth },
  flagName: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
    flex: 1 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xxs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xxs + 1,
    borderRadius: Radius.full },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: Radius.full },
  statusText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold } });

interface DestinationMeta {
  key: keyof RootStackParamList;
  label: string;
  searchTerms: string;
  section: string;
  showSection?: boolean;
}

// Route metadata for search — searchTerms hold only additional synonyms not already
// covered by the label or section title (the filter checks all three fields).
// Section names mirror the visible settings grouping so search results stay
// consistent with the browsable hierarchy.
const ROUTE_METADATA: DestinationMeta[] = [
  // ── Your account (profile, security, privacy) ──
  { key: 'EditProfile', label: 'Edit profile & account', searchTerms: 'avatar name bio username email phone password 2fa two factor', section: 'Your account', showSection: true },
  { key: 'Verification', label: 'Verify your identity', searchTerms: 'identity dac7 tax badge seller trust kyc', section: 'Your account' },
  { key: 'ChangePassword', label: 'Change password', searchTerms: '2fa two factor security', section: 'Your account' },
  { key: 'ConnectedAccounts', label: 'Connected accounts', searchTerms: 'google apple oauth social login', section: 'Your account' },
  { key: 'ActiveSessions', label: 'Devices & sessions', searchTerms: 'login device security', section: 'Your account' },
  { key: 'AccountControl', label: 'Account control', searchTerms: 'delete deactivate download export security', section: 'Your account' },
  { key: 'DataExport', label: 'Download my data', searchTerms: 'export gdpr', section: 'Your account' },
  { key: 'DeleteAccount', label: 'Delete account', searchTerms: 'permanently erase gdpr remove', section: 'Your account' },
  { key: 'PrivacySettings', label: 'Privacy & safety', searchTerms: 'controls visibility blocked', section: 'Your account' },
  { key: 'ChatSettings', label: 'Chat privacy', searchTerms: 'who can message messaging', section: 'Your account' },
  { key: 'DataPrivacy', label: 'Data & privacy', searchTerms: 'gdpr retention third party cookies', section: 'Your account' },
  { key: 'BlockedUsers', label: 'Blocked users', searchTerms: 'block unblock', section: 'Your account' },
  // ── Buying & selling (payments, payouts, orders, co-own, disputes) ──
  { key: 'SavedAddresses', label: 'Saved addresses', searchTerms: 'delivery shipping', section: 'Buying & selling', showSection: true },
  { key: 'Payments', label: 'Payment methods', searchTerms: 'card bank', section: 'Buying & selling' },
  { key: 'Closet', label: 'Saved & collections', searchTerms: 'closet wishlist', section: 'Buying & selling' },
  { key: 'Wallet', label: 'Payout account', searchTerms: 'wallet balance', section: 'Buying & selling' },
  { key: 'BalanceHistory', label: 'Payout history', searchTerms: 'balance', section: 'Buying & selling' },
  { key: 'Postage', label: 'Shipping preferences', searchTerms: 'postage carrier', section: 'Buying & selling' },
  { key: 'CoOwnPriceAlerts', label: 'Price alerts', searchTerms: 'notifications co-own', section: 'Buying & selling' },
  { key: 'CoOwnRecurringOrders', label: 'Auto-invest plans', searchTerms: 'recurring orders co-own', section: 'Buying & selling' },
  { key: 'CoOwnTaxDocuments', label: 'Tax documents', searchTerms: 'statements cgt co-own', section: 'Buying & selling' },
  { key: 'ResolutionCentre', label: 'Resolution Centre', searchTerms: 'dispute resolution', section: 'Buying & selling' },
  // ── Notifications ──
  { key: 'PushNotifications', label: 'Notification categories', searchTerms: 'push alerts', section: 'Notifications', showSection: true },
  { key: 'EmailNotifications', label: 'Email preferences', searchTerms: '', section: 'Notifications' },
  { key: 'NotificationPreferences', label: 'Notification preferences', searchTerms: 'push offers price drop marketing quiet hours', section: 'Notifications' },
  // ── Experience (appearance, language, currency, accessibility, recommendations) ──
  { key: 'Personalisation', label: 'Content preferences', searchTerms: 'feed personalisation appearance content preferences', section: 'Experience', showSection: true },
  { key: 'AIPreferences', label: 'Recommendations', searchTerms: 'listing suggestions photo enhancement title price autocomplete sell recommendations', section: 'Experience' },
  { key: 'YourAlgorithm', label: 'Your feed', searchTerms: 'feed recommendations topics signals transparency algorithm', section: 'Experience' },
  { key: 'AccessibilitySettings', label: 'Accessibility', searchTerms: 'text size reduced motion high contrast screen reader', section: 'Experience' },
  // ── Connected services (normal product destination) ──
  { key: 'BotDirectory', label: 'Agents', searchTerms: 'agent assistant browse catalogue deploy permissions', section: 'Connected services', showSection: true },
  { key: 'AIAgentIntegration', label: 'Connections', searchTerms: 'openai anthropic claude gemini endpoint byok provider credentials api connections', section: 'Connected services' },
  { key: 'CustomBots', label: 'Your agents', searchTerms: 'custom agents created deployed manage draft published', section: 'Connected services' },
  // ── Help & legal (support, safety, terms, about) ──
  { key: 'HelpSupport', label: 'Help Centre', searchTerms: 'support faq contact', section: 'Help & legal', showSection: true },
  { key: 'About', label: 'About Thryftverse', searchTerms: 'version', section: 'Help & legal' },
  // ── Advanced (developer-only tools, not consumer features) ──
  { key: 'RuntimeSmokeTest', label: 'Runtime smoke test', searchTerms: 'diagnostic developer debug', section: 'Advanced', showSection: true },
];

export default function SettingsScreen({ navigation }: Props) {
  const logout = useStore((state) => state.logout);
  const currentUser = useStore((state) => state.currentUser);
  const twoFactorEnabled = useStore((state) => state.twoFactorEnabled);
  const savedPaymentMethod = useStore((state) => state.savedPaymentMethod);
  const savedAddress = useStore((state) => state.savedAddress);
  const blockedCount = useStore((s) => s.blockedUsers.length);
  const { show } = useToast();
  const { colors } = useAppTheme();
  const { t: ts } = useAppTranslation('settings');

  const {
    language: selectedLanguage,
    emailNotificationsEnabled,
    pushEnabledCount,
    pushTotalCount,
    setLanguage,
    analyticsOptOut,
    setAnalyticsOptOut,
    developerMode,
    biometricEnabled,
    setBiometricEnabled,
    biometricLoginEnabled,
    setBiometricLoginEnabled,
    autoTranslateMessages,
    setAutoTranslateMessages } = useSettingsPreferences();

  const [currencyPickerVisible, setCurrencyPickerVisible] = React.useState(false);
  const [themePickerVisible, setThemePickerVisible] = React.useState(false);
  const [languagePickerVisible, setLanguagePickerVisible] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [pushPermissionGranted, setPushPermissionGranted] = React.useState<boolean | null>(null);
  const [isTogglingPush, setIsTogglingPush] = React.useState(false);
  const [isHydrating, setIsHydrating] = React.useState(!useStore.persist.hasHydrated());

  // Probe biometric hardware availability so the toggle subtitle is truthful —
  // "Not available on this device" when the device has no enrolled biometric,
  // rather than showing a toggle that silently does nothing.
  const { isAvailable: isBiometricAvailable } = useBiometricGate();

  // Track persist-store hydration so the screen can show a skeleton until the
  // user/session data is available instead of flashing "Not signed in".
  React.useEffect(() => {
    if (useStore.persist.hasHydrated()) {
      setIsHydrating(false);
      return;
    }
    const unsub = useStore.persist.onFinishHydration(() => setIsHydrating(false));
    return unsub;
  }, []);

  // Read the current system push permission status on mount so the "Enable
  // notifications" toggle reflects the real OS-level state.
  React.useEffect(() => {
    let mounted = true;
    getPushPermissionStatus()
      .then((status) => {
        if (mounted) setPushPermissionGranted(status.status === 'granted');
      })
      .catch(() => {
        if (mounted) setPushPermissionGranted(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const { themePreference, setThemePreference } = useAppTheme();

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

  const handleOpenExternal = React.useCallback(
    async (url: string) => {
      try {
        await Linking.openURL(url);
      } catch {
        show(t('settings.toast.unableOpenLink'), 'error');
      }
    },
    [show]
  );

  const handleTogglePushPermission = React.useCallback(
    async (enable: boolean) => {
      if (enable) {
        setIsTogglingPush(true);
        try {
          // Reset the contextual "asked" flag so the Settings toggle is an
          // explicit, user-initiated re-enable that always prompts the OS.
          await resetPushPermissionAskedFlag('settings');
          const granted = await requestPushPermissionWithContext('settings');
          setPushPermissionGranted(granted);
          show(
            granted ? ts('toast.pushEnabled') : ts('toast.pushDenied'),
            granted ? 'success' : 'info',
          );
        } catch {
          show(ts('toast.pushUpdateFailed'), 'error');
        } finally {
          setIsTogglingPush(false);
        }
      } else {
        // The OS push permission cannot be revoked programmatically. Direct
        // the user to the system settings screen where they can disable it.
        show(ts('toast.pushManageDeviceSettings'), 'info');
        Linking.openSettings().catch(() => undefined);
      }
    },
    [show, ts],
  );

  const handleLogout = React.useCallback(async () => {
    await logoutFromSession();
    clearUserScopedQueryCache();
    logout();
    navigation.replace('AuthLanding');
  }, [logout, navigation]);

  const handleClearSearchHistory = React.useCallback(async () => {
    try {
      await AsyncStorage.removeItem('@thryftverse_recent_searches');
      show(ts('toast.searchHistoryCleared'), 'success');
    } catch {
      show(ts('toast.searchHistoryClearFailed'), 'error');
    }
  }, [show, ts]);

  const isSearching = searchQuery.trim().length > 0;
  const q = searchQuery.toLowerCase().trim();

  // ── Developer eligibility gate ──
  // The "Advanced" section is hidden from ordinary consumers.
  // It is revealed only when the user has enabled developer mode
  // (Settings → About → tap version 7 times). Per spec 18, developer mode
  // keeps only raw debugging tools — not consumer agent features, which now
  // live in the normal "Connected services" section above.
  const showAdvancedDeveloper = developerMode;

  const searchResults = React.useMemo(() => {
    if (!isSearching) return [];
    return ROUTE_METADATA.filter((d) => {
      // Hide Advanced routes from search when the section is gated.
      if (d.section === 'Advanced' && !showAdvancedDeveloper) return false;
      return (
        d.searchTerms.toLowerCase().includes(q) ||
        d.label.toLowerCase().includes(q) ||
        d.section.toLowerCase().includes(q)
      );
    });
  }, [isSearching, q, showAdvancedDeveloper]);

  const avatarUri = currentUser?.avatar || null;
  const displayName = currentUser?.displayName ?? currentUser?.username ?? 'Not signed in';
  const username = currentUser?.username ?? '';

  const notificationSummary = `${pushEnabledCount}/${pushTotalCount} categories`;

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
        <SettingsSection title={searchResults.length > 0 ? ts('search.results') : ts('search.allSettings')} noCard>
          {searchResults.length === 0 ? (
            <View style={styles.emptySearch}>
              <Text style={[styles.emptySearchText, { color: colors.textMuted }]}>
                {ts('search.noMatching')}
              </Text>
            </View>
          ) : (
            searchResults.map((dest, i) => (
              <SettingsRow
                key={`${dest.key}-${i}`}
                title={dest.label}
                subtitle={dest.section}
                onPress={() => {
                  setSearchQuery('');
                  (navigation.navigate as (key: keyof RootStackParamList) => void)(dest.key);
                }}
                isFirst={i === 0}
                isLast={i === searchResults.length - 1}
              />
            ))
          )}
        </SettingsSection>
      ) : (
        <>
          {/* ── IDENTITY — compact flat row, no card ── */}
          <FlatRow
            label={displayName}
            labelStyle={{ color: colors.textPrimary }}
            secondary={username ? `@${username}${currentUser?.email ? ` · ${currentUser.email}` : ''}` : (currentUser?.email ?? 'Not signed in')}
            imageUri={avatarUri ?? undefined}
            imageSize={48}
            imageRadius={24}
            onPress={() => navigation.navigate('EditProfile', {})}
            separator={false}
            accessibilityLabel={ts('accessibility.editProfileAccount')}
            accessibilityHint={ts('accessibility.editProfileAccountHint')}
            style={{ paddingVertical: Space.sm }}
          />

          {/* ── Verification prompt — shows when identity/seller verification
              is not yet complete. Email verification alone does not grant
              a trust badge (P0-UI-3). ── */}
          {!currentUser?.identityVerified && !currentUser?.sellerVerified ? (
            <SettingsRow
              glyph="verified-check"
              iconColor={colors.brand}
              title={ts('verification.promptTitle')}
              subtitle={ts('verification.promptSubtitle')}
              onPress={() => navigation.navigate('Verification')}
              accessibilityLabel={ts('accessibility.verifyIdentity')}
              accessibilityHint={ts('accessibility.verifyIdentityHint')}
            />
          ) : null}

          {/* ── ACCOUNT HEALTH INDICATOR — compact status pills ──
              Shows completed security steps at a glance. Each pill is a
              checkmark + label. Incomplete steps are omitted (not shown as
              red warnings — the verification prompt above handles that). */}
          {currentUser ? (
            <View style={styles.healthRow}>
              {currentUser.emailVerified ? (
                <View style={[styles.healthPill, { backgroundColor: colors.successSubtle }]}>
                  <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                  <Text style={[styles.healthPillText, { color: colors.success }]}>{ts('health.emailConfirmed')}</Text>
                </View>
              ) : null}
              {twoFactorEnabled ? (
                <View style={[styles.healthPill, { backgroundColor: colors.successSubtle }]}>
                  <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                  <Text style={[styles.healthPillText, { color: colors.success }]}>{ts('health.twoFA')}</Text>
                </View>
              ) : null}
              {biometricEnabled ? (
                <View style={[styles.healthPill, { backgroundColor: colors.successSubtle }]}>
                  <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                  <Text style={[styles.healthPillText, { color: colors.success }]}>{ts('health.biometric')}</Text>
                </View>
              ) : null}
              {savedPaymentMethod ? (
                <View style={[styles.healthPill, { backgroundColor: colors.successSubtle }]}>
                  <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                  <Text style={[styles.healthPillText, { color: colors.success }]}>{ts('health.payment')}</Text>
                </View>
              ) : null}
              {savedAddress ? (
                <View style={[styles.healthPill, { backgroundColor: colors.successSubtle }]}>
                  <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                  <Text style={[styles.healthPillText, { color: colors.success }]}>{ts('health.address')}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* ── YOUR ACCOUNT (profile, security, privacy) ── */}
          <SettingsSection title={ts('sections.yourAccount')}>
            <SettingsRow
              glyph="verified-check"
              iconColor={currentUser?.identityVerified || currentUser?.sellerVerified ? colors.success : colors.textMuted}
              titleStyle={currentUser?.identityVerified || currentUser?.sellerVerified ? { color: colors.success } : undefined}
              title={ts('rows.verification')}
              subtitle={currentUser?.sellerVerified ? ts('verification.trustedSeller') : currentUser?.identityVerified ? ts('verification.idVerified') : ts('verification.getBadge')}
              onPress={() => navigation.navigate('Verification')}
              isFirst
            />
            <SettingsRow
              glyph="security-lock"
              title={ts('rows.changePassword')}
              subtitle={twoFactorEnabled ? ts('rows.twoFAEnabled') : ts('rows.passwordOnly')}
              onPress={() => navigation.navigate('ChangePassword')}
            />
            <SettingsRow
              glyph="security-lock"
              title={ts('rows.biometricLock')}
              subtitle={
                !isBiometricAvailable
                  ? ts('rows.biometricNotAvailable')
                  : biometricEnabled
                    ? ts('rows.biometricEnabled')
                    : ts('rows.biometricDisabled')
              }
              toggleValue={biometricEnabled && isBiometricAvailable}
              onToggle={(v) => setBiometricEnabled(v)}
              disabled={!isBiometricAvailable}
            />
            <SettingsRow
              glyph="security-lock"
              title={ts('rows.biometricLogin')}
              subtitle={
                !isBiometricAvailable
                  ? ts('rows.biometricNotAvailable')
                  : biometricLoginEnabled
                    ? ts('rows.biometricLoginEnabled')
                    : ts('rows.biometricLoginDisabled')
              }
              toggleValue={biometricLoginEnabled && isBiometricAvailable}
              onToggle={(v) => setBiometricLoginEnabled(v)}
              disabled={!isBiometricAvailable}
            />
            <SettingsRow
              glyph="connection-link"
              title={ts('rows.connectedAccounts')}
              subtitle={ts('rows.connectedAccountsSubtitle')}
              onPress={() => navigation.navigate('ConnectedAccounts')}
            />
            <SettingsRow
              glyph="history-clock"
              title={ts('rows.devicesSessions')}
              onPress={() => navigation.navigate('ActiveSessions')}
            />
            <SettingsRow
              glyph="security-lock"
              title={ts('rows.accountControl')}
              subtitle={ts('rows.accountControlSubtitle')}
              onPress={() => navigation.navigate('AccountControl')}
            />
            <SettingsRow
              icon="download"
              title={ts('rows.downloadData')}
              subtitle={ts('rows.downloadDataSubtitle')}
              onPress={() => navigation.navigate('DataExport')}
            />
            <SettingsRow
              icon="eye"
              title={ts('rows.privacySafety')}
              subtitle={ts('rows.privacySafetySubtitle')}
              onPress={() => navigation.navigate('PrivacySettings')}
            />
            <SettingsRow
              icon="chat"
              title={ts('rows.chatPrivacy')}
              subtitle={ts('rows.chatPrivacySubtitle')}
              onPress={() => navigation.navigate('ChatSettings')}
            />
            <SettingsRow
              glyph="language-globe"
              title={ts('rows.autoTranslate')}
              subtitle={
                autoTranslateMessages
                  ? ts('rows.autoTranslateEnabled')
                  : ts('rows.autoTranslateDisabled')
              }
              toggleValue={autoTranslateMessages}
              onToggle={(v) => setAutoTranslateMessages(v)}
            />
            <SettingsRow
              glyph="security-lock"
              title={ts('rows.dataPrivacy')}
              subtitle={ts('rows.dataPrivacySubtitle')}
              onPress={() => navigation.navigate('DataPrivacy')}
            />
            <SettingsRow
              icon="ban"
              title={ts('rows.blockedUsers')}
              subtitle={blockedCount > 0 ? `${blockedCount} blocked` : 'None'}
              onPress={() => navigation.navigate('BlockedUsers')}
              isLast
            />
          </SettingsSection>
    
          {/* ── BUYING & SELLING (payments, payouts, orders, co-own, disputes) ── */}
          <SettingsSection title={ts('sections.buyingSelling')}>
            <SettingsRow
              icon="location"
              title={ts('rows.savedAddresses')}
              subtitle={savedAddress ? ts('rows.oneSaved') : ts('rows.noneSaved')}
              onPress={() => navigation.navigate('SavedAddresses')}
              isFirst
            />
            <SettingsRow
              icon="card"
              title={ts('rows.paymentMethods')}
              subtitle={savedPaymentMethod ? savedPaymentMethod.label : ts('rows.noneSaved')}
              onPress={() => navigation.navigate('Payments')}
            />
            <SettingsRow
              icon="bookmark"
              title={ts('rows.savedCollections')}
              onPress={() => navigation.navigate('Closet')}
            />
            <SettingsRow
              icon="wallet"
              title={ts('rows.payoutAccount')}
              subtitle={ts('rows.payoutAccountSubtitle')}
              onPress={() => navigation.navigate('Wallet')}
            />
            <SettingsRow
              icon="receipt"
              title={ts('rows.payoutHistory')}
              onPress={() => navigation.navigate('BalanceHistory')}
            />
            <SettingsRow
              icon="box"
              title={ts('rows.shippingPreferences')}
              onPress={() => navigation.navigate('Postage')}
            />
            <SettingsRow
              icon="notifications"
              title={ts('rows.priceAlerts')}
              subtitle={ts('rows.priceAlertsSubtitle')}
              onPress={() => navigation.navigate('CoOwnPriceAlerts')}
            />
            <SettingsRow
              icon="repeat"
              title={ts('rows.autoInvestPlans')}
              subtitle={ts('rows.autoInvestPlansSubtitle')}
              onPress={() => navigation.navigate('CoOwnRecurringOrders')}
            />
            <SettingsRow
              icon="document"
              title={ts('rows.taxDocuments')}
              subtitle={ts('rows.taxDocumentsSubtitle')}
              onPress={() => navigation.navigate('CoOwnTaxDocuments')}
            />
            <SettingsRow
              icon="folder"
              title={ts('rows.resolutionCentre')}
              subtitle={ts('rows.resolutionCentreSubtitle')}
              onPress={() => navigation.navigate('ResolutionCentre')}
              isLast
            />
          </SettingsSection>
    
          {/* ── NOTIFICATIONS ── */}
          <SettingsSection title={ts('sections.notifications')}>
            <SettingsRow
              icon="notifications"
              title={ts('rows.enableNotifications')}
              subtitle={pushPermissionGranted === null ? ts('rows.permissionUnknown') : pushPermissionGranted ? ts('rows.permissionAllowed') : ts('rows.permissionNotAllowed')}
              toggleValue={pushPermissionGranted === true}
              onToggle={(v) => void handleTogglePushPermission(v)}
              disabled={isTogglingPush}
              isFirst
            />
            <SettingsRow
              icon="notifications"
              title={ts('rows.notificationCategories')}
              subtitle={notificationSummary}
              onPress={() => navigation.navigate('PushNotifications')}
            />
            <SettingsRow
              icon="options"
              title={ts('rows.notificationPreferences')}
              subtitle={ts('rows.notificationPreferencesSubtitle')}
              onPress={() => navigation.navigate('NotificationPreferences')}
            />
            <SettingsRow
              icon="mail"
              title={ts('rows.emailPreferences')}
              subtitle={emailNotificationsEnabled ? 'On' : 'Off'}
              onPress={() => navigation.navigate('EmailNotifications')}
              isLast
            />
          </SettingsSection>
    
          {/* ── EXPERIENCE (appearance, language, currency, accessibility, recommendations) ── */}
          <SettingsSection title={ts('sections.experience')}>
            <SettingsRow
              glyph="theme-palette"
              title={ts('rows.theme')}
              value={getThemePreferenceLabel(themePreference)}
              onPress={() => setThemePickerVisible(true)}
              isFirst
            />
            <SettingsRow
              icon="repeat"
              title={ts('rows.currencyDisplay')}
              value={displayModeLabel}
              onPress={cycleDisplayMode}
            />
            <SettingsRow
              glyph="currency-local"
              title={ts('rows.localCurrency')}
              value={`${currencyCode} (${CURRENCIES[currencyCode].symbol})`}
              onPress={() => setCurrencyPickerVisible(true)}
            />
            <SettingsRow
              glyph="language-globe"
              title={ts('rows.language')}
              value={getLanguageEndonym(selectedLanguage)}
              onPress={() => setLanguagePickerVisible(true)}
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
              onPress={() => void handleClearSearchHistory()}
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
    
          {/* ── CONNECTED SERVICES ── */}
          {/* Per spec 18: Agents are a normal product destination, not hidden
              behind developer mode. Create Agent is intentionally excluded from
              Settings — it lives in the Agents home and profile menu. */}
          <SettingsSection title={ts('sections.connectedServices')}>
            <SettingsRow
              icon="people"
              title={ts('rows.agents')}
              subtitle={ts('rows.agentsSubtitle')}
              onPress={() => navigation.navigate('BotDirectory')}
              isFirst
            />
            <SettingsRow
              icon="key"
              title={ts('rows.connections')}
              subtitle={ts('rows.connectionsSubtitle')}
              onPress={() => navigation.navigate('AIAgentIntegration')}
            />
            <SettingsRow
              icon="profile"
              title={ts('rows.yourAgents')}
              subtitle={ts('rows.yourAgentsSubtitle')}
              onPress={() => navigation.navigate('CustomBots')}
              isLast
            />
          </SettingsSection>
    
          {/* ── HELP & LEGAL (support, safety, terms, about) ── */}
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
              onPress={() => void handleOpenExternal('https://thryftverse.app/terms')}
            />
            <SettingsRow
              glyph="privacy-document"
              title={ts('rows.privacyPolicy')}
              onPress={() => void handleOpenExternal('https://thryftverse.app/privacy')}
            />
            <SettingsRow
              icon="info"
              title={ts('rows.aboutThryftverse')}
              value="v1.0.0"
              onPress={() => navigation.navigate('About')}
              isLast
            />
          </SettingsSection>
    
          {/* ── ADVANCED (developer-only) ── */}
          {/* Per spec 18: Developer mode keeps only raw debugging tools — not
              consumer agent features, which now live in "Connected services"
              above. Gated behind developer mode (Settings → About → tap version
              7 times) so ordinary consumers never see implementation technology. */}
          {showAdvancedDeveloper ? (
            <SettingsSection title={ts('sections.advanced')}>
              <SettingsRow
                icon="terminal-outline"
                title={ts('rows.runtimeSmokeTest')}
                subtitle={ts('rows.runtimeSmokeTestSubtitle')}
                onPress={() => navigation.navigate('RuntimeSmokeTest')}
                isFirst
              />
              <SettingsRow
                icon="flag-outline"
                title={ts('rows.featureFlags')}
                subtitle={ts('rows.featureFlagsSubtitle')}
                onPress={() => navigation.navigate('RuntimeSmokeTest')}
                isLast
              />
            </SettingsSection>
          ) : null}

          {/* Feature flag debug view — read-only flag status for QA teams.
              Shown only when developer mode is enabled (Advanced section). */}
          {showAdvancedDeveloper ? <FeatureFlagDebugSection /> : null}
    
          {/* ── DESTRUCTIVE ACTIONS — separate group at the bottom ── */}
          {/* Per AGENTS.md §4 and App Store 5.1.1(v): destructive actions sit
              at the bottom of the settings list, separated from benign rows.
              Sign Out and Delete Account are grouped together with danger color. */}
          <SettingsSection title={ts('sections.account')}>
            <SettingsSignOutRow
              username={currentUser?.username}
              onSignOut={handleLogout}
            />
            <SettingsRow
              icon="trash-outline"
              title={ts('rows.deleteAccount')}
              subtitle={ts('rows.deleteAccountSubtitle')}
              danger
              onPress={() => navigation.navigate('DeleteAccount')}
              isLast
              accessibilityLabel={ts('rows.deleteAccount')}
              accessibilityHint={ts('accessibility.deleteAccountHint')}
            />
          </SettingsSection>
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
    </View>
  );
}

const styles = StyleSheet.create({
  searchField: {
    height: 48 },
  // ── Search empty state ──
  emptySearch: {
    paddingVertical: Space.lg,
    alignItems: 'center' },
  emptySearchText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular },
  // ── Account health indicator ──
  healthRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    marginBottom: Space.sm },
  healthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xxs + 1,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xxs + 1,
    borderRadius: Radius.full },
  healthPillText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing } });
