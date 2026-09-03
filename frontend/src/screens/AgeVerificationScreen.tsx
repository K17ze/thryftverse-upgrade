import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  BackHandler,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import type { NativeStackScreenProps, RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, FontFamily, LetterSpacing } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
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

  useEffect(() => {
    let mounted = true;
    isAgeVerified().then((verified) => {
      if (!mounted || !verified) return;
      navigateToNextGate();
    });
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      return true;
    });
    return () => subscription.remove();
  }, []);

  const navigateToNextGate = useCallback(() => {
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
    if (Platform.OS === 'android') {
      BackHandler.exitApp();
    }
  }, [haptic]);

  if (underAge) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <Reanimated.View
          entering={reducedMotion ? undefined : FadeIn}
          style={styles.deniedContent}
          accessibilityLiveRegion="polite"
        >
          <Text
            style={[styles.deniedTitle, { color: colors.textPrimary }]}
            accessibilityRole="header"
          >
            ThryftVerse is 18+
          </Text>
          <Text style={[styles.deniedBody, { color: colors.textSecondary }]}>
            This app is only available to users 18 and older.
          </Text>
          {Platform.OS === 'android' ? (
            <Pressable
              onPress={handleCloseApp}
              style={({ pressed }) => [styles.deniedAction, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Close app"
            >
              <Text style={[styles.deniedActionText, { color: colors.textPrimary }]}>
                Close app
              </Text>
            </Pressable>
          ) : (
            <Text style={[styles.iosCloseHint, { color: colors.textMuted }]}>
              Swipe up from the bottom to close.
            </Text>
          )}
        </Reanimated.View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      {/* Wordmark — top-left, not centered. Reads as a real product, not a gate. */}
      <Text style={[styles.wordmark, { color: colors.textPrimary }]}>
        ThryftVerse
      </Text>

      {/* Content anchored to the lower third — not vertically centered.
          This gives the wordmark room to breathe and creates intentional
          asymmetry (AGENTS §4: "Real product surfaces have intentional
          asymmetry, dominant objects, and breathing room that serves focus"). */}
      <View style={styles.content}>
        <Text
          style={[styles.statement, { color: colors.textPrimary }]}
          accessibilityRole="header"
        >
          You must be 18 or older to use ThryftVerse.
        </Text>

        <Text style={[styles.finePrint, { color: colors.textMuted }]}>
          A self-declaration stored on your device. Some features may require age verification later.
        </Text>

        {/* One dominant action. The "under 18" path is a quiet text link,
            not an equal-weight pill — because it's the exit, not the entry. */}
        <Pressable
          onPress={handleConfirm18}
          style={({ pressed }) => [
            styles.confirmButton,
            { backgroundColor: colors.brand },
            pressed && styles.pressed,
          ]}
          accessibilityLabel="Confirm I am 18 or older"
          accessibilityHint="Confirms you are at least 18 and continues to the marketplace"
          accessibilityRole="button"
        >
          <Text style={[styles.confirmText, { color: colors.background }]}>
            I'm 18 or older
          </Text>
        </Pressable>

        <Pressable
          onPress={handleUnder18}
          style={({ pressed }) => [styles.underAgeLink, pressed && styles.pressed]}
          accessibilityLabel="I am under 18"
          accessibilityHint="Indicates you are below the required age"
          accessibilityRole="button"
        >
          <Text style={[styles.underAgeText, { color: colors.textMuted }]}>
            I'm under 18
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: Space.lg,
  },
  // Wordmark sits at the top with generous breathing room — not in a badge.
  wordmark: {
    fontFamily: FontFamily.bold,
    fontSize: TypographyV2.bodyStrong.size,
    letterSpacing: LetterSpacing.tight,
    paddingTop: Space.xxl,
  },
  // Content sits in the lower third. This is the dominant object.
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: Space.xxl + Space.lg,
  },
  // The statement IS the screen. No subtitle, no eyebrow, no badge.
  statement: {
    fontFamily: FontFamily.bold,
    fontSize: TypographyV2.display.size,
    lineHeight: TypographyV2.display.lineHeight,
    letterSpacing: LetterSpacing.tight,
    marginBottom: Space.md,
  },
  finePrint: {
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.caption.size,
    lineHeight: TypographyV2.caption.lineHeight + 2,
    marginBottom: Space.xxl,
    maxWidth: 300,
  },
  // One dominant action — full-width, brand fill, clear hierarchy.
  confirmButton: {
    height: 52,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.md,
  },
  confirmText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.bodyStrong.size,
  },
  // The exit path is a quiet text link — not an equal-weight button.
  underAgeLink: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  underAgeText: {
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.body.size,
  },
  pressed: {
    opacity: 0.7,
  },
  // Denied state — text only, no icon circle, no chrome.
  deniedContent: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: Space.lg,
  },
  deniedTitle: {
    fontFamily: FontFamily.bold,
    fontSize: TypographyV2.screenTitle.size,
    lineHeight: TypographyV2.screenTitle.lineHeight,
    letterSpacing: LetterSpacing.tight,
    marginBottom: Space.sm,
  },
  deniedBody: {
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight + 4,
    marginBottom: Space.xl,
    maxWidth: 300,
  },
  deniedAction: {
    height: 44,
    paddingHorizontal: Space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
  },
  deniedActionText: {
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.body.size,
  },
  iosCloseHint: {
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight + 4,
  },
});
