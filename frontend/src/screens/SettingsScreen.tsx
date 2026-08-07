import React from 'react';
import { Linking, View, Text, StyleSheet, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
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
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SettingsSignOutRow } from '../components/settings/SettingsSignOutRow';
import { SettingsListSkeleton } from '../components/skeletons/SettingsListSkeleton';
import { useAppTheme as useTheme } from '../theme/ThemeContext';

import { Space, Radius, Type, Elevation, Typography, Control } from '../theme/designTokens';
type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

interface DestinationMeta {
  key: keyof RootStackParamList;
  label: string;
  searchTerms: string;
  section: string;
  showSection?: boolean;
}

// Route metadata for search — each entry maps a settings destination to searchable terms
const ROUTE_METADATA: DestinationMeta[] = [
  { key: 'EditProfile', label: 'Edit profile & account', searchTerms: 'edit profile avatar name bio username email phone private details security account two factor password', section: 'Account', showSection: true },
  { key: 'Verification', label: 'Verification & KYC', searchTerms: 'verification kyc identity dac7 tax badge verified seller trust', section: 'Account', showSection: true },
  { key: 'AccountControl', label: 'Account control', searchTerms: 'account control delete deactivate download data export', section: 'Account', showSection: true },
  { key: 'DataExport', label: 'Download my data', searchTerms: 'download data export gdpr privacy account', section: 'Account' },
  { key: 'DeleteAccount', label: 'Delete account', searchTerms: 'delete account permanently erase gdpr remove', section: 'Account' },
  { key: 'SavedAddresses', label: 'Saved addresses', searchTerms: 'saved addresses delivery shipping address buying', section: 'Buying', showSection: true },
  { key: 'Payments', label: 'Payment methods', searchTerms: 'payment methods card bank buying', section: 'Buying', showSection: true },
  { key: 'Closet', label: 'Saved & collections', searchTerms: 'closet saved wishlist collections buying', section: 'Buying', showSection: true },
  { key: 'Wallet', label: 'Payout account', searchTerms: 'wallet balance payout selling', section: 'Selling & payouts', showSection: true },
  { key: 'BalanceHistory', label: 'Payout history', searchTerms: 'balance history payouts selling', section: 'Selling & payouts', showSection: true },
  { key: 'Postage', label: 'Shipping preferences', searchTerms: 'postage shipping preferences carrier selling', section: 'Selling & payouts', showSection: true },
  { key: 'PrivacySettings', label: 'Privacy & safety', searchTerms: 'privacy controls visibility safety blocked', section: 'Privacy & safety', showSection: true },
  { key: 'ChatSettings', label: 'Messages & notifications', searchTerms: 'messages chat notifications messaging', section: 'Messages & notifications', showSection: true },
  { key: 'Personalisation', label: 'Personalisation & appearance', searchTerms: 'personalisation feed preferences theme currency language appearance', section: 'Personalisation & appearance', showSection: true },
  { key: 'PushNotifications', label: 'Notification categories', searchTerms: 'push notifications alerts categories', section: 'Messages & notifications', showSection: true },
  { key: 'EmailNotifications', label: 'Email preferences', searchTerms: 'email notifications preferences categories', section: 'Messages & notifications' },
  { key: 'ConnectedAccounts', label: 'Connected accounts', searchTerms: 'connected accounts google apple oauth social login', section: 'Security', showSection: true },
  { key: 'AccessibilitySettings', label: 'Accessibility', searchTerms: 'accessibility text size reduced motion high contrast screen reader', section: 'Personalisation & appearance' },
  { key: 'AIPreferences', label: 'AI Preferences', searchTerms: 'ai preferences artificial intelligence listing suggestions photo enhancement autocomplete chat agents smart sell confidence algorithm personalisation', section: 'AI & Agents', showSection: true },
  { key: 'AIAgentIntegration', label: 'AI API Integration', searchTerms: 'ai api integration openai anthropic claude gemini custom endpoint api key bring your own key byok provider credentials', section: 'AI & Agents' },
  { key: 'BotDirectory', label: 'Agent Directory', searchTerms: 'bot directory agents ai assistant browse catalogue system agents deploy', section: 'AI & Agents' },
  { key: 'CustomBots', label: 'My Agents', searchTerms: 'custom bots my agents created deployed manage draft published', section: 'AI & Agents' },
  { key: 'BotBuilder', label: 'Create Agent', searchTerms: 'bot builder create agent ai assistant custom automation instructions model trigger', section: 'AI & Agents' },
  { key: 'YourAlgorithm', label: 'Your Algorithm', searchTerms: 'algorithm feed recommendations topics signals transparency personalisation ai agents', section: 'AI & Agents' },
  { key: 'SustainabilityPreferences', label: 'Sustainability', searchTerms: 'sustainability carbon neutral shipping packaging badges impact local secondhand goals eco', section: 'Preferences' },
  { key: 'DataPrivacy', label: 'Data & Privacy', searchTerms: 'data privacy gdpr download delete retention third party sharing cookies controls', section: 'Account' },
  { key: 'NotificationPreferences', label: 'Notification preferences', searchTerms: 'notification preferences push offers messages listings orders live shopping price drop marketing quiet hours preview', section: 'Messages & notifications' },
  { key: 'CoOwnPriceAlerts', label: 'Co-Own price alerts', searchTerms: 'co-own price alerts notifications syndicate', section: 'Co-Own', showSection: true },
  { key: 'CoOwnRecurringOrders', label: 'Auto-invest plans', searchTerms: 'co-own recurring orders auto invest syndicate', section: 'Co-Own' },
  { key: 'CoOwnTaxDocuments', label: 'Tax documents', searchTerms: 'co-own tax documents statements cgt syndicate', section: 'Co-Own' },
  { key: 'HelpSupport', label: 'Help', searchTerms: 'help support faq contact', section: 'Help', showSection: true },
  { key: 'About', label: 'About Thryftverse', searchTerms: 'about version', section: 'Help', showSection: true },
];

