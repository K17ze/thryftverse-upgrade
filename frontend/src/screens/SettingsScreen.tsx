import React from 'react';
import { Linking, View, Text, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { logoutFromSession } from '../services/authApi';
import { clearUserScopedQueryCache } from '../platform/server';
import { CURRENCIES, SupportedCurrencyCode } from '../constants/currencies';
import { useCurrencyPref } from '../hooks/useCurrencyPref';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { useToast } from '../context/ToastContext';
import {
  LANGUAGE_OPTIONS,
  SupportedLanguageOption,
} from '../preferences/settingsPreferences';
import { useSettingsPreferences } from '../context/SettingsPreferencesContext';
import {
  getPushPermissionStatus,
  requestPushPermissionWithContext,
  resetPushPermissionAskedFlag,
} from '../lib/pushPermission';
import {
  getThemePreferenceLabel,
  ThemePreference,
  updateThemePreference,
} from '../theme/themePreference';
import { useAppTheme } from '../theme/ThemeContext';
import { t } from '../i18n';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { AppSearchBar } from '../components/ui/AppSearchBar';
import { FlatRow } from '../components/ui/FlatRow';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SettingsSignOutRow } from '../components/settings/SettingsSignOutRow';
import { SettingsListSkeleton } from '../components/skeletons/SettingsListSkeleton';

