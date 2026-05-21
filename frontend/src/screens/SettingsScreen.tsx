import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Linking,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { ActiveTheme, Colors } from '../constants/colors';
import {
  SettingsCell,
  SettingsGroup,
  SettingsSectionHeader,
  SettingsSectionFooter,
} from '../components/SettingsCell';
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
  getStoredThemePreference,
  getThemePreferenceLabel,
  ThemePreference,
  updateThemePreference,
} from '../theme/themePreference';
import { t } from '../i18n';
import { Space, Radius, Type } from '../theme/designTokens';
import { AppCard } from '../components/ui/AppCard';
import { CachedImage } from '../components/CachedImage';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { MY_USER } from '../data/mockData';

type Props = StackScreenProps<RootStackParamList, 'Settings'>;

// Section definition for searchability and animation ordering
interface SettingsSectionDef {
  key: string;
  header: string;
  footer?: string;
  items: React.ReactNode;
}

export default function SettingsScreen({ navigation }: Props) {
  const logout = useStore((state) => state.logout);
  const currentUser = useStore((state) => state.currentUser);
  const userAvatar = useStore((state) => state.userAvatar);
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
  const [themePreference, setThemePreference] = React.useState<ThemePreference>('system');
  const [searchQuery, setSearchQuery] = React.useState('');

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

  React.useEffect(() => {
    getStoredThemePreference().then(setThemePreference).catch(() => {
      // Ignore persistence errors and keep default.
    });
  }, []);

  const handleCurrencySelect = (option: string) => {
    const selectedCode = option.split(' | ')[0] as SupportedCurrencyCode;
    if (selectedCode !== currencyCode) {
      setCurrencyCode(selectedCode);
    }
  };

  const handleThemeSelect = async (option: string) => {
    const nextPreference = option.toLowerCase() as ThemePreference;
    if (nextPreference === themePreference) return;
    setThemePreference(nextPreference);
    const reloaded = await updateThemePreference(nextPreference, { reloadApp: true });
    if (!reloaded) {
      show(t('settings.toast.themeUpdatedRestart'), 'info');
    }
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

  const handleClearCache = React.useCallback(() => {
    show('Cache cleared', 'success');
  }, [show]);

  // Profile preview data
  const user = currentUser ? { ...MY_USER, ...currentUser } : MY_USER;
  const avatarUri = userAvatar || user.avatar;
  const displayName = user.username || 'User';
  const reputationLabel = `${user.rating?.toFixed(1) ?? '0.0'} · ${user.reviewCount ?? 0} reviews`;

  // Search filter helper
  const matchesSearch = (text: string) => {
    if (!searchQuery.trim()) return true;
    return text.toLowerCase().includes(searchQuery.toLowerCase().trim());
  };

  // Build sections as renderable content
  const sections: SettingsSectionDef[] = React.useMemo(() => {
    const list: SettingsSectionDef[] = [];

    // Account
    const accountItems = (
      <SettingsGroup>
        <SettingsCell
          icon="person-outline"
          iconColor={Colors.brand}
          title="Personal Information"
          value={user.username}
          isFirst
          onPress={() => navigation.navigate('EditProfile')}
        />
        <SettingsCell
          icon="lock-closed-outline"
          iconColor={Colors.success}
          title="Password"
          value="••••••••"
          onPress={() => navigation.navigate('ChangePassword')}
        />
        <SettingsCell
          icon="card-outline"
          iconColor="#4CAF50"
          title="Payment Methods"
          value="2 cards"
          onPress={() => navigation.navigate('Payments')}
        />
        <SettingsCell
          icon="location-outline"
          iconColor="#FF9800"
          title="Addresses"
          value="3 saved"
          isLast
          onPress={() => navigation.navigate('AddAddress')}
        />
      </SettingsGroup>
    );
    if (matchesSearch('Account Personal Information Password Payment Methods Addresses')) {
      list.push({ key: 'account', header: 'Account', items: accountItems });
    }

    // Preferences
    const prefItems = (
      <SettingsGroup>
        <SettingsCell
          icon="swap-horizontal-outline"
          iconColor={Colors.brand}
          title="Currency Display"
          value={displayModeLabel}
          isFirst
          onPress={cycleDisplayMode}
        />
        <SettingsCell
          icon="globe-outline"
          iconColor="#64B5F6"
          title="Local Currency"
          value={`${currencyCode} (${CURRENCIES[currencyCode].symbol})`}
          onPress={() => setCurrencyPickerVisible(true)}
        />
        <SettingsCell
          icon="color-palette-outline"
          iconColor="#BB86FC"
          title="Theme"
          value={getThemePreferenceLabel(themePreference)}
          onPress={() => setThemePickerVisible(true)}
        />
        <SettingsCell
          icon="language-outline"
          iconColor="#FFD700"
          title="Language"
          value={selectedLanguage}
          isLast
          onPress={() => setLanguagePickerVisible(true)}
        />
      </SettingsGroup>
    );
    if (matchesSearch('Preferences Currency Local Currency Theme Language')) {
      list.push({ key: 'preferences', header: 'Preferences', items: prefItems });
    }

    // Commerce
    const commerceItems = (
      <SettingsGroup>
        <SettingsCell
          icon="wallet-outline"
          iconColor={Colors.success}
          title="Payout Method"
          value="Bank •••• 4242"
          isFirst
          onPress={() => navigation.navigate('Payments')}
        />
        <SettingsCell
          icon="cube-outline"
          iconColor="#FF9800"
          title="Shipping Profiles"
          value="2 saved"
          isLast
          onPress={() => navigation.navigate('Postage')}
        />
      </SettingsGroup>
    );
    if (matchesSearch('Commerce Payout Method Shipping Profiles')) {
      list.push({ key: 'commerce', header: 'Commerce', items: commerceItems });
    }

    // Closet
    const closetItems = (
      <SettingsGroup>
        <SettingsCell
          icon="shirt-outline"
          iconColor={Colors.brand}
          title="Closet"
          subtitle="Saved, Wishlist & Collections"
          isFirst
          isLast
          onPress={() => navigation.navigate('Closet')}
        />
      </SettingsGroup>
    );
    if (matchesSearch('Closet Saved Wishlist Collections')) {
      list.push({ key: 'closet', header: 'Closet', items: closetItems });
    }

    // Notifications
    const notifItems = (
      <SettingsGroup>
        <SettingsCell
          icon="notifications-outline"
          iconColor={Colors.brand}
          title="Push Notifications"
          subtitle={pushNotificationsSubtitle}
          isFirst
          onPress={() => navigation.navigate('PushNotifications')}
        />
        <SettingsCell
          icon="mail-outline"
          iconColor="#4CAF50"
          title="Email Notifications"
          variant="toggle"
          toggleValue={emailNotificationsEnabled}
          onToggle={handleToggleEmailNotifications}
          isLast
        />
      </SettingsGroup>
    );
    if (matchesSearch('Notifications Push Email')) {
      list.push({ key: 'notifications', header: 'Notifications', items: notifItems });
    }

    // Security
    const securityItems = (
      <SettingsGroup>
        <SettingsCell
          icon="lock-closed-outline"
          iconColor={Colors.success}
          title="Two-Factor Authentication"
          value="Off"
          isFirst
          onPress={() => navigation.navigate('TwoFactorSetup')}
        />
        <SettingsCell
          icon="phone-portrait-outline"
          iconColor={Colors.brand}
          title="Active Devices"
          value="3 devices"
          isLast
          onPress={() => navigation.navigate('AccountSettings')}
        />
      </SettingsGroup>
    );
    if (matchesSearch('Security Two-Factor Active Devices')) {
      list.push({
        key: 'security',
        header: 'Security',
        footer: 'Secure your account with additional protection.',
        items: securityItems,
      });
    }

    // Storage
    const storageItems = (
      <SettingsGroup>
        <SettingsCell
          icon="cloud-download-outline"
          iconColor={Colors.brand}
          title="Manage Downloads"
          isFirst
          onPress={() => {}}
        />
        <SettingsCell
          icon="trash-outline"
          iconColor={Colors.danger}
          title="Clear Cache"
          value="180 MB"
          isLast
          onPress={handleClearCache}
        />
      </SettingsGroup>
    );
    if (matchesSearch('Storage Manage Downloads Clear Cache')) {
      list.push({
        key: 'storage',
        header: 'Storage',
        footer: 'Clear cached images and downloaded content.',
        items: storageItems,
      });
    }

    // Support
    const supportItems = (
      <SettingsGroup>
        <SettingsCell
          icon="help-circle-outline"
          iconColor={Colors.brand}
          title="Help & Support"
          subtitle="FAQs, contact us, and more"
          isFirst
          onPress={() => navigation.navigate('HelpSupport')}
        />
        <SettingsCell
          icon="document-text-outline"
          iconColor="#a0a0a0"
          title="Terms of Service"
          onPress={() => void handleOpenExternal('https://thryftverse.app/terms')}
        />
        <SettingsCell
          icon="shield-checkmark-outline"
          iconColor="#a0a0a0"
          title="Privacy Policy"
          isLast
          onPress={() => void handleOpenExternal('https://thryftverse.app/privacy')}
        />
      </SettingsGroup>
    );
    if (matchesSearch('Support Help Terms Privacy')) {
      list.push({
        key: 'support',
        header: 'Support',
        footer: 'By using ThryftVerse, you agree to our Terms of Service and Privacy Policy.',
        items: supportItems,
      });
    }

    return list;
  }, [
    user.username,
    displayModeLabel,
    currencyCode,
    themePreference,
    selectedLanguage,
    pushNotificationsSubtitle,
    emailNotificationsEnabled,
    searchQuery,
    handleToggleEmailNotifications,
    handleOpenExternal,
    handleClearCache,
    navigation,
    cycleDisplayMode,
  ]);

  const hasResults = sections.length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={Colors.background}
      />

      {/* Header */}
      <View style={styles.header}>
        <AnimatedPressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityLabel={t('settings.a11y.goBack')}
          accessibilityRole="button"
          accessibilityHint="Returns to the previous screen"
          scaleValue={0.92}
          hapticFeedback="light"
        >
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </AnimatedPressable>
        <View>
          <Text style={styles.headerLabel}>{t('settings.header.preferences')}</Text>
          <Text style={styles.hugeTitle}>{t('settings.header.title')}</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Profile Preview Card */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
          <AppCard variant="elevated" style={styles.profileCard}>
            <AnimatedPressable
              onPress={() => navigation.navigate('EditProfile')}
              activeOpacity={0.85}
              scaleValue={0.98}
              hapticFeedback="light"
              style={styles.profileRow}
            >
              <CachedImage
                uri={avatarUri}
                style={styles.profileAvatar}
                containerStyle={styles.profileAvatarWrap}
                contentFit="cover"
              />
              <View style={styles.profileText}>
                <Text style={styles.profileName}>{displayName}</Text>
                <Text style={styles.profileMeta}>{reputationLabel}</Text>
                {user.isVerified && (
                  <View style={styles.verifiedRow}>
                    <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                    <Text style={styles.verifiedLabel}>Verified</Text>
                  </View>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </AnimatedPressable>
          </AppCard>
        </Reanimated.View>

        {/* Search */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(80)} style={styles.searchWrap}>
          <View style={styles.searchInputRow}>
            <Ionicons name="search-outline" size={18} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search settings..."
              placeholderTextColor={Colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              accessibilityLabel="Search settings"
              accessibilityRole="search"
            />
            {searchQuery.length > 0 && (
              <AnimatedPressable onPress={() => setSearchQuery('')} hapticFeedback="light">
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </AnimatedPressable>
            )}
          </View>
        </Reanimated.View>

        {/* Sections */}
        {hasResults ? (
          sections.map((section, idx) => (
            <Reanimated.View
              key={section.key}
              entering={FadeInDown.duration(350).delay(120 + idx * 60)}
            >
              <SettingsSectionHeader title={section.header} />
              {section.items}
              {section.footer ? (
                <SettingsSectionFooter text={section.footer} />
              ) : null}
            </Reanimated.View>
          ))
        ) : (
          <View style={styles.emptySearch}>
            <Ionicons name="search-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptySearchText}>No settings found</Text>
          </View>
        )}

        {/* Logout */}
        {matchesSearch('Log Out') && (
          <Reanimated.View entering={FadeInDown.duration(350).delay(120 + sections.length * 60)}>
            <SettingsGroup style={{ marginTop: Space.sm }}>
              <SettingsCell
                variant="destructive"
                title="Log Out"
                isFirst
                isLast
                onPress={handleLogout}
                accessibilityHint="Signs you out of your account"
              />
            </SettingsGroup>
          </Reanimated.View>
        )}

        {/* Version */}
        <Text style={styles.versionText}>{t('settings.version', { version: '1.0.0' })}</Text>
      </ScrollView>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md - Space.xs,
    paddingVertical: Space.md - Space.xs,
    gap: 14,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerLabel: {
    fontSize: Type.meta.size,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
    letterSpacing: Type.meta.letterSpacing,
    marginBottom: 2,
  },
  hugeTitle: {
    fontSize: Type.title.size,
    fontFamily: 'Inter_700Bold',
    color: Colors.textPrimary,
    letterSpacing: Type.title.letterSpacing,
    lineHeight: Type.title.lineHeight,
  },
  scrollContent: {
    padding: Space.md,
    paddingBottom: Space.xl,
  },

  // Profile card
  profileCard: {
    marginBottom: Space.md,
    padding: Space.md,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileAvatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    marginRight: Space.sm,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  profileText: {
    flex: 1,
  },
  profileName: {
    fontSize: Type.subtitle.size,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textPrimary,
    letterSpacing: Type.subtitle.letterSpacing,
    lineHeight: Type.subtitle.lineHeight,
  },
  profileMeta: {
    fontSize: Type.caption.size,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    marginTop: 2,
    letterSpacing: Type.caption.letterSpacing,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  verifiedLabel: {
    fontSize: Type.meta.size,
    fontFamily: 'Inter_500Medium',
    color: Colors.success,
    letterSpacing: Type.meta.letterSpacing,
  },

  // Search
  searchWrap: {
    marginBottom: Space.md,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Space.sm + Space.xs,
    paddingVertical: Space.sm,
    gap: Space.xs + Space.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: 'Inter_400Regular',
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
    paddingVertical: 0,
  },

  // Empty search
  emptySearch: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xl,
    gap: Space.sm,
  },
  emptySearchText: {
    fontSize: Type.body.size,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
    letterSpacing: Type.body.letterSpacing,
  },

  // Version
  versionText: {
    textAlign: 'center',
    color: Colors.textMuted,
    fontSize: Type.caption.size,
    fontFamily: 'Inter_400Regular',
    marginTop: Space.lg,
    letterSpacing: Type.caption.letterSpacing,
  },
});