export default function SettingsScreen({ navigation }: Props) {
  const logout = useStore((state) => state.logout);
  const currentUser = useStore((state) => state.currentUser);
  const twoFactorEnabled = useStore((state) => state.twoFactorEnabled);
  const savedPaymentMethod = useStore((state) => state.savedPaymentMethod);
  const savedAddress = useStore((state) => state.savedAddress);
  const blockedCount = useStore((s) => s.blockedUsers.length);
  const { show } = useToast();
  const { colors } = useTheme();

  const {
    language: selectedLanguage,
    emailNotificationsEnabled,
    pushEnabledCount,
    pushTotalCount,
    setLanguage,
    analyticsOptOut,
    setAnalyticsOptOut,
  } = useSettingsPreferences();

  const [currencyPickerVisible, setCurrencyPickerVisible] = React.useState(false);
  const [themePickerVisible, setThemePickerVisible] = React.useState(false);
  const [languagePickerVisible, setLanguagePickerVisible] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchVisible, setSearchVisible] = React.useState(false);
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
            granted ? 'Push notifications enabled' : 'Push notifications were denied. You can enable them in device settings.',
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

  const searchResults = React.useMemo(() => {
    if (!isSearching) return [];
    return ROUTE_METADATA.filter((d) =>
      d.searchTerms.toLowerCase().includes(q) ||
      d.label.toLowerCase().includes(q) ||
      d.section.toLowerCase().includes(q)
    );
  }, [isSearching, q]);

  const avatarUri = currentUser?.avatar || null;
  const displayName = currentUser?.displayName ?? currentUser?.username ?? 'Not signed in';
  const username = currentUser?.username ?? '';

  const verificationBadges: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; color: string; verified: boolean }[] = [];
  if (currentUser?.emailVerified) {
    verificationBadges.push({ icon: 'mail', label: 'Email verified', color: colors.success, verified: true });
  } else {
    verificationBadges.push({ icon: 'mail-outline', label: 'Email not verified', color: colors.textMuted, verified: false });
  }
  if (currentUser?.phone) {
    verificationBadges.push({ icon: 'call', label: 'Phone added', color: colors.success, verified: true });
  } else {
    verificationBadges.push({ icon: 'call-outline', label: 'No phone', color: colors.textMuted, verified: false });
  }

  const notificationSummary = `${pushEnabledCount}/${pushTotalCount} categories`;

  // ── Search overlay ──
  if (searchVisible) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Search settings"
            onBack={() => { setSearchVisible(false); setSearchQuery(''); }}
          />
        }
      >
        <View style={{ marginBottom: Space.md }}>
          <AppSearchBar
            placeholder="Search settings"
            value={searchQuery}
            onChangeText={setSearchQuery}
            containerStyle={styles.searchField}
            inputProps={{ autoFocus: true }}
          />
        </View>
        <SettingsSection title={isSearching ? 'Results' : 'All settings'} noCard>
          {isSearching && searchResults.length === 0 ? (
            <View style={styles.emptySearch}>
              <Text style={[styles.emptySearchText, { color: colors.textMuted }]}>
                No matching settings
              </Text>
            </View>
          ) : (
            (isSearching ? searchResults : ROUTE_METADATA).map((dest, i) => (
              <SettingsRow
                key={`${dest.key}-${i}`}
                title={dest.label}
                subtitle={dest.section}
                onPress={() => {
                  setSearchQuery('');
                  setSearchVisible(false);
                  (navigation.navigate as (key: keyof RootStackParamList) => void)(dest.key);
                }}
                isFirst={i === 0}
                isLast={i === (isSearching ? searchResults : ROUTE_METADATA).length - 1}
              />
            ))
          )}
        </SettingsSection>
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Settings"
          onBack={() => navigation.goBack()}
          rightAction={
            <AnimatedPressable
              onPress={() => setSearchVisible(true)}
              scaleValue={0.92}
              hapticFeedback="light"
              style={styles.searchBtn}
              accessibilityRole="button"
              accessibilityLabel="Search settings"
            >
              <Ionicons name="search-outline" size={20} color={colors.textPrimary} />
            </AnimatedPressable>
          }
        />
      }
    >
      {/* ── ACCOUNT SUMMARY CARD — profile, verification status, quick actions ── */}
      <View style={[styles.identityHero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <AnimatedPressable
          onPress={() => navigation.navigate('EditProfile', {})}
          activeOpacity={0.9}
          scaleValue={0.99}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="Edit profile and account"
          accessibilityHint="Opens profile, private details, security and account editor"
        >
          <View style={styles.identityHeroMain}>
            <View style={[styles.identityAvatarWrap, { backgroundColor: colors.surfaceAlt }]}>
              {avatarUri ? (
                <CachedImage uri={avatarUri} style={styles.identityAvatarImage} contentFit="cover" />
              ) : (
                <Text style={[styles.identityAvatarText, { color: colors.textPrimary }]}>{displayName.charAt(0).toUpperCase()}</Text>
              )}
            </View>
            <View style={styles.identityHeroText}>
              <Text style={[styles.identityName, { color: colors.textPrimary }]} numberOfLines={1}>
                {displayName}
              </Text>
              {username ? (
                <Text style={[styles.identityHandle, { color: colors.textMuted }]} numberOfLines={1}>
                  @{username}
                </Text>
              ) : null}
              {currentUser?.email ? (
                <Text style={[styles.identityEmail, { color: colors.textMuted }]} numberOfLines={1}>
                  {currentUser.email}
                </Text>
              ) : null}
            </View>
            <View style={[styles.identityEditAffordance, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </View>
          </View>
        </AnimatedPressable>

        {verificationBadges.length > 0 ? (
          <View style={styles.identityBadges}>
            {verificationBadges.map((badge, i) => (
              <View key={i} style={[styles.identityBadge, { backgroundColor: `${badge.color}15` }]}>
                <Ionicons name={badge.icon} size={11} color={badge.color} />
                <Text style={[styles.identityBadgeText, { color: badge.color }]}>{badge.label}</Text>
                {badge.verified ? (
                  <Ionicons name="checkmark-circle" size={10} color={badge.color} />
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.identityQuickActions}>
          <AnimatedPressable
            style={[styles.identityQuickBtn, { borderColor: colors.border }]}
            onPress={() => navigation.navigate('EditProfile', {})}
            activeOpacity={0.8}
            scaleValue={0.97}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
          >
            <Ionicons name="create-outline" size={15} color={colors.textPrimary} />
            <Text style={[styles.identityQuickBtnText, { color: colors.textPrimary }]}>Edit profile</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.identityQuickBtn, styles.identityQuickBtnPrimary, { backgroundColor: `${colors.brand}15`, borderColor: `${colors.brand}40` }]}
            onPress={() => navigation.navigate('Verification')}
            activeOpacity={0.8}
            scaleValue={0.97}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Verify identity"
          >
            <Ionicons name="shield-checkmark-outline" size={15} color={colors.brand} />
            <Text style={[styles.identityQuickBtnText, { color: colors.brand }]}>Verify identity</Text>
          </AnimatedPressable>
        </View>
      </View>

      {/* ── ACCOUNT ── */}
      <SettingsSection title="Account" icon="person-circle-outline" noCard>
        <SettingsRow
          icon="shield-checkmark-outline"
          iconColor={currentUser?.emailVerified ? colors.success : colors.textMuted}
          title="Verification"
          subtitle={currentUser?.emailVerified ? 'Verified' : 'Get the verified badge'}
          onPress={() => navigation.navigate('Verification')}
          isFirst
        />
        <SettingsRow
          icon="location-outline"
          title="Saved addresses"
          subtitle={savedAddress ? '1 saved' : 'None saved'}
          onPress={() => navigation.navigate('SavedAddresses')}
        />
        <SettingsRow
          icon="card-outline"
          title="Payment methods"
          subtitle={savedPaymentMethod ? savedPaymentMethod.label : 'None saved'}
          onPress={() => navigation.navigate('Payments')}
        />
        <SettingsRow
          icon="key-outline"
          title="Change password"
          subtitle={twoFactorEnabled ? '2FA enabled' : 'Password only'}
          onPress={() => navigation.navigate('ChangePassword')}
        />
        <SettingsRow
          icon="phone-portrait-outline"
          title="Devices & sessions"
          onPress={() => navigation.navigate('ActiveSessions')}
        />
        <SettingsRow
          icon="link-outline"
          title="Connected accounts"
          subtitle="Google, Apple sign-in"
          onPress={() => navigation.navigate('ConnectedAccounts')}
        />
        <SettingsRow
          icon="eye-outline"
          title="Privacy & safety"
          subtitle="Visibility, blocked users"
          onPress={() => navigation.navigate('PrivacySettings')}
        />
        <SettingsRow
          icon="lock-closed-outline"
          title="Data & Privacy"
          subtitle="Download, delete, privacy controls"
          onPress={() => navigation.navigate('DataPrivacy')}
          isLast
        />
      </SettingsSection>

      {/* ── BUYING & SELLING ── */}
      <SettingsSection title="Buying & selling" icon="bag-outline" noCard>
        <SettingsRow
          icon="heart-outline"
          title="Saved & collections"
          onPress={() => navigation.navigate('Closet')}
          isFirst
        />
        <SettingsRow
          icon="wallet-outline"
          title="Payout account"
          subtitle="Balance and wallet"
          onPress={() => navigation.navigate('Wallet')}
        />
        <SettingsRow
          icon="cube-outline"
          title="Shipping preferences"
          onPress={() => navigation.navigate('Postage')}
        />
        <SettingsRow
          icon="cash-outline"
          title="Payout history"
          onPress={() => navigation.navigate('BalanceHistory')}
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
          icon="mail-outline"
          title="Email notifications"
          subtitle={emailNotificationsEnabled ? 'On' : 'Off'}
          onPress={() => navigation.navigate('EmailNotifications')}
        />
        <SettingsRow
          icon="options-outline"
          title="Notification preferences"
          subtitle="Master toggle, quiet hours, preview"
          onPress={() => navigation.navigate('NotificationPreferences')}
        />
        <SettingsRow
          icon="notifications-outline"
          title="Notification categories"
          subtitle={notificationSummary}
          onPress={() => navigation.navigate('PushNotifications')}
        />
        <SettingsRow
          icon="chatbubble-outline"
          title="Chat privacy"
          subtitle="Who can message you"
          onPress={() => navigation.navigate('ChatSettings')}
          isLast
        />
      </SettingsSection>

      {/* ── PREFERENCES ── */}
      <SettingsSection title="Preferences" icon="options-outline" noCard>
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
          icon="accessibility-outline"
          title="Accessibility"
          subtitle="Text size, motion, contrast"
          onPress={() => navigation.navigate('AccessibilitySettings')}
        />
        <SettingsRow
          icon="sparkles-outline"
          title="Your Algorithm"
          subtitle="Manage your recommendations"
          onPress={() => navigation.navigate('YourAlgorithm')}
        />
        <SettingsRow
          icon="leaf-outline"
          title="Sustainability"
          subtitle="Goals, shipping, impact tracking"
          onPress={() => navigation.navigate('SustainabilityPreferences')}
        />
        <SettingsRow
          icon="options-outline"
          title="Content preferences"
          subtitle="Feed and recommendations"
          onPress={() => navigation.navigate('Personalisation')}
        />
        <SettingsRow
          icon="time-outline"
          title="Search history"
          subtitle="Clear your recent searches"
          onPress={() => void handleClearSearchHistory()}
        />
        <SettingsRow
          icon="ban-outline"
          title="Blocked users"
          subtitle={blockedCount > 0 ? `${blockedCount} blocked` : 'None'}
          onPress={() => navigation.navigate('BlockedUsers')}
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

      {/* ── AI & AGENTS ── */}
      <SettingsSection title="AI & Agents" icon="sparkles-outline" noCard>
        <SettingsRow
          icon="sparkles-outline"
          title="AI Preferences"
          subtitle="Listing suggestions, photo, chat agents, Smart Sell"
          onPress={() => navigation.navigate('AIPreferences')}
          isFirst
        />
        <SettingsRow
          icon="key-outline"
          title="AI API Integration"
          subtitle="OpenAI, Anthropic, Gemini — bring your own key"
          onPress={() => navigation.navigate('AIAgentIntegration')}
        />
        <SettingsRow
          icon="people-outline"
          title="Agent Directory"
          subtitle="Browse and deploy AI assistants"
          onPress={() => navigation.navigate('BotDirectory')}
        />
        <SettingsRow
          icon="person-circle-outline"
          title="My Agents"
          subtitle="Manage your created AI agents"
          onPress={() => navigation.navigate('CustomBots')}
        />
        <SettingsRow
          icon="create-outline"
          title="Create Agent"
          subtitle="Build a custom AI assistant"
          onPress={() => navigation.navigate('BotBuilder', {})}
          isLast
        />
      </SettingsSection>

      {/* ── CO-OWN ── */}
      <SettingsSection title="Co-Own" icon="diamond-outline" noCard>
        <SettingsRow
          icon="notifications-outline"
          title="Price alerts"
          subtitle="Notify on price thresholds"
          onPress={() => navigation.navigate('CoOwnPriceAlerts')}
          isFirst
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
          isLast
        />
      </SettingsSection>

      {/* ── ACCOUNT CONTROL ── */}
      <SettingsSection title="Account control" icon="shield-outline" noCard>
        <SettingsRow
          icon="shield-outline"
          title="Account control"
          subtitle="Download data, delete account"
          onPress={() => navigation.navigate('AccountControl')}
          isFirst
        />
        <SettingsRow
          icon="download-outline"
          title="Download my data"
          subtitle="Export a copy of your account data"
          onPress={() => navigation.navigate('DataExport')}
          isLast
        />
      </SettingsSection>

      {/* ── DANGER ZONE ── */}
      <SettingsSection title="Danger zone" icon="warning-outline" noCard>
        <SettingsRow
          icon="trash-outline"
          title="Delete account"
          subtitle="Permanently erase your account and data"
          danger
          onPress={() => navigation.navigate('DeleteAccount')}
          isFirst
          isLast
        />
      </SettingsSection>

      {/* ── HELP & ABOUT ── */}
      <SettingsSection title="Help & about" icon="help-circle-outline" noCard>
        <SettingsRow
          icon="help-circle-outline"
          title="Help Centre"
          onPress={() => navigation.navigate('HelpSupport')}
          isFirst
        />
        <SettingsRow
          icon="folder-open-outline"
          title="Resolution Centre"
          onPress={() => navigation.navigate('ResolutionCentre')}
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

      {/* ── SIGN OUT ── */}
      {/* Sign Out action is rendered via SettingsSignOutRow for destructive separation */}
      <View style={{ marginTop: Space.lg, marginBottom: Space.md }}>
        <SettingsSignOutRow username={currentUser?.username} onSignOut={handleLogout} />
      </View>

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
  searchBtn: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchField: {
    borderRadius: Radius.full,
    backgroundColor: 'transparent',
    height: Control.hit,
  },
  // ── Identity hero card ──
  identityHero: {
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    marginBottom: Space.lg,
    ...Elevation.subtle,
  },
  identityHeroMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  identityAvatarWrap: {
    width: Space.xxl + Space.sm,
    height: Space.xxl + Space.sm,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  identityAvatarImage: {
    width: Space.xxl + Space.sm,
    height: Space.xxl + Space.sm,
    borderRadius: Radius.full,
  },
  identityAvatarText: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
  },
  identityHeroText: {
    flex: 1,
    gap: Space.xs / 2,
  },
  identityName: {
    fontSize: Type.bodyEmphasis.size + 1,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.body.letterSpacing,
    lineHeight: Type.bodyLarge.lineHeight,
  },
  identityHandle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
  identityEmail: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
    lineHeight: Type.meta.lineHeight,
  },
  identityBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs + 2,
    marginTop: Space.sm,
  },
  identityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs - 1,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2,
    borderRadius: Radius.full,
  },
  identityBadgeText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.meta.letterSpacing * 2,
  },
  identityQuickActions: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.md,
  },
  identityQuickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.sm,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: Control.hit,
  },
  identityQuickBtnPrimary: {},
  identityQuickBtnText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.caption.letterSpacing,
  },
  identityEditAffordance: {
    width: Control.chromeCompact,
    height: Control.chromeCompact,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  // ── Search empty state ──
  emptySearch: {
    paddingVertical: Space.lg,
    alignItems: 'center',
  },
  emptySearchText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
  },
});
