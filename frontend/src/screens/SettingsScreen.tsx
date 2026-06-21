import React from 'react';
import { Linking, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { logoutFromSession } from '../services/authApi';
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
import { IdentityCard } from '../components/settings/IdentityCard';
import { AppSearchBar } from '../components/ui/AppSearchBar';
import { ElevatedSurface } from '../components/ui/ElevatedSurface';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SettingsSignOutRow } from '../components/settings/SettingsSignOutRow';
import Reanimated, { FadeInDown } from 'react-native-reanimated';

type Props = StackScreenProps<RootStackParamList, 'Settings'>;

interface RouteMeta {
  key: string;
  searchTerms: string;
  section: string;
}

const ROUTE_METADATA: RouteMeta[] = [
  { key: 'EditProfile', searchTerms: 'edit profile avatar name bio', section: 'Account Centre' },
  { key: 'Postage', searchTerms: 'postage shipping address delivery', section: 'Account Centre' },
  { key: 'Closet', searchTerms: 'closet saved wishlist collections', section: 'Account Centre' },
  { key: 'Wallet', searchTerms: 'wallet balance payout', section: 'Seller Hub' },
  { key: 'Payments', searchTerms: 'payment methods card bank', section: 'Seller Hub' },
  { key: 'BalanceHistory', searchTerms: 'balance history payouts', section: 'Seller Hub' },
  { key: 'AccountSettings', searchTerms: 'account details email phone', section: 'Trust & Security' },
  { key: 'ChangePassword', searchTerms: 'password security', section: 'Trust & Security' },
  { key: 'TwoFactorSetup', searchTerms: 'two factor authentication 2fa', section: 'Trust & Security' },
  { key: 'ActiveSessions', searchTerms: 'devices sessions active', section: 'Trust & Security' },
  { key: 'BlockedUsers', searchTerms: 'blocked users', section: 'Trust & Security' },
  { key: 'PrivacySettings', searchTerms: 'privacy controls', section: 'Trust & Security' },
  { key: 'PushNotifications', searchTerms: 'push notifications alerts', section: 'Preferences' },
  { key: 'Personalisation', searchTerms: 'personalisation feed preferences', section: 'Preferences' },
  { key: 'HelpSupport', searchTerms: 'help support faq contact', section: 'Support' },
  { key: 'About', searchTerms: 'about version', section: 'Support' },
];

