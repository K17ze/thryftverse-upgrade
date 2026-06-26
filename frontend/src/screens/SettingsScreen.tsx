import React from 'react';
import { Linking, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
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
} from '../theme/themePreference';
import { useAppTheme } from '../theme/ThemeContext';
import { t } from '../i18n';
import { Space, Radius, Type } from '../theme/designTokens';
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
}

const DESTINATIONS: DestinationMeta[] = [
  { key: 'EditProfile', label: 'Public profile', searchTerms: 'edit profile avatar name bio username', section: 'Account' },
  { key: 'AccountSettings', label: 'Private details', searchTerms: 'account details email phone private', section: 'Account' },
  { key: 'Postage', label: 'Delivery addresses', searchTerms: 'postage shipping address delivery buying', section: 'Buying' },
  { key: 'Payments', label: 'Payment methods', searchTerms: 'payment methods card bank buying', section: 'Buying' },
  { key: 'Closet', label: 'Saved & collections', searchTerms: 'closet saved wishlist collections buying', section: 'Buying' },
  { key: 'Wallet', label: 'Payout account', searchTerms: 'wallet balance payout selling', section: 'Selling & payouts' },
  { key: 'BalanceHistory', label: 'Payout history', searchTerms: 'balance history payouts selling', section: 'Selling & payouts' },
  { key: 'Postage', label: 'Shipping preferences', searchTerms: 'postage shipping preferences selling', section: 'Selling & payouts' },
  { key: 'PrivacySettings', label: 'Privacy & safety', searchTerms: 'privacy controls visibility safety blocked', section: 'Privacy & safety' },
  { key: 'ChatSettings', label: 'Messages & notifications', searchTerms: 'messages chat notifications messaging', section: 'Messages & notifications' },
  { key: 'Personalisation', label: 'Personalisation & appearance', searchTerms: 'personalisation feed preferences theme currency language appearance', section: 'Personalisation & appearance' },
  { key: 'PushNotifications', label: 'Notification categories', searchTerms: 'push notifications alerts categories', section: 'Messages & notifications' },
  { key: 'HelpSupport', label: 'Help', searchTerms: 'help support faq contact', section: 'Help' },
  { key: 'About', label: 'About Thryftverse', searchTerms: 'about version', section: 'Help' },
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

  const handleThemeSelect = (option: string) => {
    const nextPreference = option.toLowerCase() as ThemePreference;
    if (nextPreference === themePreference) return;
    setThemePreference(nextPreference);
    show(`Theme set to ${getThemePreferenceLabel(nextPreference)}`, 'success');
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
    return DESTINATIONS.filter((d) =>
      d.searchTerms.toLowerCase().includes(q) ||
      d.label.toLowerCase().includes(q) ||
      d.section.toLowerCase().includes(q)
    );
  }, [isSearching, q]);

  const avatarUri = (currentUser as any)?.avatar || null;
  const displayName = currentUser?.username ?? 'Not signed in';

  const securityStatusParts: string[] = [];
  if (twoFactorEnabled) securityStatusParts.push('2FA enabled');
  if (currentUser?.emailVerified) securityStatusParts.push('Verified email');

  const notificationSummary = `${pushEnabledCount}/${pushTotalCount} categories`;

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Settings"
          onBack={() => navigation.goBack()}
        />
      }
    >
      {/* Compact identity row */}
      <View style={styles.identityRow}>
        <View style={[styles.identityAvatar, { backgroundColor: colors.surfaceAlt }]}>
          {avatarUri ? (
            <CachedImage uri={avatarUri} style={styles.identityAvatarImage} contentFit="cover" />
          ) : (
            <Text style={styles.identityAvatarText}>{displayName.charAt(0).toUpperCase()}</Text>
          )}
        </View>
        <View style={styles.identityText}>
          <Text style={[styles.identityName, { color: colors.textPrimary }]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[styles.identityStatus, { color: colors.textMuted }]} numberOfLines={1}>
            {securityStatusParts.join(' · ')}
          </Text>
        </View>
        <AnimatedPressable
          onPress={() => navigation.navigate('EditProfile')}
          activeOpacity={0.7}
          scaleValue={0.96}
          hapticFeedback="light"
          accessibilityLabel="Edit profile"
          accessibilityRole="button"
          style={[styles.identityEditBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
        >
          <Ionicons name="pencil-outline" size={16} color={colors.textPrimary} />
        </AnimatedPressable>
      </View>

      {/* Search */}
      <View style={{ marginBottom: Space.md }}>
        <AppSearchBar
          placeholder="Search settings"
          value={searchQuery}
          onChangeText={setSearchQuery}
          containerStyle={styles.searchField}
        />
      </View>

      {isSearching ? (
        /* Search results — direct matching rows */
        <SettingsSection title="Results" noCard>
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
                  (navigation as any).navigate(dest.key);
                }}
                isFirst={i === 0}
                isLast={i === searchResults.length - 1}
              />
            ))
          )}
        </SettingsSection>
      ) : (
        <>
          {/* Account */}
          <SettingsSection title="Account" noCard>
            <SettingsRow
              title="Public profile"
              subtitle="Avatar, name, bio, username"
              onPress={() => navigation.navigate('EditProfile')}
              isFirst
            />
            <SettingsRow
              title="Private details"
              subtitle="Email, phone, identity"
              onPress={() => navigation.navigate('AccountSettings')}
            />
            <SettingsRow
              icon="key-outline"
              title="Password & authentication"
              subtitle={twoFactorEnabled ? '2FA enabled' : 'Password only'}
              onPress={() => navigation.navigate('ChangePassword')}
            />
            <SettingsRow
              icon="shield-checkmark-outline"
              title="Two-factor authentication"
              subtitle={twoFactorEnabled ? 'Enabled' : 'Not enabled'}
              onPress={() => navigation.navigate('TwoFactorSetup')}
            />
            <SettingsRow
              title="Devices & sessions"
              onPress={() => navigation.navigate('ActiveSessions')}
              isLast
            />
          </SettingsSection>

          {/* Buying */}
          <SettingsSection title="Buying" noCard>
            <SettingsRow
              icon="location-outline"
              title="Delivery addresses"
              subtitle={savedAddress ? '1 saved' : 'None saved'}
              onPress={() => navigation.navigate('Postage')}
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
              isLast
            />
          </SettingsSection>

          {/* Selling & payouts */}
          <SettingsSection title="Selling & payouts" noCard>
            <SettingsRow
              icon="wallet-outline"
              title="Payout account"
              subtitle="Balance and wallet"
              onPress={() => navigation.navigate('Wallet')}
              isFirst
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

          {/* Privacy & safety */}
          <SettingsSection title="Privacy & safety" noCard>
            <SettingsRow
              icon="eye-outline"
              title="Profile visibility"
              subtitle="Private profile, activity, message permissions"
              onPress={() => navigation.navigate('PrivacySettings')}
              isFirst
            />
            <SettingsRow
              icon="ban-outline"
              title="Blocked users"
              subtitle={blockedCount > 0 ? `${blockedCount} blocked` : 'None'}
              onPress={() => navigation.navigate('BlockedUsers')}
              isLast
            />
          </SettingsSection>

          {/* Messages & notifications */}
          <SettingsSection title="Messages & notifications" noCard>
            <SettingsRow
              icon="chatbubble-outline"
              title="Chat privacy"
              subtitle="Who can message you, read receipts"
              onPress={() => navigation.navigate('ChatSettings')}
              isFirst
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

          {/* Personalisation & appearance */}
          <SettingsSection title="Personalisation & appearance" noCard>
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

          {/* Data & permissions */}
          <SettingsSection title="Data & permissions" noCard>
            <SettingsRow
              title="Download my data"
              subtitle="Not available yet"
              disabled
              onPress={() => {}}
              isFirst
            />
            <SettingsRow
              title="Search & viewing history"
              subtitle="Not available yet"
              disabled
              onPress={() => {}}
            />
            <SettingsRow
              title="Personalisation data"
              subtitle="Not available yet"
              disabled
              onPress={() => {}}
            />
            <SettingsRow
              title="Connected services"
              subtitle="Not available yet"
              disabled
              onPress={() => {}}
            />
            <SettingsRow
              title="Deactivate account"
              subtitle="Not available yet"
              disabled
              onPress={() => {}}
            />
            <SettingsRow
              title="Delete account"
              subtitle="Not available yet"
              disabled
              danger
              onPress={() => {}}
              isLast
            />
          </SettingsSection>

          {/* Help */}
          <SettingsSection title="Help" noCard>
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

          {/* Sign out */}
          <View style={{ marginTop: Space.lg }}>
            <SettingsSignOutRow username={currentUser?.username} onSignOut={handleLogout} />
          </View>
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
    borderRadius: 999,
    backgroundColor: 'transparent',
    height: 44,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    marginBottom: Space.md,
  },
  identityAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  identityAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  identityAvatarText: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
  },
  identityText: {
    flex: 1,
    gap: 2,
  },
  identityName: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  identityStatus: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
  },
  identityEditBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptySearch: {
    paddingVertical: Space.lg,
    alignItems: 'center',
  },
  emptySearchText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
  },
});
