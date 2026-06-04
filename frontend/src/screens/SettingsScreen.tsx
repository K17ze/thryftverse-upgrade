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
import { CachedImage } from '../components/CachedImage';
import { PremiumToggle } from '../components/PremiumToggle';
import {
  getStoredThemePreference,
  getThemePreferenceLabel,
  ThemePreference,
  updateThemePreference,
} from '../theme/themePreference';
import { t } from '../i18n';
import { Space, Radius, Type } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppSearchBar } from '../components/ui/AppSearchBar';
import { Typography } from '../constants/typography';

type Props = StackScreenProps<RootStackParamList, 'Settings'>;

interface RowDef {
  key: string;
  icon: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  toggleValue?: boolean;
  onToggle?: (v: boolean) => void;
}

function CommandRow({
  icon,
  iconColor,
  title,
  subtitle,
  value,
  onPress,
  toggleValue,
  onToggle,
  isFirst,
  isLast,
}: RowDef & { isFirst?: boolean; isLast?: boolean }) {
  return (
    <AnimatedPressable
      onPress={onPress}
      activeOpacity={0.75}
      scaleValue={0.995}
      hapticFeedback="light"
      disabled={!onPress && !onToggle}
    >
      <View style={[styles.rowRoot, !isLast && styles.rowBorder]}>
        <View style={styles.rowIconWrap}>
          <Ionicons name={icon as any} size={22} color={iconColor ?? Colors.textPrimary} />
        </View>
        <View style={styles.rowTextWrap}>
          <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <View style={styles.rowRight}>
          {value ? <Text style={styles.rowValue} numberOfLines={1}>{value}</Text> : null}
          {onToggle ? (
            <PremiumToggle value={!!toggleValue} onValueChange={onToggle} />
          ) : onPress ? (
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          ) : null}
        </View>
      </View>
    </AnimatedPressable>
  );
}

