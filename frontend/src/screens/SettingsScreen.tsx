import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Linking,
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
import { clearImageCache } from '../utils/imagePreloader';
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
import { AvatarRing } from '../components/chat/AvatarRing';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppSearchBar } from '../components/ui/AppSearchBar';
import { Typography } from '../constants/typography';

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

  const handleClearCache = React.useCallback(async () => {
    try {
      await clearImageCache();
      show('Cache cleared', 'success');
    } catch {
      show('Failed to clear cache', 'error');
    }
  }, [show]);

  // Profile preview data — use real user only, no mock fallback for authenticated users
  const user = currentUser;
  const avatarUri = userAvatar || user?.avatar || null;
  const displayName = user?.username ?? 'Not signed in';
  const hasRealReputation = user != null && ((user as any).rating != null || (user as any).reviewCount != null);
  const reputationLabel = hasRealReputation
    ? `${(user as any).rating?.toFixed(1) ?? '0.0'} · ${(user as any).reviewCount ?? 0} reviews`
    : null;

  // Search filter helper
  const matchesSearch = (text: string) => {
    if (!searchQuery.trim()) return true;
    return text.toLowerCase().includes(searchQuery.toLowerCase().trim());
  };

  // Build sections as renderable content — 4 card groups
  const sections: SettingsSectionDef[] = React.useMemo(() => {
    const list: SettingsSectionDef[] = [];

    // IDENTITY CARD
    const identityItems = (
      <SettingsGroup>
        <SettingsCell
          icon="person-outline"
          iconColor={Colors.textPrimary}
          title="Personal Information"
          value={user?.username ?? 'Not signed in'}
          isFirst
          onPress={() => navigation.navigate('EditProfile')}
        />
        <SettingsCell
          icon="location-outline"
          iconColor={Colors.textPrimary}
          title="Addresses"
          value={savedAddress ? 'Manage' : 'None'}
          onPress={() => navigation.navigate('AccountSettings')}
        />
        <SettingsCell
          icon="shirt-outline"
          iconColor={Colors.textPrimary}
          title="Closet"
          subtitle="Saved, Wishlist & Collections"
          isLast
          onPress={() => navigation.navigate('Closet')}
        />
      </SettingsGroup>
    );
    if (matchesSearch('Identity Personal Information Addresses Closet')) {
      list.push({ key: 'identity', header: 'Identity', items: identityItems });
    }

    // COMMERCE CARD
    const commerceItems = (
      <SettingsGroup>
        <SettingsCell
          icon="card-outline"
          iconColor={Colors.brand}
          title="Payment Methods"
          value={savedPaymentMethod ? 'Manage' : 'None'}
          isFirst
          onPress={() => navigation.navigate('Payments')}
        />
        <SettingsCell
          icon="wallet-outline"
          iconColor={Colors.brand}
          title="Payout Method"
          value={savedPaymentMethod ? 'Manage' : 'None'}
          onPress={() => navigation.navigate('Payments')}
        />
        <SettingsCell
          icon="cube-outline"
          iconColor={Colors.brand}
          title="Shipping Profiles"
          value="Manage"
          isLast
          onPress={() => navigation.navigate('Postage')}
        />
      </SettingsGroup>
    );
    if (matchesSearch('Commerce Payment Methods Payout Method Shipping Profiles')) {
      list.push({ key: 'commerce', header: 'Commerce', items: commerceItems });
    }

    // SECURITY CARD
    const securityItems = (
      <SettingsGroup>
        <SettingsCell
          icon="lock-closed-outline"
          iconColor={Colors.brand}
          title="Password"
          value="••••••••"
          isFirst
          onPress={() => navigation.navigate('ChangePassword')}
        />
        <SettingsCell
          icon="shield-checkmark-outline"
          iconColor={Colors.brand}
          title="Two-Factor Authentication"
          value={twoFactorEnabled ? 'On' : 'Off'}
          onPress={() => navigation.navigate('TwoFactorSetup')}
        />
        <SettingsCell
          icon="phone-portrait-outline"
          iconColor={Colors.brand}
          title="Active Devices"
          value="Manage"
          isLast
          onPress={() => navigation.navigate('AccountSettings')}
        />
      </SettingsGroup>
    );
    if (matchesSearch('Security Password Two-Factor Active Devices')) {
      list.push({ key: 'security', header: 'Security', items: securityItems });
    }

    // PREFERENCES CARD
    const prefItems = (
      <SettingsGroup>
        <SettingsCell
          icon="swap-horizontal-outline"
          title="Currency Display"
          value={displayModeLabel}
          isFirst
          onPress={cycleDisplayMode}
        />
        <SettingsCell
          icon="globe-outline"
          title="Local Currency"
          value={`${currencyCode} (${CURRENCIES[currencyCode].symbol})`}
          onPress={() => setCurrencyPickerVisible(true)}
        />
        <SettingsCell
          icon="color-palette-outline"
          title="Theme"
          value={getThemePreferenceLabel(themePreference)}
          onPress={() => setThemePickerVisible(true)}
        />
        <SettingsCell
          icon="language-outline"
          title="Language"
          value={selectedLanguage}
          onPress={() => setLanguagePickerVisible(true)}
        />
        <SettingsCell
          icon="notifications-outline"
          title="Push Notifications"
          subtitle={pushNotificationsSubtitle}
          onPress={() => navigation.navigate('PushNotifications')}
        />
        <SettingsCell
          icon="mail-outline"
          title="Email Notifications"
          variant="toggle"
          toggleValue={emailNotificationsEnabled}
          onToggle={handleToggleEmailNotifications}
          isLast
        />
      </SettingsGroup>
    );
    if (matchesSearch('Preferences Currency Local Currency Theme Language Notifications Push Email')) {
      list.push({ key: 'preferences', header: 'Preferences', items: prefItems });
    }

    // SUPPORT CARD
    const supportItems = (
      <SettingsGroup>
        <SettingsCell
          icon="help-circle-outline"
          title="Help & Support"
          subtitle="FAQs, contact us, and more"
          isFirst
          onPress={() => navigation.navigate('HelpSupport')}
        />
        <SettingsCell
          icon="document-text-outline"
          title="Terms of Service"
          onPress={() => void handleOpenExternal('https://thryftverse.app/terms')}
        />
        <SettingsCell
          icon="shield-checkmark-outline"
          title="Privacy Policy"
          isLast
          onPress={() => void handleOpenExternal('https://thryftverse.app/privacy')}
        />
      </SettingsGroup>
    );
    if (matchesSearch('Support Help Terms Privacy')) {
      list.push({ key: 'support', header: 'Support', items: supportItems });
    }

    return list;
  }, [
    user?.username,
    savedPaymentMethod,
    savedAddress,
    displayModeLabel,
    currencyCode,
    themePreference,
    selectedLanguage,
    pushNotificationsSubtitle,
    emailNotificationsEnabled,
    twoFactorEnabled,
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
          <View style={styles.profileCard}>
            <AnimatedPressable
              onPress={() => navigation.navigate('EditProfile')}
              activeOpacity={0.85}
              scaleValue={0.98}
              hapticFeedback="light"
              style={styles.profileRow}
            >
              <AvatarRing
                uri={avatarUri ?? undefined}
                size={56}
                isUnread={(user as any)?.isVerified ?? false}
                ringWidth={2}
              />
              <View style={styles.profileText}>
                <Text style={styles.profileName}>{displayName}</Text>
                {reputationLabel ? <Text style={styles.profileMeta}>{reputationLabel}</Text> : null}
                {(user as any)?.isVerified && (
                  <View style={styles.verifiedRow}>
                    <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                    <Text style={styles.verifiedLabel}>Verified</Text>
                  </View>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </AnimatedPressable>
          </View>
        </Reanimated.View>

        {/* Search */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(80)} style={styles.searchWrap}>
          <AppSearchBar
            placeholder="Search settings..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            containerStyle={{ borderRadius: Radius.full, backgroundColor: Colors.surfaceAlt }}
          />
        </Reanimated.View>

        {/* Sections */}
        {hasResults ? (
          sections.map((section, idx) => {
            const importanceMap: Record<string, 'high' | 'medium' | 'low' | 'lowest'> = {
              identity: 'high',
              commerce: 'medium',
              security: 'medium',
              preferences: 'low',
              support: 'lowest',
            };
            return (
              <Reanimated.View
                key={section.key}
                entering={FadeInDown.duration(350).delay(120 + idx * 60)}
              >
                <SettingsSectionHeader title={section.header} importance={importanceMap[section.key] ?? 'medium'} />
                {section.items}
                {section.footer ? (
                  <SettingsSectionFooter text={section.footer} />
                ) : null}
              </Reanimated.View>
            );
          })
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
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    letterSpacing: Type.meta.letterSpacing,
    marginBottom: 2,
  },
  hugeTitle: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: Type.title.letterSpacing,
    lineHeight: Type.title.lineHeight,
  },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
  },

  // Profile card
  profileCard: {
    marginBottom: Space.md,
    padding: Space.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
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
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    letterSpacing: Type.subtitle.letterSpacing,
    lineHeight: Type.subtitle.lineHeight,
  },
  profileMeta: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
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
    fontFamily: Typography.family.medium,
    color: Colors.success,
    letterSpacing: Type.meta.letterSpacing,
  },

  // Search
  searchWrap: {
    marginBottom: Space.md,
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
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
    letterSpacing: Type.body.letterSpacing,
  },

  // Version
  versionText: {
    textAlign: 'center',
    color: Colors.textMuted,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginTop: Space.lg,
    letterSpacing: Type.caption.letterSpacing,
  },
});
