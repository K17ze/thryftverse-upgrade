import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  BackHandler,
  Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps, RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Typography, FontFamily, LetterSpacing } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { AppButton } from '../components/ui/AppButton';
import { useHaptic } from '../hooks/useHaptic';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { secureStorage } from '../utils/security';
import { useStore } from '../store/useStore';

// ---------------------------------------------------------------------------
// Persistence — the verification result is stored in hardware-backed
// SecureStore (Keychain on iOS, Keystore on Android) so it survives reinstalls
// only when the OS keeps the keychain (iOS does; Android Keystore is cleared
// on uninstall). This is a REAL gate: the AppNavigator checks `isAgeVerified`
// before deciding whether to show this screen or proceed to onboarding/auth.
// Per AGENTS.md §11 we never fabricate the verification state.
// ---------------------------------------------------------------------------

const AGE_VERIFIED_KEY = 'age_verification_confirmed';
const AGE_VERIFIED_VALUE = 'true';

/** Check whether the user has already confirmed 18+ on this device. */
export async function isAgeVerified(): Promise<boolean> {
  try {
    const value = await secureStorage.getItem(AGE_VERIFIED_KEY);
    return value === AGE_VERIFIED_VALUE;
  } catch {
    // If SecureStore is unavailable (e.g. web), fall back to "not verified"
    // so the gate is shown rather than silently bypassed (AGENTS.md §11).
    return false;
  }
}

/** Persist the 18+ confirmation so returning users skip the gate. */
async function markAgeVerified(): Promise<void> {
  try {
    await secureStorage.setItem(AGE_VERIFIED_KEY, AGE_VERIFIED_VALUE);
  } catch {
    // Best-effort persistence — the app still functions if storage fails,
    // but the gate will re-show on next launch, which is the safe failure.
  }
}

type Props = NativeStackScreenProps<RootStackParamList, 'AgeVerification'>;