function SectionDivider() {
  return <View style={styles.sectionDivider} />;
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
    getStoredThemePreference().then(setThemePreference).catch(() => {});
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

  const user = currentUser;
  const avatarUri = userAvatar || user?.avatar || null;
  const displayName = user?.username ?? 'Not signed in';
  const hasRealReputation = user != null && ((user as any).rating != null || (user as any).reviewCount != null);
  const reputationLabel = hasRealReputation
    ? `${(user as any).rating?.toFixed(1) ?? '0.0'} · ${(user as any).reviewCount ?? 0} reviews`
    : null;

  const matchesSearch = (text: string) => {
    if (!searchQuery.trim()) return true;
    return text.toLowerCase().includes(searchQuery.toLowerCase().trim());
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={Colors.background}
      />

      {/* ── Top Bar ── */}
      <View style={styles.topBar}>
        <AnimatedPressable
          onPress={() => navigation.goBack()}
          style={styles.topBarBack}
          scaleValue={0.92}
          hapticFeedback="light"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.topBarTitle}>Settings</Text>
        <View style={styles.topBarBack} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Search ── */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(0)} style={styles.searchWrap}>
          <AppSearchBar
            placeholder="Search settings"
            value={searchQuery}
            onChangeText={setSearchQuery}
            containerStyle={styles.searchField}
          />
        </Reanimated.View>

        {/* ── Account Centre / Identity Card ── */}
        {matchesSearch('Account Centre Personal Information') && (
          <Reanimated.View entering={FadeInDown.duration(300).delay(40)}>
            <Text style={styles.sectionLabel}>Account Centre</Text>
            <View style={styles.identityCard}>
              <AnimatedPressable
                onPress={() => navigation.navigate('EditProfile')}
                activeOpacity={0.85}
                scaleValue={0.98}
                hapticFeedback="light"
                style={styles.identityRow}
              >
                {avatarUri ? (
                  <AnimatedPressable style={styles.identityAvatar} onPress={() => navigation.navigate('EditProfile')}>
                    <CachedImage uri={avatarUri} style={styles.identityAvatarImage} contentFit="cover" />
                  </AnimatedPressable>
                ) : (
                  <View style={styles.identityAvatarCircle}>
                    <Text style={styles.identityAvatarInitial}>{displayName.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.identityText}>
                  <Text style={styles.identityName}>{displayName}</Text>
                  {reputationLabel ? (
                    <Text style={styles.identityMeta}>{reputationLabel}</Text>
                  ) : (
                    <Text style={styles.identityMeta}>Manage your account details, privacy and security</Text>
                  )}
                  {(user as any)?.isVerified && (
                    <View style={styles.verifiedRow}>
                      <Ionicons name="checkmark-circle" size={12} color={Colors.success} />
                      <Text style={styles.verifiedLabel}>Verified</Text>
                    </View>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </AnimatedPressable>

              <View style={styles.identityDivider} />

              <CommandRow
                key="personal-info"
                icon="person-outline"
                title="Personal Information"
                value={user?.username ?? 'Not signed in'}
                onPress={() => navigation.navigate('EditProfile')}
                isFirst
              />
              <CommandRow
                key="addresses"
                icon="location-outline"
                title="Addresses"
                value={savedAddress ? 'Manage' : 'None'}
                onPress={() => navigation.navigate('Postage')}
              />
              <CommandRow
                key="closet"
                icon="shirt-outline"
                title="Closet"
                subtitle="Saved, Wishlist & Collections"
                onPress={() => navigation.navigate('Closet')}
                isLast
              />
            </View>
          </Reanimated.View>
        )}

        {/* ── Commerce / Seller Hub ── */}
        {matchesSearch('Commerce Seller Hub Balance Wallet Payments Shipping Payouts') && (
          <Reanimated.View entering={FadeInDown.duration(300).delay(80)}>
            <Text style={styles.sectionLabel}>Seller Hub</Text>
            <View style={styles.rowGroup}>
              <CommandRow
                key="balance"
                icon="wallet-outline"
                iconColor={Colors.brand}
                title="Balance & Wallet"
                value="Manage"
                onPress={() => navigation.navigate('Wallet')}
                isFirst
              />
              <CommandRow
                key="payments"
                icon="card-outline"
                iconColor={Colors.brand}
                title="Payment Methods"
                value={savedPaymentMethod ? 'Manage' : 'None'}
                onPress={() => navigation.navigate('Payments')}
              />
              <CommandRow
                key="payouts"
                icon="cash-outline"
                iconColor={Colors.brand}
                title="Payouts"
                value="Manage"
                onPress={() => navigation.navigate('BalanceHistory')}
              />
              <CommandRow
                key="shipping"
                icon="cube-outline"
                iconColor={Colors.brand}
                title="Shipping"
                value="Manage"
                onPress={() => navigation.navigate('Postage')}
                isLast
              />
            </View>
          </Reanimated.View>
        )}

        {/* ── Trust & Security ── */}
        {matchesSearch('Trust Security Password 2FA Devices Sessions Blocked Privacy') && (
          <Reanimated.View entering={FadeInDown.duration(300).delay(120)}>
            <Text style={styles.sectionLabel}>Trust & Security</Text>
            <View style={styles.rowGroup}>
              <CommandRow
                key="account-details"
                icon="person-circle-outline"
                title="Account Details"
                value="View"
                onPress={() => navigation.navigate('AccountSettings')}
                isFirst
              />
              <CommandRow
                key="password"
                icon="lock-closed-outline"
                title="Password"
                value="••••••••"
                onPress={() => navigation.navigate('ChangePassword')}
              />
              <CommandRow
                key="2fa"
                icon="shield-checkmark-outline"
                title="Two-Factor Authentication"
                value={twoFactorEnabled ? 'On' : 'Off'}
                onPress={() => navigation.navigate('TwoFactorSetup')}
              />
              <CommandRow
                key="devices"
                icon="phone-portrait-outline"
                title="Devices & Sessions"
                value="Manage"
                onPress={() => navigation.navigate('ActiveSessions')}
              />
              <CommandRow
                key="blocked"
                icon="ban-outline"
                title="Blocked Users"
                value="View"
                onPress={() => navigation.navigate('BlockedUsers')}
              />
              <CommandRow
                key="privacy"
                icon="eye-outline"
                title="Privacy Controls"
                value="Manage"
                onPress={() => navigation.navigate('PrivacySettings')}
                isLast
              />
            </View>
          </Reanimated.View>
        )}

        {/* ── Preferences ── */}
        {matchesSearch('Preferences Currency Language Theme Notifications Personalisation') && (
          <Reanimated.View entering={FadeInDown.duration(300).delay(160)}>
            <Text style={styles.sectionLabel}>Preferences</Text>
            <View style={styles.rowGroup}>
              <CommandRow
                key="currency-display"
                icon="swap-horizontal-outline"
                title="Currency Display"
                value={displayModeLabel}
                onPress={cycleDisplayMode}
                isFirst
              />
              <CommandRow
                key="local-currency"
                icon="globe-outline"
                title="Local Currency"
                value={`${currencyCode} (${CURRENCIES[currencyCode].symbol})`}
                onPress={() => setCurrencyPickerVisible(true)}
              />
              <CommandRow
                key="theme"
                icon="color-palette-outline"
                title="Theme"
                value={getThemePreferenceLabel(themePreference)}
                onPress={() => setThemePickerVisible(true)}
              />
              <CommandRow
                key="language"
                icon="language-outline"
                title="Language"
                value={selectedLanguage}
                onPress={() => setLanguagePickerVisible(true)}
              />
              <CommandRow
                key="personalisation"
                icon="options-outline"
                title="Personalisation"
                subtitle="Content preferences and recommendations"
                onPress={() => navigation.navigate('Personalisation')}
              />
              <CommandRow
                key="push"
                icon="notifications-outline"
                title="Push Notifications"
                subtitle={pushNotificationsSubtitle}
                onPress={() => navigation.navigate('PushNotifications')}
              />
              <CommandRow
                key="email"
                icon="mail-outline"
                title="Email Notifications"
                toggleValue={emailNotificationsEnabled}
                onToggle={handleToggleEmailNotifications}
                isLast
              />
            </View>
          </Reanimated.View>
        )}

        {/* ── Support ── */}
        {matchesSearch('Support Help Terms Privacy About') && (
          <Reanimated.View entering={FadeInDown.duration(300).delay(200)}>
            <Text style={styles.sectionLabel}>Support</Text>
            <View style={styles.rowGroup}>
              <CommandRow
                key="help"
                icon="help-circle-outline"
                title="Help Centre"
                subtitle="FAQs, contact us, and more"
                onPress={() => navigation.navigate('HelpSupport')}
                isFirst
              />
              <CommandRow
                key="terms"
                icon="document-text-outline"
                title="Terms of Service"
                onPress={() => void handleOpenExternal('https://thryftverse.app/terms')}
              />
              <CommandRow
                key="privacy-policy"
                icon="shield-checkmark-outline"
                title="Privacy Policy"
                onPress={() => void handleOpenExternal('https://thryftverse.app/privacy')}
              />
              <CommandRow
                key="about"
                icon="information-circle-outline"
                title="About Thryftverse"
                value="v1.0.0"
                onPress={() => navigation.navigate('About')}
                isLast
              />
            </View>
          </Reanimated.View>
        )}

        {/* ── Logout ── */}
        {matchesSearch('Log Out') && (
          <Reanimated.View entering={FadeInDown.duration(300).delay(240)} style={{ marginTop: Space.md }}>
            <AnimatedPressable onPress={handleLogout} activeOpacity={0.8} scaleValue={0.98} hapticFeedback="medium">
              <View style={styles.logoutRow}>
                <Ionicons name="log-out-outline" size={22} color={Colors.danger} />
                <Text style={styles.logoutText}>Log Out</Text>
              </View>
            </AnimatedPressable>
          </Reanimated.View>
        )}

        <View style={{ height: Space.xl }} />
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 4,
  },
  topBarBack: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: Type.subtitle.letterSpacing,
    lineHeight: Type.subtitle.lineHeight,
  },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
  },

  // Search
  searchWrap: {
    marginBottom: Space.lg,
  },
  searchField: {
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    height: 48,
  },

  // Section labels
  sectionLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginBottom: Space.sm + 4,
    marginTop: Space.lg,
    letterSpacing: Type.body.letterSpacing,
  },

  // Identity card
  identityCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: Space.sm,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Space.md,
    gap: Space.sm + 4,
  },
  identityAvatar: {},
  identityAvatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.surfaceAlt,
  },
  identityAvatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  identityAvatarInitial: {
    fontSize: 20,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  identityText: {
    flex: 1,
  },
  identityName: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    letterSpacing: Type.subtitle.letterSpacing,
    lineHeight: Type.subtitle.lineHeight,
  },
  identityMeta: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    marginTop: 2,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
  identityDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginHorizontal: Space.md,
  },

  // Row group
  rowGroup: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: Space.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  rowRoot: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Space.md,
    minHeight: 56,
    gap: Space.sm + 4,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rowIconWrap: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
    lineHeight: Type.body.lineHeight,
  },
  rowSubtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 2,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  rowValue: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    maxWidth: 140,
    letterSpacing: Type.body.letterSpacing,
  },

  // Verified
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  verifiedLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: Colors.success,
    letterSpacing: Type.meta.letterSpacing,
  },

  // Section divider
  sectionDivider: {
    height: 8,
    backgroundColor: Colors.border,
    marginVertical: Space.sm,
  },

  // Logout
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 4,
    paddingVertical: 14,
    paddingHorizontal: Space.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
  },
  logoutText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.danger,
    letterSpacing: Type.body.letterSpacing,
  },
});
