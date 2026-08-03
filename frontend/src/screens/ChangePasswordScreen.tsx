import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { RootStackParamList } from '../navigation/types';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import { changePassword } from '../services/authApi';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { PremiumTextField } from '../components/ui/PremiumTextField';
import { PasswordStrengthBar } from '../components/settings/PasswordStrengthBar';
import { FlagshipScreen, FlagshipHeader, FlagshipStickyFooter, FlagshipFormSection } from '../components/flagship';
import { useReducedMotion } from '../hooks/useReducedMotion';

export default function ChangePasswordScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
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
      show('Please fill in all fields', 'error');
      return;
    }
    if (newPassword.length < 8) {
      show('New password must be at least 8 characters', 'error');
      return;
    }
    if (currentPassword === newPassword) {
      show('New password must be different from current password', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      show('New passwords do not match', 'error');
      return;
    }
    setIsUpdating(true);
    try {
      await changePassword({ currentPassword, newPassword });
      show('Password updated successfully', 'success');
      navigation.goBack();
    } catch (error: any) {
      show(error.message || 'Unable to change password', 'error');
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
      header={<FlagshipHeader title="Change Password" subtitle="Update your security" onBack={() => navigation.goBack()} />}
      keyboardAvoiding
      stickyFooter={
        <FlagshipStickyFooter
          actions={[
            {
              label: isUpdating ? 'Updating…' : 'Update Password',
              onPress: handleUpdate,
              variant: 'primary',
              disabled: isUpdating,
              loading: isUpdating,
            },
          ]}
        />
      }
    >
      {/* Security posture hero */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.heroRow}>
            <View style={[styles.heroIcon, { backgroundColor: twoFactorEnabled ? colors.success : colors.bronze }]}>
              <Ionicons name="shield-checkmark" size={20} color={colors.textInverse} />
            </View>
            <View style={styles.heroText}>
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                {twoFactorEnabled ? '2FA enabled' : '2FA not enabled'}
              </Text>
              <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                {twoFactorEnabled
                  ? 'Your account has an extra layer of security'
                  : 'Add two-factor authentication for stronger protection'}
              </Text>
            </View>
          </View>
          {!twoFactorEnabled && (
            <AnimatedPressable
              onPress={() => navigation.navigate('TwoFactorSetup')}
              style={styles.heroAction}
              accessibilityRole="button"
              accessibilityLabel="Set up two-factor authentication"
            >
              <Text style={[styles.heroActionText, { color: colors.brand }]}>Set up 2FA</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.brand} />
            </AnimatedPressable>
          )}
        </View>
      </Reanimated.View>

      <FlagshipFormSection title="Security" description="Enter your current password to confirm your identity.">
        <PremiumTextField
          label="Current Password"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          secureTextEntry={isSecure}
          placeholder="Enter current password"
          rightAction={eyeIcon}
        />
        <PremiumTextField
          label="New Password"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry={isSecure}
          placeholder="Enter new password"
        />
        <View style={{ marginTop: Space.xs, marginBottom: Space.sm }}>
          <PasswordStrengthBar password={newPassword} />
        </View>
        <PremiumTextField
          label="Confirm New Password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={isSecure}
          placeholder="Re-enter new password"
          errorText={passwordsMismatch ? 'Passwords do not match' : undefined}
        />
        {/* Match indicator */}
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
          <Text style={[styles.forgotPasswordText, { color: colors.brand }]}>Forgot Password?</Text>
        </AnimatedPressable>
      </FlagshipFormSection>

      {/* Sessions warning */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(100)}>
        <View style={[styles.noteCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
          <Text style={[styles.noteText, { color: colors.textSecondary }]}>
            After changing your password, you'll stay signed in on this device. Review your active sessions to sign out of other devices.
          </Text>
        </View>
        <AnimatedPressable
          onPress={() => navigation.navigate('ActiveSessions')}
          style={[styles.sessionsLink, { borderColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel="Review active sessions"
        >
          <Ionicons name="phone-portrait-outline" size={18} color={colors.textPrimary} />
          <Text style={[styles.sessionsLinkText, { color: colors.textPrimary }]}>Review active sessions</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </AnimatedPressable>
      </Reanimated.View>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    heroCard: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      padding: Space.md,
      gap: Space.sm,
      marginBottom: Space.md,
    },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
    },
    heroIcon: {
      width: 40,
      height: 40,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroText: { flex: 1 },
    heroTitle: {
      fontSize: Type.bodyEmphasis.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    heroSubtitle: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      lineHeight: 18,
      marginTop: 2,
    },
    heroAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      alignSelf: 'flex-start',
      paddingVertical: Space.xs,
    },
    heroActionText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.semibold,
    },
    matchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginTop: Space.xs,
    },
    matchDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    matchText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.medium,
    },
    forgotPasswordLink: {
      marginTop: Space.sm,
      alignItems: 'center',
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
    },
    forgotPasswordText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.medium,
      letterSpacing: Type.body.letterSpacing,
    },
    noteCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
      borderRadius: Radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      padding: Space.md,
      marginBottom: Space.sm,
    },
    noteText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      lineHeight: 18,
      flex: 1,
    },
    sessionsLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      borderRadius: Radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      paddingVertical: Space.sm + 2,
      paddingHorizontal: Space.md,
    },
    sessionsLinkText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.medium,
      flex: 1,
    },
  });
}
