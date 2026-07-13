import { Space, Typography } from '../theme/designTokens';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AppInput } from '../components/ui/AppInput';
import { Ionicons } from '@expo/vector-icons';
import { ActiveTheme, Colors } from '../constants/colors';
import { requestPasswordReset } from '../services/authApi';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { AppButton } from '../components/ui/AppButton';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';

export default function ForgotPasswordScreen() {
  const navigation = useNavigation<any>();
  const [email, setEmail] = useState('');
  const [isSent, setIsSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const canSendReset = email.trim().length > 0;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const reducedMotionEnabled = useReducedMotion();

  const handleReset = async () => {
    if (isSubmitting) {
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setErrorMsg('Please enter your email address.');
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      <ScreenHeader
        title=""
        onBack={() => navigation.goBack()}
        showBackButton
      />

      <KeyboardAwareScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.delay(0).duration(400)}>
          <Text style={styles.title}>Reset{'\n'}Password</Text>
        </Reanimated.View>

        {isSent ? (
          <Reanimated.View
            style={styles.successState}
            entering={reducedMotionEnabled ? undefined : FadeInDown.delay(100).duration(400)}
          >
            <Ionicons name="mail-unread-outline" size={48} color={Colors.success} />
            <Text style={styles.successText}>We have sent a password reset link to {email}.</Text>
            <AppButton
              title="Return to Login"
              onPress={() => navigation.goBack()}
              variant="primary"
              size="lg"
              style={{ marginTop: Space.lg }}
            />
          </Reanimated.View>
        ) : (
          <Reanimated.View
            style={styles.form}
            entering={reducedMotionEnabled ? undefined : FadeInDown.delay(100).duration(400)}
          >
            <Text style={styles.subtitle}>Enter your email address and we will send you a link to reset your password.</Text>
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

            <Reanimated.View
              style={styles.footer}
              entering={reducedMotionEnabled ? undefined : FadeInDown.delay(200).duration(400)}
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
            </Reanimated.View>
          </Reanimated.View>
        )}

      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  content: { flex: 1, paddingHorizontal: Space.lg },
  contentContainer: { justifyContent: 'center', flexGrow: 1, paddingBottom: Space.xl },
  title: { fontSize: 44, fontFamily: Typography.family.bold, color: Colors.textPrimary, lineHeight: 48, letterSpacing: -1, marginBottom: Space.lg },
  subtitle: { fontSize: 16, fontFamily: Typography.family.regular, color: Colors.textSecondary, marginBottom: Space.xl, lineHeight: 24 },

  form: { marginBottom: Space.xl },
  inputGroup: { marginBottom: Space.xl },

  footer: { paddingBottom: Space.xl },
  errorText: { color: Colors.danger, fontSize: 13, fontFamily: Typography.family.medium, marginBottom: Space.xs },

  successState: {
    alignItems: 'center',
    paddingTop: Space.lg,
  },
  successText: {
    fontSize: 16,
    color: Colors.textPrimary,
    fontFamily: Typography.family.regular,
    textAlign: 'center',
    marginVertical: Space.lg,
    lineHeight: 24,
  }
});