export default function AgeVerificationScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reducedMotion = useReducedMotion();
  const isAuthenticated = useStore((state) => state.isAuthenticated);
  const storeOnboardingComplete = useStore((state) => state.hasCompletedOnboarding);
  const [underAge, setUnderAge] = useState(false);

  // On mount, check if already verified — if so, navigate immediately to the
  // next gate in the chain (onboarding or auth/main). This keeps returning
  // users from seeing the age gate twice.
  useEffect(() => {
    let mounted = true;
    isAgeVerified().then((verified) => {
      if (!mounted || !verified) return;
      navigateToNextGate();
    });
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Block swipe-back / hardware back so the gate cannot be bypassed before
  // the user confirms. Once verified, the screen is replaced by the next route.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      // Swallow back while the gate is active.
      return true;
    });
    return () => subscription.remove();
  }, []);

  const navigateToNextGate = useCallback(() => {
    // After age verification, the next gate is onboarding (first launch) or
    // the auth/main entry point (returning users). We replace rather than push
    // so the age screen is not left on the back stack.
    if (!storeOnboardingComplete) {
      navigation.replace('Onboarding');
    } else if (isAuthenticated) {
      navigation.replace('MainTabs');
    } else {
      navigation.replace('AuthLanding');
    }
  }, [navigation, storeOnboardingComplete, isAuthenticated]);

  const handleConfirm18 = useCallback(async () => {
    haptic.success();
    await markAgeVerified();
    navigateToNextGate();
  }, [haptic, navigateToNextGate]);

  const handleUnder18 = useCallback(() => {
    haptic.warning();
    setUnderAge(true);
  }, [haptic]);

  const handleCloseApp = useCallback(() => {
    haptic.heavy();
    // Exit the app. On Android this closes the activity; on iOS BackHandler
    // does nothing so we no-op (the user is shown the polite message).
    if (Platform.OS === 'android') {
      BackHandler.exitApp();
    }
  }, [haptic]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={styles.brandMark}>
        <View
          style={[styles.logoBadge, { backgroundColor: colors.brand }]}
        >
          <Ionicons name="storefront" size={28} color={colors.background} />
        </View>
      </View>

      {!underAge ? (
        <View style={styles.content}>
          <Text
            style={[styles.title, { color: colors.textPrimary }]}
            accessibilityRole="header"
          >
            ThryftVerse
          </Text>
          <Text
            style={[styles.subtitle, { color: colors.textSecondary }]}
          >
            A marketplace for fashion, auctions, and co-ownership. 18+ only.
          </Text>

          <View style={styles.actions}>
            <AppButton
              title="Confirm I am 18 or older"
              variant="primary"
              size="lg"
              onPress={handleConfirm18}
              hapticFeedback="medium"
              accessibilityLabel="Confirm I am 18 or older"
              accessibilityHint="Confirms you are at least 18 and continues to the marketplace"
              accessibilityRole="button"
              style={styles.button}
            />
            <AppButton
              title="I am under 18"
              variant="secondary"
              size="lg"
              onPress={handleUnder18}
              hapticFeedback="light"
              accessibilityLabel="I am under 18"
              accessibilityHint="Indicates you are below the required age"
              accessibilityRole="button"
              style={styles.button}
            />
          </View>

          {/* Data-transparency microcopy (ICO 2026). The gate stores only a
              boolean self-declaration (declared_18_plus) in hardware-backed
              SecureStore — never the user's date of birth. Being explicit
              that this is a self-declaration, not verified age assurance,
              meets data-protection transparency expectations. */}
          <Text
            style={[styles.microcopy, { color: colors.textMuted }]}
            maxFontSizeMultiplier={1.3}
          >
            This is a self-declaration stored on your device. Some features may require age verification later.
          </Text>
        </View>
      ) : (
        <Reanimated.View
          entering={reducedMotion ? undefined : FadeIn}
          style={styles.content}
          accessibilityLiveRegion="polite"
        >
          <View style={[styles.deniedIcon, { backgroundColor: colors.surface }]}>
            <Ionicons name="lock-closed" size={32} color={colors.textSecondary} />
          </View>
          <Text
            style={[styles.title, { color: colors.textPrimary }]}
            accessibilityRole="header"
          >
            We're sorry
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            We're sorry, but ThryftVerse is only available to users 18 and older.
          </Text>
          {Platform.OS === 'android' ? (
            <AppButton
              title="Close app"
              variant="secondary"
              size="lg"
              onPress={handleCloseApp}
              hapticFeedback="medium"
              accessibilityLabel="Close app"
              accessibilityHint="Closes the application"
              accessibilityRole="button"
              style={styles.button}
            />
          ) : (
            // iOS — BackHandler.exitApp is a no-op, so we do not show a
            // button that represents an action it cannot perform (§11).
            // Instead, honest guidance tells the user how to leave.
            <Text
              style={[styles.iosCloseHint, { color: colors.textMuted }]}
              maxFontSizeMultiplier={1.3}
            >
              You can close the app by swiping up from the bottom of your screen.
            </Text>
          )}
        </Reanimated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: Space.xl,
    justifyContent: 'center' },
  brandMark: {
    position: 'absolute',
    top: Space.xxl,
    alignSelf: 'center' },
  logoBadge: {
    width: Space.xxl + Space.sm,
    height: Space.xxl + Space.sm,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center' },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1 },
  title: {
    fontFamily: Typography.family.extrabold,
    fontSize: TypographyV2.display.size + 4,
    lineHeight: TypographyV2.display.lineHeight + 6,
    letterSpacing: LetterSpacing.tight,
    textAlign: 'center',
    marginBottom: Space.md },
  subtitle: {
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight + 4,
    letterSpacing: TypographyV2.body.letterSpacing,
    textAlign: 'center',
    marginBottom: Space.xxl,
    maxWidth: 320 },
  actions: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    gap: Space.md },
  button: {
    width: '100%' },
  microcopy: {
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 2,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textAlign: 'center',
    marginTop: Space.lg,
    maxWidth: 300,
    alignSelf: 'center' },
  iosCloseHint: {
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight + 4,
    letterSpacing: TypographyV2.body.letterSpacing,
    textAlign: 'center',
    marginTop: Space.lg,
    maxWidth: 300,
    alignSelf: 'center' },
  deniedIcon: {
    width: Space.xxl + Space.lg,
    height: Space.xxl + Space.lg,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.lg } });
