import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Space, Type, FontFamily } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import { changePassword } from '../services/authApi';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { haptics } from '../utils/haptics';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { PremiumTextField } from '../components/ui/PremiumTextField';
import { PasswordStrengthBar } from '../components/settings/PasswordStrengthBar';
import { FlagshipScreen, FlagshipHeader, FlagshipStickyFooter, FlagshipFormSection } from '../components/flagship';
import { FlagshipNavigationRow } from '../components/flagship/FlagshipNavigationRow';

export default function ChangePasswordScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { show } = useToast();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const twoFactorEnabled = useStore((s) => s.twoFactorEnabled);
  const reducedMotionEnabled = useReducedMotion();

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
              loading: isUpdating,
            },
          ]}
        />
      }
    >
      {/* Security posture — flat state variant. Surfaces 2FA status before the form. */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
        <FlagshipFormSection
          variant="state"
          tone={twoFactorEnabled ? 'success' : 'warning'}
          title="Security"
        >
          <View style={styles.postureRow}>
            <Ionicons
              name={twoFactorEnabled ? 'shield-checkmark' : 'shield-checkmark-outline'}
              size={22}
              color={twoFactorEnabled ? colors.success : colors.warning}
            />
            <View style={styles.postureText}>
              <Text style={[styles.postureTitle, { color: colors.textPrimary }]}>
                {twoFactorEnabled ? '2FA enabled' : '2FA not enabled'}
              </Text>
              <Text style={[styles.postureSubtitle, { color: colors.textSecondary }]}>
                {twoFactorEnabled
                  ? 'Your account has an extra layer of security'
                  : 'Add two-factor authentication for stronger protection'}
              </Text>
            </View>
          </View>
          {!twoFactorEnabled && (
            <FlagshipNavigationRow
              title="Set up 2FA"
              subtitle="Strengthen your account security"
              icon="lock-closed-outline"
              onPress={() => navigation.navigate('TwoFactorSetup')}
              accessibilityLabel="Set up two-factor authentication"
              accessibilityHint="Opens the two-factor authentication setup screen"
            />
          )}
        </FlagshipFormSection>
      </Reanimated.View>

      {/* Flat intro — no hero card. Just a plain description. */}
      <Text style={[styles.intro, { color: colors.textSecondary }]}>
        Use a unique password you don't use elsewhere.
      </Text>

      {/* Flat form — no card wrapper. Fields carry their own boundary. */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
        <FlagshipFormSection variant="flat">
          <PremiumTextField
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
          <PremiumTextField
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
          <PremiumTextField
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
      </Reanimated.View>

      {/* Other security — flat navigation rows, no bordered sessions card */}
      <FlagshipFormSection variant="flat" title="Other security">
        <FlagshipNavigationRow
          title="Active sessions"
          subtitle="Review and sign out of other devices"
          icon="phone-portrait-outline"
          onPress={() => navigation.navigate('ActiveSessions')}
          accessibilityLabel="Review active sessions"
          accessibilityHint="Opens the active sessions screen"
        />
        <FlagshipNavigationRow
          title={twoFactorEnabled ? 'Two-factor authentication' : 'Two-factor authentication'}
          subtitle={twoFactorEnabled ? 'Enabled' : 'Add an extra layer of security'}
          icon="shield-checkmark-outline"
          iconColor={twoFactorEnabled ? colors.success : undefined}
          onPress={() => navigation.navigate('TwoFactorSetup')}
          accessibilityLabel="Two-factor authentication"
          accessibilityHint={twoFactorEnabled ? 'View two-factor settings' : 'Set up two-factor authentication'}
        />
      </FlagshipFormSection>

      {/* Sessions note — flat info row, no card, no border. */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
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
      </Reanimated.View>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    postureRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
      paddingVertical: Space.xs,
    },
    postureText: {
      flex: 1,
    },
    postureTitle: {
      fontSize: Type.body.size,
      fontFamily: FontFamily.semibold,
      lineHeight: Type.body.lineHeight,
      letterSpacing: Type.body.letterSpacing,
    },
    postureSubtitle: {
      fontSize: Type.caption.size,
      fontFamily: FontFamily.regular,
      lineHeight: Type.caption.lineHeight,
      letterSpacing: Type.caption.letterSpacing,
      marginTop: 2,
    },
    intro: {
      fontSize: Type.body.size,
      fontFamily: FontFamily.regular,
      lineHeight: Type.body.lineHeight,
      letterSpacing: Type.body.letterSpacing,
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.lg,
    },
    strengthWrap: {
      marginTop: Space.xs,
      marginBottom: Space.sm,
    },
    matchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginTop: Space.xs,
    },
    matchDot: {
      width: Space.sm,
      height: Space.sm,
      borderRadius: Space.sm / 2,
    },
    matchText: {
      fontSize: Type.meta.size,
      fontFamily: FontFamily.medium,
    },
    forgotPasswordLink: {
      marginTop: Space.sm,
      alignItems: 'center',
      paddingVertical: Space.xs,
    },
    forgotPasswordText: {
      fontSize: Type.body.size,
      fontFamily: FontFamily.medium,
      letterSpacing: Type.body.letterSpacing,
    },
    sessionsNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.lg,
    },
    sessionsNoteText: {
      flex: 1,
      fontSize: Type.caption.size,
      fontFamily: FontFamily.regular,
      lineHeight: Type.caption.lineHeight,
      letterSpacing: Type.caption.letterSpacing,
    },
  });
}
