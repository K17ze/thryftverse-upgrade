import React, { useState } from 'react';
import { View, Text, StyleSheet, StatusBar, Keyboard } from 'react-native';
import Reanimated, { useSharedValue, useAnimatedStyle, withSequence, withTiming, withSpring, FadeInUp, FadeOutUp, Layout } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';
import { Type, Space } from '../theme/designTokens';
import { useStore } from '../store/useStore';
import { signupWithPassword } from '../services/authApi';
import { AppInput } from '../components/ui/AppInput';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Typography } from '../theme/designTokens';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';

export default function SignUpScreen() {
  const navigation = useNavigation<any>();
  const { colors, isDark } = useAppTheme();
  const login = useStore((state) => state.login);
  const setTwoFactorEnabled = useStore((state) => state.setTwoFactorEnabled);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const reducedMotionEnabled = useReducedMotion();
  const canSubmit = username.trim().length > 0 && email.trim().length > 0 && password.length > 0 && !isSubmitting;

  const shakeOffset = useSharedValue(0);

  const shake = () => {
    shakeOffset.value = withSequence(
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withSpring(0, { damping: 20, stiffness: 400 })
    );
  };

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeOffset.value }]
  }));

  const statusEnterAnimation = reducedMotionEnabled
    ? undefined
    : FadeInUp.springify().damping(20).duration(400);
  const statusExitAnimation = reducedMotionEnabled ? undefined : FadeOutUp;
  const layoutAnimation = reducedMotionEnabled ? undefined : Layout.springify();

  const handleSignUp = async () => {
    if (isSubmitting) {
      return;
    }

    const normalizedUsername = username.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedUsername || !normalizedEmail || !password) {
      setErrorMsg('Please fill in all details.');
      shake();
      return;
    }

    if (normalizedUsername.length < 3) {
      setErrorMsg('Username must be at least 3 characters.');
      shake();
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setErrorMsg('Enter a valid email address.');
      shake();
      return;
    }

    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.');
      shake();
      return;
    }

    setErrorMsg('');
    setIsSubmitting(true);

    try {
      const result = await signupWithPassword({
        username: normalizedUsername,
        email: normalizedEmail,
        password,
      });

      login(result.storeUser);
      setTwoFactorEnabled(result.user.twoFactorEnabled);
      navigation.replace('MainTabs');
    } catch (error) {
      setErrorMsg((error as Error).message || 'Unable to create account right now.');
      shake();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <View style={styles.header}>
        <AnimatedPressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </AnimatedPressable>
      </View>

      <KeyboardAwareScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
          <View>
            <Text style={styles.title}>Join{'\n'}the movement.</Text>

            <View style={styles.form}>
              <AppInput
                label="Username"
                placeholder="Pick a unique username"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                value={username}
                onChangeText={setUsername}
                containerStyle={styles.inputGroup}
              />
              <AppInput
                label="Email"
                placeholder="Enter your email"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                value={email}
                onChangeText={setEmail}
                containerStyle={styles.inputGroup}
              />
              <AppInput
                label="Password"
                placeholder="Create a password"
                secureTextEntry
                returnKeyType="done"
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={() => {
                  Keyboard.dismiss();
                  if (canSubmit) {
                    void handleSignUp();
                  }
                }}
                containerStyle={styles.inputGroup}
              />
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.termsText}>
              By signing up, you agree to our Terms of Service and Privacy Policy.
            </Text>

            {!!errorMsg && (
              <Reanimated.Text
                entering={statusEnterAnimation}
                exiting={statusExitAnimation}
                layout={layoutAnimation}
                style={styles.errorText}
              >
                {errorMsg}
              </Reanimated.Text>
            )}

            <Reanimated.View style={shakeStyle} layout={layoutAnimation}>
              <AppButton
                title={isSubmitting ? 'Creating account...' : 'Create Account'}
                variant="primary"
                size="lg"
                onPress={handleSignUp}
                disabled={!canSubmit}
                loading={isSubmitting}
                style={styles.primaryBtn}
                hapticFeedback="medium"
              />
            </Reanimated.View>
          </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: Space.md, paddingTop: Space.sm, paddingBottom: Space.lg },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },

  keyboardWrap: { flex: 1 },
  content: { flex: 1 },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: Space.lg,
    paddingTop: Space.sm,
    paddingBottom: Space.lg,
  },
  title: { fontSize: Type.title.size + 8, fontFamily: Typography.family.bold, lineHeight: Type.title.lineHeight + 8, letterSpacing: Type.title.letterSpacing - 0.4, marginBottom: Space.xl + 8 },

  form: { marginBottom: Space.lg + 6 },
  inputGroup: { marginBottom: Space.lg - 2 },

  footer: { paddingBottom: Space.sm, position: 'relative' },
  termsText: { fontSize: Type.caption.size, fontFamily: Typography.family.regular, textAlign: 'center', marginBottom: Space.lg - 4, lineHeight: Type.caption.lineHeight + 2 },
  errorText: { fontSize: 13, fontFamily: Typography.family.medium, textAlign: 'center', marginBottom: Space.md - 4 },
  primaryBtn: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryText: { fontSize: Type.body.size + 2, fontFamily: Typography.family.bold },
});