export default function SettingsScreen({ navigation }: Props) {
  const logout = useStore((state) => state.logout);
  const currentUser = useStore((state) => state.currentUser);
  const twoFactorEnabled = useStore((state) => state.twoFactorEnabled);
  const savedPaymentMethod = useStore((state) => state.savedPaymentMethod);
  const savedAddress = useStore((state) => state.savedAddress);
  const { show } = useToast();

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

  const pushNotificationsSubtitle = t('settings.push.subtitle', {
    enabled: pushEnabledCount,
    total: pushTotalCount,
  });

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
    logout();
    navigation.replace('AuthLanding');
  }, [logout, navigation]);

  const matchesSearch = (terms: string) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return terms.toLowerCase().includes(q);
  };

  const showSection = (sectionName: string) => {
    if (!searchQuery.trim()) return true;
    return (
      sectionName.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
      ROUTE_METADATA.some(
        (r) =>
          r.section === sectionName &&
          r.searchTerms.toLowerCase().includes(searchQuery.toLowerCase().trim())
      )
    );
  };

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Settings"
          onBack={() => navigation.goBack()}
        />
      }
    >
      {/* Search */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
        <View style={{ marginBottom: Space.lg }}>
          <AppSearchBar
            placeholder="Search settings"
            value={searchQuery}
            onChangeText={setSearchQuery}
            containerStyle={styles.searchField}
          />
        </View>
      </Reanimated.View>

      {/* Identity First */}
      {showSection('Account Centre') && (
        <Reanimated.View entering={FadeInDown.duration(300).delay(40)}>
          <View style={[styles.identitySurface, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
            <IdentityCard
              user={currentUser}
              onPress={() => navigation.navigate('EditProfile')}
              variant="commanding"
            />
            <View style={styles.quickActions}>
              <AnimatedPressable
                style={styles.quickAction}
                onPress={() => navigation.navigate('EditProfile')}
                activeOpacity={0.85}
                scaleValue={0.97}
                hapticFeedback="light"
              >
                <Ionicons name="create-outline" size={18} color={Colors.textPrimary} />
                <Text style={styles.quickActionText}>Edit Profile</Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={styles.quickAction}
                onPress={() => navigation.navigate('Wallet')}
                activeOpacity={0.85}
                scaleValue={0.97}
                hapticFeedback="light"
              >
                <Ionicons name="wallet-outline" size={18} color={Colors.textPrimary} />
                <Text style={styles.quickActionText}>Wallet</Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={styles.quickAction}
                onPress={() => navigation.navigate('AccountSettings')}
                activeOpacity={0.85}
                scaleValue={0.97}
                hapticFeedback="light"
              >
                <Ionicons name="shield-checkmark-outline" size={18} color={Colors.textPrimary} />
                <Text style={styles.quickActionText}>Security</Text>
              </AnimatedPressable>
            </View>
          </View>
        </Reanimated.View>
      )}

      {/* Account Centre */}
      {showSection('Account Centre') && (
        <Reanimated.View entering={FadeInDown.duration(300).delay(80)}>
          <SettingsSection title="Account" noCard>
            <SettingsRow
              icon="location-outline"
              title="Addresses"
              subtitle={savedAddress ? 'Manage delivery addresses' : 'None saved'}
              value={savedAddress ? 'Manage' : 'Add'}
              onPress={() => navigation.navigate('Postage')}
              isFirst
            />
            <SettingsRow
              icon="shirt-outline"
              title="Closet"
              subtitle="Saved, Wishlist & Collections"
              onPress={() => navigation.navigate('Closet')}
              isLast
            />
          </SettingsSection>
        </Reanimated.View>
      )}

      {/* Seller Hub */}
      {showSection('Seller Hub') && (
        <Reanimated.View entering={FadeInDown.duration(300).delay(120)}>
          <SettingsSection title="Selling & Money" noCard>
            <SettingsRow
              icon="wallet-outline"
              title="Balance & Wallet"
              value="Manage"
              onPress={() => navigation.navigate('Wallet')}
              isFirst
            />
            <SettingsRow
              icon="card-outline"
              title="Payment Methods"
              value={savedPaymentMethod ? 'Manage' : 'None'}
              onPress={() => navigation.navigate('Payments')}
            />
            <SettingsRow
              icon="cash-outline"
              title="Payouts"
              value="Manage"
              onPress={() => navigation.navigate('BalanceHistory')}
            />
            <SettingsRow
              icon="cube-outline"
              title="Shipping"
              value="Manage"
              onPress={() => navigation.navigate('Postage')}
              isLast
            />
          </SettingsSection>
        </Reanimated.View>
      )}

      {/* Trust & Security */}
      {showSection('Trust & Security') && (
        <Reanimated.View entering={FadeInDown.duration(300).delay(160)}>
          <SettingsSection title="Trust & Security" noCard>
            <SettingsRow
              icon="person-circle-outline"
              title="Account Details"
              value="View"
              onPress={() => navigation.navigate('AccountSettings')}
              isFirst
            />
            <SettingsRow
              icon="lock-closed-outline"
              title="Password"
              value="••••••••"
              onPress={() => navigation.navigate('ChangePassword')}
            />
            <SettingsRow
              icon="shield-checkmark-outline"
              title="Two-Factor Authentication"
              value={twoFactorEnabled ? 'On' : 'Off'}
              onPress={() => navigation.navigate('TwoFactorSetup')}
            />
            <SettingsRow
              icon="phone-portrait-outline"
              title="Devices & Sessions"
              value="Manage"
              onPress={() => navigation.navigate('ActiveSessions')}
            />
            <SettingsRow
              icon="ban-outline"
              title="Blocked Users"
              value="View"
              onPress={() => navigation.navigate('BlockedUsers')}
            />
            <SettingsRow
              icon="eye-outline"
              title="Privacy Controls"
              value="Manage"
              onPress={() => navigation.navigate('PrivacySettings')}
              isLast
            />
          </SettingsSection>
        </Reanimated.View>
      )}

      {/* Preferences */}
      {showSection('Preferences') && (
        <Reanimated.View entering={FadeInDown.duration(300).delay(200)}>
          <SettingsSection title="Preferences" noCard>
            <SettingsRow
              icon="swap-horizontal-outline"
              title="Currency Display"
              value={displayModeLabel}
              onPress={cycleDisplayMode}
              isFirst
            />
            <SettingsRow
              icon="globe-outline"
              title="Local Currency"
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
              title="Personalisation"
              subtitle="Content preferences and recommendations"
              onPress={() => navigation.navigate('Personalisation')}
            />
            <SettingsRow
              icon="notifications-outline"
              title="Push Notifications"
              subtitle={pushNotificationsSubtitle}
              onPress={() => navigation.navigate('PushNotifications')}
            />
            <SettingsRow
              icon="mail-outline"
              title="Email Notifications"
              toggleValue={emailNotificationsEnabled}
              onToggle={handleToggleEmailNotifications}
              isLast
            />
          </SettingsSection>
        </Reanimated.View>
      )}

      {/* Support */}
      {showSection('Support') && (
        <Reanimated.View entering={FadeInDown.duration(300).delay(240)}>
          <SettingsSection title="Support" noCard>
            <SettingsRow
              icon="help-circle-outline"
              title="Help Centre"
              subtitle="FAQs, contact us, and more"
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
        </Reanimated.View>
      )}

      {/* Logout / Sign Out */}
      {matchesSearch('log out sign out') && (
        <Reanimated.View entering={FadeInDown.duration(300).delay(280)}>
          <SettingsSignOutRow username={currentUser?.username} onSignOut={handleLogout} />
        </Reanimated.View>
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
    height: 48,
  },
  headerMeta: {
    maxWidth: 120,
  },
  headerMetaText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    textAlign: 'right',
  },
  accountCard: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginHorizontal: Space.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  accountDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: Space.md,
  },
  identitySurface: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginHorizontal: Space.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Space.lg,
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    paddingBottom: Space.md,
    gap: Space.sm,
  },
  quickAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs + 2,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  quickActionText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    letterSpacing: Type.caption.letterSpacing,
  },
});
