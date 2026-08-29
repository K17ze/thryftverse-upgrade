import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Space, FontFamily } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import { changePassword } from '../services/authApi';
import { haptics } from '../utils/haptics';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppInput } from '../components/ui/AppInput';
import { PasswordStrengthBar } from '../components/settings/PasswordStrengthBar';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { FlagshipScreen, FlagshipHeader, FlagshipStickyFooter, FlagshipFormSection } from '../components/flagship';

export default function ChangePasswordScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { show } = useToast();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const twoFactorEnabled = useStore((s) => s.twoFactorEnabled);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSecure, setIsSecure] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const handleUpdate = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      haptics.error();
      show('Fill in all fields', 'error');
      return;
    }
    if (newPassword.length < 8) {
      haptics.error();
      show('New password must be at least 8 characters', 'error');
      return;
    }
    if (currentPassword === newPassword) {
      haptics.error();
      show('New password must be different from current password', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      haptics.error();
      show('New passwords do not match', 'error');
      return;
    }
    setIsUpdating(true);
    try {
      await changePassword({ currentPassword, newPassword });
      haptics.success();
      show('Password updated successfully', 'success');
      navigation.goBack();
    } catch (error: unknown) {
      haptics.error();
      show(error instanceof Error ? error.message : 'Unable to change password', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const eyeIcon = (
    <AnimatedPressable onPress={() => setIsSecure(!isSecure)} hitSlop={10} accessibilityRole="button" accessibilityLabel={isSecure ? 'Show passwords' : 'Hide passwords'}>
      <Ionicons
        name={isSecure ? 'eye-off-outline' : 'eye-outline'}
        size={20}
        color={colors.textSecondary}
      />
    </AnimatedPressable>
  );

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Change Password" onBack={() => navigation.goBack()} />}
      keyboardAvoiding
      stickyFooter={
        <FlagshipStickyFooter
          actions={[
            {
              label: isUpdating ? 'Updating…' : 'Change password',
              onPress: handleUpdate,
              variant: 'primary',
              disabled: isUpdating,
              loading: isUpdating },
          ]}
        />
      }
    >
      {/* Security — one section label. 2FA status as a flat inline banner,
          separated from the action row. No grey card, no icon circle. */}
      <SettingsSection title="Security">
        {!twoFactorEnabled && (
          <View style={styles.banner}>
            <Ionicons
              name="warning-outline"
              size={20}
              color={colors.warning}
            />
            <View style={styles.bannerText}>
              <Text style={[styles.bannerTitle, { color: colors.textPrimary }]}>
                2FA not enabled
              </Text>
              <Text style={[styles.bannerSubtitle, { color: colors.textSecondary }]}>
                Add two-factor authentication for stronger protection
              </Text>
            </View>
          </View>
        )}
        <SettingsRow
          title={twoFactorEnabled ? 'Two-factor authentication' : 'Set up 2FA'}
          subtitle={twoFactorEnabled ? 'Enabled' : 'Strengthen your account security'}
          icon="shield-outline"
          iconColor={twoFactorEnabled ? colors.success : undefined}
          onPress={() => navigation.navigate('TwoFactorSetup')}
          accessibilityLabel="Two-factor authentication"
          accessibilityHint={twoFactorEnabled ? 'View two-factor settings' : 'Set up two-factor authentication'}
        />
        <SettingsRow
          title="Active sessions"
          subtitle="Review and sign out of other devices"
          icon="phone-portrait-outline"
          onPress={() => navigation.navigate('ActiveSessions')}
          accessibilityLabel="Review active sessions"
          accessibilityHint="Opens the active sessions screen"
        />
      </SettingsSection>

      {/* Flat intro — no hero card. Just a plain description. */}
      <Text style={[styles.intro, { color: colors.textSecondary }]}>
        Use a unique password you don't use elsewhere.
      </Text>

      {/* Flat form — no card wrapper. Fields carry their own boundary. */}
        <FlagshipFormSection variant="flat">
          <AppInput
            variant="section"
            label="Current password"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry={isSecure}
            placeholder="Enter current password"
            rightAction={eyeIcon}
            appearance="filled"
            autoComplete="current-password"
            textContentType="password"
            onFocus={haptics.tap}
          />
          <AppInput
            variant="section"
            label="New password"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry={isSecure}
            placeholder="Enter new password"
            appearance="filled"
            autoComplete="new-password"
            textContentType="newPassword"
            onFocus={haptics.tap}
          />
          {/* Password requirements appear progressively — only once typing starts */}
          {newPassword.length > 0 && (
            <View style={styles.strengthWrap}>
              <PasswordStrengthBar password={newPassword} />
            </View>
          )}
          <AppInput
            variant="section"
            label="Confirm new password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={isSecure}
            placeholder="Re-enter new password"
            errorText={passwordsMismatch ? 'Passwords do not match' : undefined}
            appearance="filled"
            autoComplete="new-password"
            textContentType="newPassword"
            onFocus={haptics.tap}
          />
          {/* Match indicator — flat, no card */}
          {confirmPassword.length > 0 && (
            <View style={styles.matchRow}>
              <View style={[styles.matchDot, { backgroundColor: passwordsMatch ? colors.success : colors.danger }]} />
              <Text style={[styles.matchText, { color: passwordsMatch ? colors.success : colors.danger }]}>
                {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
              </Text>
            </View>
          )}
          <AnimatedPressable
            onPress={() => navigation.navigate('ForgotPassword')}
            style={styles.forgotPasswordLink}
            accessibilityRole="button"
            accessibilityLabel="Forgot password"
          >
            <Text style={[styles.forgotPasswordText, { color: colors.brand }]}>Forgot password?</Text>
          </AnimatedPressable>
        </FlagshipFormSection>

      {/* Sessions note — flat info row, no card, no border. */}
        <View style={styles.sessionsNote}>
          <Ionicons
            name="information-circle-outline"
            size={18}
            color={colors.textMuted}
          />
          <Text style={[styles.sessionsNoteText, { color: colors.textMuted }]}>
            After changing your password, you'll stay signed in on this device. Review your active sessions to sign out of other devices.
          </Text>
        </View>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm },
    bannerText: {
      flex: 1 },
    bannerTitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.semibold,
      lineHeight: TypographyV2.body.lineHeight,
      letterSpacing: TypographyV2.body.letterSpacing },
    bannerSubtitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      lineHeight: TypographyV2.meta.lineHeight,
      letterSpacing: TypographyV2.meta.letterSpacing,
      marginTop: 2 },
    intro: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.regular,
      lineHeight: TypographyV2.body.lineHeight,
      letterSpacing: TypographyV2.body.letterSpacing,
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.lg },
    strengthWrap: {
      marginTop: Space.xs,
      marginBottom: Space.sm },
    matchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginTop: Space.xs },
    matchDot: {
      width: Space.sm,
      height: Space.sm,
      borderRadius: Space.sm / 2 },
    matchText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium },
    forgotPasswordLink: {
      marginTop: Space.sm,
      alignItems: 'center',
      paddingVertical: Space.xs },
    forgotPasswordText: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.medium,
      letterSpacing: TypographyV2.body.letterSpacing },
    sessionsNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.lg },
    sessionsNoteText: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      lineHeight: TypographyV2.meta.lineHeight,
      letterSpacing: TypographyV2.meta.letterSpacing } });
}
