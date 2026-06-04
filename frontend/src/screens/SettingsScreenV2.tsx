import React from 'react';
import { Linking } from 'react-native';
import { Colors } from '../constants/colors';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
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
import { SettingsPage } from '../components/settings/SettingsPage';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { IdentityCard } from '../components/settings/IdentityCard';
import { AppSearchBar } from '../components/ui/AppSearchBar';

type Props = StackScreenProps<RootStackParamList, 'Settings'>;

export default function SettingsScreenV2({ navigation }: Props) {
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

  const { themePreference, setThemePreference, resolvedTheme } = useAppTheme();

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

  const matchesSearch = (text: string) => {
    if (!searchQuery.trim()) return true;
    return text.toLowerCase().includes(searchQuery.toLowerCase().trim());
  };

  return (
    <SettingsPage title="Settings" onBack={() => navigation.goBack()}>
      {/* Search */}
      <Reanimated.View entering={FadeInDown.duration(300).delay(0)} style={{ marginBottom: 16, paddingHorizontal: 16 }}>
        <AppSearchBar
          placeholder="Search settings"
          value={searchQuery}
          onChangeText={setSearchQuery}
          containerStyle={{ borderRadius: 999, backgroundColor: Colors.surface, height: 48 }}
        />
      </Reanimated.View>

      {/* Account Centre */}
      {matchesSearch('account centre profile avatar addresses closet') && (
        <Reanimated.View entering={FadeInDown.duration(300).delay(40)}>
          <SettingsSection title="Account Centre">
            <IdentityCard
              user={currentUser}
              onPress={() => navigation.navigate('EditProfile')}
            />
            <SettingsRow
              icon="location-outline"
              title="Addresses"
              value={savedAddress ? 'Manage' : 'None'}
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
      {matchesSearch('seller hub balance wallet payments shipping payouts') && (
        <Reanimated.View entering={FadeInDown.duration(300).delay(80)}>
          <SettingsSection title="Seller Hub">
            <SettingsRow
              icon="wallet-outline"
              iconColor="#c9a86c"
              title="Balance & Wallet"
              value="Manage"
              onPress={() => navigation.navigate('Wallet')}
              isFirst
            />
            <SettingsRow
              icon="card-outline"
              iconColor="#c9a86c"
              title="Payment Methods"
              value={savedPaymentMethod ? 'Manage' : 'None'}
              onPress={() => navigation.navigate('Payments')}
            />
            <SettingsRow
              icon="cash-outline"
              iconColor="#c9a86c"
              title="Payouts"
              value="Manage"
              onPress={() => navigation.navigate('BalanceHistory')}
            />
            <SettingsRow
              icon="cube-outline"
              iconColor="#c9a86c"
              title="Shipping"
              value="Manage"
              onPress={() => navigation.navigate('Postage')}
              isLast
            />
          </SettingsSection>
        </Reanimated.View>
      )}

      {/* Trust & Security */}
      {matchesSearch('trust security password 2fa devices sessions blocked privacy') && (
        <Reanimated.View entering={FadeInDown.duration(300).delay(120)}>
          <SettingsSection title="Trust & Security">
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
      {matchesSearch('preferences currency language theme notifications push personalisation') && (
        <Reanimated.View entering={FadeInDown.duration(300).delay(160)}>
          <SettingsSection title="Preferences">
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
      {matchesSearch('support help terms privacy about') && (
        <Reanimated.View entering={FadeInDown.duration(300).delay(200)}>
          <SettingsSection title="Support">
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

      {/* Dev-only Diagnostics */}
      {__DEV__ && (
        <Reanimated.View entering={FadeInDown.duration(300).delay(220)}>
          <SettingsSection title="Dev">
            <SettingsRow
              icon="color-palette-outline"
              title="Theme Debug"
              subtitle={`Pref: ${themePreference} · Resolved: ${resolvedTheme}`}
              value={resolvedTheme === 'dark' ? '🌙' : '☀️'}
              isFirst
              isLast
            />
            {matchesSearch('diagnostics smoke test') && (
              <SettingsRow
                icon="bug-outline"
                iconColor={Colors.brand}
                title="Runtime Smoke Test"
                subtitle="Dev-only diagnostic navigation"
                onPress={() => navigation.navigate('RuntimeSmokeTest')}
                isFirst
                isLast
              />
            )}
          </SettingsSection>
        </Reanimated.View>
      )}

      {/* Logout */}
      {matchesSearch('log out') && (
        <Reanimated.View entering={FadeInDown.duration(300).delay(240)} style={{ marginTop: 12, paddingHorizontal: 16 }}>
          <SettingsRow
            icon="log-out-outline"
            iconColor="#ff3b30"
            title="Log Out"
            danger
            onPress={handleLogout}
            isFirst
            isLast
          />
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
    </SettingsPage>
  );
}