import { Space, FontFamily } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

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
  { key: 'Personalisation', label: 'Content preferences', searchTerms: 'theme currency language feed personalisation appearance', section: 'Experience', showSection: true },
  { key: 'AIPreferences', label: 'Recommendations', searchTerms: 'listing suggestions photo enhancement title price autocomplete sell recommendations', section: 'Experience' },
  { key: 'YourAlgorithm', label: 'Your feed', searchTerms: 'feed recommendations topics signals transparency algorithm', section: 'Experience' },
  { key: 'SustainabilityPreferences', label: 'Sustainability', searchTerms: 'carbon neutral packaging badges eco secondhand', section: 'Experience' },
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

  const {
    language: selectedLanguage,
    emailNotificationsEnabled,
    pushEnabledCount,
    pushTotalCount,
    setLanguage,
    analyticsOptOut,
    setAnalyticsOptOut,
    developerMode,
  } = useSettingsPreferences();

  const [currencyPickerVisible, setCurrencyPickerVisible] = React.useState(false);
  const [themePickerVisible, setThemePickerVisible] = React.useState(false);
  const [languagePickerVisible, setLanguagePickerVisible] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [pushPermissionGranted, setPushPermissionGranted] = React.useState<boolean | null>(null);
  const [isTogglingPush, setIsTogglingPush] = React.useState(false);
  const [isHydrating, setIsHydrating] = React.useState(!useStore.persist.hasHydrated());

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
    cycleDisplayMode,
  } = useCurrencyPref();

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

  const themeOptions = React.useMemo(() => ['System', 'Light', 'Dark'], []);
  const languageOptions = React.useMemo(() => [...LANGUAGE_OPTIONS], []);

  const selectedThemeOption = React.useMemo(
    () => themeOptions.find((option) => option.toLowerCase() === themePreference),
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
    const nextPreference = option.toLowerCase() as ThemePreference;
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
            granted ? 'Push notifications enabled' : 'Push notifications were denied. Enable them in device settings.',
            granted ? 'success' : 'info',
          );
        } catch {
          show('Unable to update push notification permission.', 'error');
        } finally {
          setIsTogglingPush(false);
        }
      } else {
        // The OS push permission cannot be revoked programmatically. Direct
        // the user to the system settings screen where they can disable it.
        show('Manage push notifications in your device settings.', 'info');
        Linking.openSettings().catch(() => undefined);
      }
    },
    [show],
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
      show('Search history cleared', 'success');
    } catch {
      show('Unable to clear search history', 'error');
    }
  }, [show]);

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
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Settings"
          onBack={() => navigation.goBack()}
        />
      }
    >
      {/* ── INLINE SEARCH — filters settings in-place ── */}
      <View style={{ marginBottom: Space.md }}>
        <AppSearchBar
          placeholder="Search settings"
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
        <SettingsSection title={searchResults.length > 0 ? 'Results' : 'All settings'} noCard>
          {searchResults.length === 0 ? (
            <View style={styles.emptySearch}>
              <Text style={[styles.emptySearchText, { color: colors.textMuted }]}>
                No matching settings
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
            accessibilityLabel="Edit profile and account"
            accessibilityHint="Opens profile, private details, security and account editor"
            style={{ paddingVertical: Space.sm }}
          />

          {/* ── Verification prompt — genuine account problem, flat row ── */}
          {!currentUser?.emailVerified ? (
            <FlatRow
              icon="shield-checkmark-outline"
              iconColor={colors.brand}
              label="Verify your identity"
              secondary="Get the verified badge and unlock selling"
              onPress={() => navigation.navigate('Verification')}
              separatorInset={false}
              accessibilityLabel="Verify identity"
              accessibilityHint="Opens identity verification"
            />
          ) : null}

          {/* ── YOUR ACCOUNT (profile, security, privacy) ── */}
          <SettingsSection title="Your account" icon="person-circle-outline" noCard>
            <SettingsRow
              icon="shield-checkmark-outline"
              iconColor={currentUser?.emailVerified ? colors.success : colors.textMuted}
              titleStyle={currentUser?.emailVerified ? { color: colors.success } : undefined}
              title="Verification"
              subtitle={currentUser?.emailVerified ? 'Verified' : 'Get the verified badge'}
              onPress={() => navigation.navigate('Verification')}
              isFirst
            />
            <SettingsRow
              icon="key-outline"
              title="Change password"
              subtitle={twoFactorEnabled ? '2FA enabled' : 'Password only'}
              onPress={() => navigation.navigate('ChangePassword')}
            />
            <SettingsRow
              icon="link-outline"
              title="Connected accounts"
              subtitle="Google, Apple sign-in"
              onPress={() => navigation.navigate('ConnectedAccounts')}
            />
            <SettingsRow
              icon="phone-portrait-outline"
              title="Devices & sessions"
              onPress={() => navigation.navigate('ActiveSessions')}
            />
            <SettingsRow
              icon="shield-outline"
              title="Account control"
              subtitle="Security, sessions, password"
              onPress={() => navigation.navigate('AccountControl')}
            />
            <SettingsRow
              icon="download-outline"
              title="Download my data"
              subtitle="Export your account data"
              onPress={() => navigation.navigate('DataExport')}
            />
            <SettingsRow
              icon="eye-outline"
              title="Privacy & safety"
              subtitle="Visibility, blocked users"
              onPress={() => navigation.navigate('PrivacySettings')}
            />
            <SettingsRow
              icon="chatbubble-outline"
              title="Chat privacy"
              subtitle="Who can message you"
              onPress={() => navigation.navigate('ChatSettings')}
            />
            <SettingsRow
              icon="lock-closed-outline"
              title="Data & privacy"
              subtitle="Privacy controls and retention"
              onPress={() => navigation.navigate('DataPrivacy')}
            />
            <SettingsRow
              icon="ban-outline"
              title="Blocked users"
              subtitle={blockedCount > 0 ? `${blockedCount} blocked` : 'None'}
              onPress={() => navigation.navigate('BlockedUsers')}
              isLast
            />
          </SettingsSection>
    
          {/* ── BUYING & SELLING (payments, payouts, orders, co-own, disputes) ── */}
          <SettingsSection title="Buying & selling" icon="bag-outline" noCard>
            <SettingsRow
              icon="location-outline"
              title="Saved addresses"
              subtitle={savedAddress ? '1 saved' : 'None saved'}
              onPress={() => navigation.navigate('SavedAddresses')}
              isFirst
            />
            <SettingsRow
              icon="card-outline"
              title="Payment methods"
              subtitle={savedPaymentMethod ? savedPaymentMethod.label : 'None saved'}
              onPress={() => navigation.navigate('Payments')}
            />
            <SettingsRow
              icon="heart-outline"
              title="Saved & collections"
              onPress={() => navigation.navigate('Closet')}
            />
            <SettingsRow
              icon="wallet-outline"
              title="Payout account"
              subtitle="Balance and wallet"
              onPress={() => navigation.navigate('Wallet')}
            />
            <SettingsRow
              icon="cash-outline"
              title="Payout history"
              onPress={() => navigation.navigate('BalanceHistory')}
            />
            <SettingsRow
              icon="cube-outline"
              title="Shipping preferences"
              onPress={() => navigation.navigate('Postage')}
            />
            <SettingsRow
              icon="notifications-outline"
              title="Price alerts"
              subtitle="Notify on price thresholds"
              onPress={() => navigation.navigate('CoOwnPriceAlerts')}
            />
            <SettingsRow
              icon="repeat-outline"
              title="Auto-invest plans"
              subtitle="Recurring buy schedules"
              onPress={() => navigation.navigate('CoOwnRecurringOrders')}
            />
            <SettingsRow
              icon="document-text-outline"
              title="Tax documents"
              subtitle="Annual statements & P&L"
              onPress={() => navigation.navigate('CoOwnTaxDocuments')}
            />
            <SettingsRow
              icon="folder-open-outline"
              title="Resolution Centre"
              subtitle="Disputes and resolutions"
              onPress={() => navigation.navigate('ResolutionCentre')}
              isLast
            />
          </SettingsSection>
    
          {/* ── NOTIFICATIONS ── */}
          <SettingsSection title="Notifications" icon="notifications-outline" noCard>
            <SettingsRow
              icon="notifications"
              title="Enable notifications"
              subtitle={pushPermissionGranted === null ? 'Permission unknown' : pushPermissionGranted ? 'Allowed' : 'Not allowed'}
              toggleValue={pushPermissionGranted === true}
              onToggle={(v) => void handleTogglePushPermission(v)}
              disabled={isTogglingPush}
              isFirst
            />
            <SettingsRow
              icon="notifications-outline"
              title="Notification categories"
              subtitle={notificationSummary}
              onPress={() => navigation.navigate('PushNotifications')}
            />
            <SettingsRow
              icon="options-outline"
              title="Notification preferences"
              subtitle="Quiet hours, preview"
              onPress={() => navigation.navigate('NotificationPreferences')}
            />
            <SettingsRow
              icon="mail-outline"
              title="Email preferences"
              subtitle={emailNotificationsEnabled ? 'On' : 'Off'}
              onPress={() => navigation.navigate('EmailNotifications')}
              isLast
            />
          </SettingsSection>
    
          {/* ── EXPERIENCE (appearance, language, currency, accessibility, recommendations) ── */}
          <SettingsSection title="Experience" icon="color-palette-outline" noCard>
            <SettingsRow
              icon="color-palette-outline"
              title="Theme"
              value={getThemePreferenceLabel(themePreference)}
              onPress={() => setThemePickerVisible(true)}
              isFirst
            />
            <SettingsRow
              icon="swap-horizontal-outline"
              title="Currency display"
              value={displayModeLabel}
              onPress={cycleDisplayMode}
            />
            <SettingsRow
              icon="globe-outline"
              title="Local currency"
              value={`${currencyCode} (${CURRENCIES[currencyCode].symbol})`}
              onPress={() => setCurrencyPickerVisible(true)}
            />
            <SettingsRow
              icon="language-outline"
              title="Language"
              value={selectedLanguage}
              onPress={() => setLanguagePickerVisible(true)}
            />
            <SettingsRow
              icon="options-outline"
              title="Content preferences"
              subtitle="Feed and recommendations"
              onPress={() => navigation.navigate('Personalisation')}
            />
            <SettingsRow
              icon="bulb-outline"
              title="Recommendations"
              subtitle="Photo enhancement, title and price suggestions"
              onPress={() => navigation.navigate('AIPreferences')}
            />
            <SettingsRow
              icon="analytics-outline"
              title="Your feed"
              subtitle="Recommendations and transparency"
              onPress={() => navigation.navigate('YourAlgorithm')}
            />
            <SettingsRow
              icon="leaf-outline"
              title="Sustainability"
              subtitle="Goals, shipping, impact"
              onPress={() => navigation.navigate('SustainabilityPreferences')}
            />
            <SettingsRow
              icon="accessibility-outline"
              title="Accessibility"
              subtitle="Text size, motion, contrast"
              onPress={() => navigation.navigate('AccessibilitySettings')}
            />
            <SettingsRow
              icon="time-outline"
              title="Search history"
              subtitle="Clear recent searches"
              onPress={() => void handleClearSearchHistory()}
            />
            <SettingsRow
              icon="analytics-outline"
              title="Data sharing"
              subtitle="Analytics and personalization"
              toggleValue={!analyticsOptOut}
              onToggle={(v) => setAnalyticsOptOut(!v)}
              isLast
            />
          </SettingsSection>
    
          {/* ── CONNECTED SERVICES ── */}
          {/* Per spec 18: Agents are a normal product destination, not hidden
              behind developer mode. Create Agent is intentionally excluded from
              Settings — it lives in the Agents home and profile menu. */}
          <SettingsSection title="Connected services" icon="hardware-chip-outline" noCard>
            <SettingsRow
              icon="people-outline"
              title="Agents"
              subtitle="Browse and manage agent permissions"
              onPress={() => navigation.navigate('BotDirectory')}
              isFirst
            />
            <SettingsRow
              icon="key-outline"
              title="Connections"
              subtitle="Provider keys and endpoints"
              onPress={() => navigation.navigate('AIAgentIntegration')}
            />
            <SettingsRow
              icon="person-circle-outline"
              title="Your agents"
              subtitle="Agents you have created"
              onPress={() => navigation.navigate('CustomBots')}
              isLast
            />
          </SettingsSection>
    
          {/* ── HELP & LEGAL (support, safety, terms, about) ── */}
          <SettingsSection title="Help & legal" icon="help-circle-outline" noCard>

            <SettingsRow
              icon="help-circle-outline"
              title="Help Centre"
              onPress={() => navigation.navigate('HelpSupport')}
              isFirst
            />
            <SettingsRow
              icon="document-text-outline"
              title="Terms of Service"
              onPress={() => void handleOpenExternal('https://thryftverse.app/terms')}
            />
            <SettingsRow
              icon="shield-checkmark-outline"
              title="Privacy Policy"
              onPress={() => void handleOpenExternal('https://thryftverse.app/privacy')}
            />
            <SettingsRow
              icon="information-circle-outline"
              title="About Thryftverse"
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
            <SettingsSection title="Advanced" icon="code-working-outline" noCard>
              <SettingsRow
                icon="terminal-outline"
                title="Runtime smoke test"
                subtitle="Diagnostic checks for local runtime"
                onPress={() => navigation.navigate('RuntimeSmokeTest')}
                isFirst
                isLast
              />
            </SettingsSection>
          ) : null}
    
          {/* ── SIGN OUT ── */}
          {/* Sign Out action is rendered via SettingsSignOutRow for destructive separation */}
          <View style={{ marginTop: Space.lg, marginBottom: Space.md }}>
            <SettingsSignOutRow username={currentUser?.username} onSignOut={handleLogout} />
          </View>

          {/* ── DELETE ACCOUNT — destructive zone, separated from benign rows ── */}
          {/* Per AGENTS.md §4 and App Store 5.1.1(v): destructive actions sit
              at the bottom of the settings list, separated from benign rows by
              a section break. The label is verbatim "Delete account". */}
          <SettingsSection title="Account" noCard>
            <SettingsRow
              icon="trash-outline"
              title="Delete account"
              subtitle="Permanently erase your account"
              danger
              onPress={() => navigation.navigate('DeleteAccount')}
              isFirst
              isLast
            />
          </SettingsSection>
          </>
      )}

      <BottomSheetPicker
        visible={currencyPickerVisible}
        onClose={() => setCurrencyPickerVisible(false)}
        title={t('settings.picker.currencyTitle')}
        options={currencyOptions}
        selectedValue={selectedCurrencyOption}
        onSelect={handleCurrencySelect}
        searchable
      />

      <BottomSheetPicker
        visible={languagePickerVisible}
        onClose={() => setLanguagePickerVisible(false)}
        title={t('settings.picker.languageTitle')}
        options={languageOptions}
        selectedValue={selectedLanguage}
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
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  searchField: {
    height: 48,
  },
  // ── Search empty state ──
  emptySearch: {
    paddingVertical: Space.lg,
    alignItems: 'center',
  },
  emptySearchText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
  },
});
