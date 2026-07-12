import React from 'react';
import { Linking, View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { StackScreenProps } from '@react-navigation/stack';
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
  getThemePreferenceLabel,
  ThemePreference,
  updateThemePreference,
} from '../theme/themePreference';
import { useAppTheme } from '../theme/ThemeContext';
import { t } from '../i18n';
import { Space, Radius, Type, Elevation } from '../theme/designTokens';
import { Typography } from '../theme/designTokens';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { AppSearchBar } from '../components/ui/AppSearchBar';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SettingsSignOutRow } from '../components/settings/SettingsSignOutRow';
import { useAppTheme as useTheme } from '../theme/ThemeContext';

type Props = StackScreenProps<RootStackParamList, 'Settings'>;

interface DestinationMeta {
  key: string;
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
    toggleEmailNotifications,
  } = useSettingsPreferences();

  const [currencyPickerVisible, setCurrencyPickerVisible] = React.useState(false);
  const [themePickerVisible, setThemePickerVisible] = React.useState(false);
  const [languagePickerVisible, setLanguagePickerVisible] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchVisible, setSearchVisible] = React.useState(false);

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

  const handleToggleEmailNotifications = React.useCallback(() => {
    const next = !emailNotificationsEnabled;
    toggleEmailNotifications();
    show(
      next ? t('settings.toast.emailEnabled') : t('settings.toast.emailPaused'),
      next ? 'success' : 'info'
    );
  }, [emailNotificationsEnabled, show, toggleEmailNotifications]);

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

  const handleLogout = React.useCallback(async () => {
    await logoutFromSession();
    clearUserScopedQueryCache();
    logout();
    navigation.replace('AuthLanding');
  }, [logout, navigation]);

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

  const avatarUri = (currentUser as any)?.avatar || null;
  const displayName = (currentUser as any)?.displayName ?? currentUser?.username ?? 'Not signed in';
  const username = currentUser?.username ?? '';

  // Security badges for identity card
  const securityBadges: { icon: string; label: string; color: string }[] = [];
  if (twoFactorEnabled) securityBadges.push({ icon: 'shield-checkmark', label: '2FA', color: colors.success });
  if (currentUser?.emailVerified) securityBadges.push({ icon: 'checkmark-circle', label: 'Verified', color: colors.success });

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
                  (navigation as any).navigate(dest.key);
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
              style={[styles.searchBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel="Search settings"
            >
              <Ionicons name="search-outline" size={20} color={colors.textPrimary} />
            </AnimatedPressable>
          }
        />
      }
    >
      {/* ── IDENTITY HERO CARD — sole profile/account editor entrypoint ── */}
      <AnimatedPressable
        onPress={() => (navigation as any).navigate('EditProfile')}
        activeOpacity={0.9}
        scaleValue={0.99}
        hapticFeedback="light"
        accessibilityRole="button"
        accessibilityLabel="Edit profile and account"
        accessibilityHint="Opens profile, private details, security and account editor"
      >
        <View style={[styles.identityHero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
              {securityBadges.length > 0 ? (
                <View style={styles.identityBadges}>
                  {securityBadges.map((badge, i) => (
                    <View key={i} style={[styles.identityBadge, { backgroundColor: `${badge.color}15` }]}>
                      <Ionicons name={badge.icon as any} size={11} color={badge.color} />
                      <Text style={[styles.identityBadgeText, { color: badge.color }]}>{badge.label}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            <View style={[styles.identityEditAffordance, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </View>
          </View>
        </View>
      </AnimatedPressable>

      {/* ── ACCOUNT SECTION (card) — no profile/private details rows (top card is the entrypoint) ── */}
      <SettingsSection title="Account">
        <SettingsRow
          icon="shield-checkmark-outline"
          iconColor={currentUser?.emailVerified ? colors.success : colors.textMuted}
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
          icon="phone-portrait-outline"
          title="Devices & sessions"
          onPress={() => navigation.navigate('ActiveSessions')}
          isLast
        />
      </SettingsSection>

      {/* ── BUYING & SELLING (card) ── */}
      <SettingsSection title="Buying & selling">
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
          isLast
        />
      </SettingsSection>

      {/* ── PRIVACY & NOTIFICATIONS (card) ── */}
      <SettingsSection title="Privacy & notifications">
        <SettingsRow
          icon="eye-outline"
          title="Privacy & safety"
          subtitle="Visibility, blocked users"
          onPress={() => navigation.navigate('PrivacySettings')}
          isFirst
        />
        <SettingsRow
          icon="ban-outline"
          title="Blocked users"
          subtitle={blockedCount > 0 ? `${blockedCount} blocked` : 'None'}
          onPress={() => navigation.navigate('BlockedUsers')}
        />
        <SettingsRow
          icon="chatbubble-outline"
          title="Chat privacy"
          subtitle="Who can message you"
          onPress={() => navigation.navigate('ChatSettings')}
        />
        <SettingsRow
          icon="notifications-outline"
          title="Notification categories"
          subtitle={notificationSummary}
          onPress={() => navigation.navigate('PushNotifications')}
        />
        <SettingsRow
          icon="mail-outline"
          title="Email notifications"
          toggleValue={emailNotificationsEnabled}
          onToggle={handleToggleEmailNotifications}
          isLast
        />
      </SettingsSection>

      {/* ── PREFERENCES (card) ── */}
      <SettingsSection title="Preferences">
        <SettingsRow
          icon="swap-horizontal-outline"
          title="Currency display"
          value={displayModeLabel}
          onPress={cycleDisplayMode}
          isFirst
        />
        <SettingsRow
          icon="globe-outline"
          title="Local currency"
          value={`${currencyCode} (${CURRENCIES[currencyCode].symbol})`}
          onPress={() => setCurrencyPickerVisible(true)}
        />
        <SettingsRow
          icon="color-palette-outline"
          title="Theme"
          value={getThemePreferenceLabel(themePreference)}
          onPress={() => setThemePickerVisible(true)}
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
          isLast
        />
      </SettingsSection>

      {/* ── ACCOUNT CONTROL (card, sober) ── */}
      <SettingsSection title="Account control">
        <SettingsRow
          icon="shield-outline"
          title="Account control"
          subtitle="Download data, delete account"
          onPress={() => navigation.navigate('AccountControl')}
          isFirst
          isLast
        />
      </SettingsSection>

      {/* ── HELP & ABOUT (card) ── */}
      <SettingsSection title="Help & about">
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
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchField: {
    borderRadius: 999,
    backgroundColor: 'transparent',
    height: 44,
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
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  identityAvatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  identityAvatarText: {
    fontSize: 22,
    fontFamily: Typography.family.bold,
  },
  identityHeroText: {
    flex: 1,
    gap: 2,
  },
  identityName: {
    fontSize: Type.bodyEmphasis.size + 1,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  identityHandle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
  identityBadges: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  identityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  identityBadgeText: {
    fontSize: 10,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.3,
  },
  identityEditAffordance: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
