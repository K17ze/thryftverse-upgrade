import { Space, Typography, Type } from '../theme/designTokens';
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AppInput } from '../components/ui/AppInput';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { requestPasswordReset } from '../services/authApi';
import { AppButton } from '../components/ui/AppButton';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';

export default function ForgotPasswordScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useAppTheme();
  const [email, setEmail] = useState('');
  const [isSent, setIsSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const canSendReset = email.trim().length > 0;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleReset = async () => {
    if (isSubmitting) {
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setErrorMsg('Enter your email address.');
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setErrorMsg('Enter a valid email address.');
      return;
    }

    setErrorMsg('');
    setIsSubmitting(true);

    try {
      await requestPasswordReset(normalizedEmail);
      setIsSent(true);
    } catch (error) {
      setErrorMsg((error as Error).message || 'Unable to send reset link right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FlagshipScreen
      scrollEnabled={false}
      header={
        <FlagshipHeader
          title=""
          onBack={() => navigation.goBack()}
          showBackButton
        />
      }
    >
      <KeyboardAwareScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={styles.title}>Reset{'\n'}Password</Text>
        </View>

        {isSent ? (
          <View
            style={styles.successState}
          >
            <Ionicons name="mail-unread-outline" size={48} color={colors.success} />
            <Text style={styles.successText}>We have sent a password reset link to {email}.</Text>
            <AppButton
              title="Return to Login"
              onPress={() => navigation.goBack()}
              variant="primary"
              size="lg"
              style={{ marginTop: Space.lg }}
            />
          </View>
        ) : (
          <View
            style={styles.form}
          >
            <Text style={styles.subtitle}>Enter your email address and we'll send you a link to reset your password.</Text>
            <AppInput
              label="Email"
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                if (errorMsg) {
                  setErrorMsg('');
                }
              }}
              containerStyle={styles.inputGroup}
            />

            {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

            <View
              style={styles.footer}
            >
              <AppButton
                title={isSubmitting ? 'Sending...' : 'Send Reset Link'}
                onPress={handleReset}
                disabled={!canSendReset || isSubmitting}
                loading={isSubmitting}
                variant="primary"
                size="lg"
                style={{ marginTop: Space.lg }}
              />
            </View>
          </View>
        )}

      </KeyboardAwareScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  content: { flex: 1, paddingHorizontal: Space.lg },
  contentContainer: { justifyContent: 'center', flexGrow: 1, paddingBottom: Space.xl },
  title: { fontSize: Type.display.size + Space.sm + Space.xs, fontFamily: Typography.family.bold, color: colors.textPrimary, lineHeight: Type.display.lineHeight + 10, letterSpacing: Type.display.letterSpacing * 2, marginBottom: Space.lg },
  subtitle: { fontSize: Type.bodyLarge.size, fontFamily: Typography.family.regular, color: colors.textSecondary, marginBottom: Space.xl, lineHeight: Type.subtitle.lineHeight },

  form: { marginBottom: Space.xl },
  inputGroup: { marginBottom: Space.xl },

  footer: { paddingBottom: Space.xl },
  errorText: { color: colors.danger, fontSize: Type.captionElevated.size, fontFamily: Typography.family.medium, marginBottom: Space.xs },

  successState: {
    alignItems: 'center',
    paddingTop: Space.lg,
  },
  successText: {
    fontSize: Type.bodyLarge.size,
    color: colors.textPrimary,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    marginVertical: Space.lg,
    lineHeight: Type.subtitle.lineHeight,
  }
  });
}