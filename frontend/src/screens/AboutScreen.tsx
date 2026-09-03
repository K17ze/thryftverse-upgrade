import React, { useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Linking,
  Pressable,
  Share,
  Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useSettingsPreferences } from '../context/SettingsPreferencesContext';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';

import { Space, Radius } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { AppIcon } from '../components/common/AppIcon';
import { IconSize } from '../theme/iconTokens';
type Props = NativeStackScreenProps<RootStackParamList, 'About'>;

// Number of taps on the version row required to toggle developer mode.
const DEVELOPER_MODE_TAP_THRESHOLD = 7;
// Reset the tap counter after this many milliseconds of inactivity.
const DEVELOPER_MODE_TAP_RESET_MS = 1500;

export default function AboutScreen({ navigation }: Props) {
  const { show } = useToast();
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { developerMode, setDeveloperMode } = useSettingsPreferences();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const versionTapCountRef = useRef(0);
  const lastVersionTapRef = useRef(0);

  const handleVersionTap = () => {
    const now = Date.now();
    // Reset the counter if too much time has passed since the last tap.
    if (now - lastVersionTapRef.current > DEVELOPER_MODE_TAP_RESET_MS) {
      versionTapCountRef.current = 0;
    }
    lastVersionTapRef.current = now;
    versionTapCountRef.current += 1;

    // Light haptic on each tap toward the threshold for tactile feedback.
    haptic.light();

    if (versionTapCountRef.current >= DEVELOPER_MODE_TAP_THRESHOLD) {
      versionTapCountRef.current = 0;
      const nextMode = !developerMode;
      setDeveloperMode(nextMode);
      haptic.medium();
      show(
        nextMode
          ? 'Developer mode enabled — Advanced & developer settings are now visible.'
          : 'Developer mode disabled.',
        nextMode ? 'success' : 'info',
      );
    }
  };

  const handleOpenExternal = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      show('Unable to open link', 'error');
    }
  };

  const handleShareApp = async () => {
    haptic.light();
    try {
      await Share.share({
        message: 'Check out Thryftverse — the marketplace for second-hand fashion. https://thryftverse.app',
        title: 'Thryftverse' });
    } catch {}
  };

  const handleRateApp = () => {
    haptic.light();
    const url = Platform.OS === 'ios'
      ? 'itms-apps://itunes.apple.com/app/id thryftverse?action=write-review'
      : 'market://details?id=com.thryftverse.app';
    void handleOpenExternal(url);
  };

  return (
    <FlagshipScreen header={<FlagshipHeader title="About" subtitle="Thryftverse app information" onBack={() => navigation.goBack()} />}>
        {/* Hero summary — brand identity. Tapping the version row 7 times
            toggles developer mode, which reveals the "Advanced & developer"
            section in Settings. The tap target is intentionally undiscoverable
            so ordinary consumers never encounter developer tooling. */}
        <View style={styles.heroCard}>
          <View style={styles.heroRow}>
            <View style={styles.brandIcon}>
              <AppIcon name="storefront" size={IconSize.hero} color="brand" opticalCenter accessible={false} />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.brandName}>Thryftverse</Text>
              <Pressable
                onPress={handleVersionTap}
                accessibilityRole="text"
                accessibilityLabel="Thryftverse version"
                hitSlop={8}
              >
                <Text style={styles.brandVersion}>
                  Version 1.0.0 (Build 2026.06.05)
                  {developerMode ? ' · Developer' : ''}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        <SettingsSection title="Legal">
          <SettingsRow icon="document" title="Terms of Service" onPress={() => void handleOpenExternal('https://thryftverse.app/terms')} />
          <SettingsRow icon="lock" title="Privacy Policy" onPress={() => void handleOpenExternal('https://thryftverse.app/privacy')} />
          <SettingsRow icon="document" title="Cookie Policy" onPress={() => void handleOpenExternal('https://thryftverse.app/cookies')} isLast />
        </SettingsSection>

        <SettingsSection title="Support">
          <SettingsRow icon="help" title="Help Centre" onPress={() => navigation.navigate('HelpSupport')} />
          <SettingsRow icon="star" title="Rate Thryftverse" onPress={handleRateApp} />
          <SettingsRow icon="share" title="Share with friends" onPress={() => void handleShareApp()} isLast />
        </SettingsSection>

        <View style={{ height: Space.xl }} />
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  heroCard: {
    alignItems: 'center',
    marginVertical: Space.lg },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md },
  heroText: {
    flex: 1 },
  brandIcon: {
    width: Space.xl + Space.xl,
    height: Space.xl + Space.xl,
    borderRadius: Radius.lg,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center' },
  brandName: {
    fontSize: TypographyV2.screenTitle.size,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.screenTitle.letterSpacing },
  brandVersion: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: Space.xs - 2 } });
}