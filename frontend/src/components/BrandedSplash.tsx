import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Reanimated, {
  FadeInDown,
  FadeIn,
} from 'react-native-reanimated';
import { FontFamily, Space } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface BrandedSplashProps {
  onFinish: () => void;
}

const WORDMARK = 'THRYFTVERSE';

// Per-letter stagger: 35ms between letters, 420ms per letter.
// 10 letters → 315ms stagger + 420ms last letter = ~735ms total reveal.
const LETTER_STAGGER_MS = 35;
const LETTER_DURATION_MS = 420;

// Tagline fades in after the wordmark settles (~800ms), 400ms fade.
const TAGLINE_DELAY_MS = 800;
const TAGLINE_DURATION_MS = 400;

// Hold the completed composition before dismissing.
const TOTAL_REVEAL_MS = TAGLINE_DELAY_MS + TAGLINE_DURATION_MS;
const HOLD_AFTER_REVEAL_MS = 750;
const DISMISS_MS = TOTAL_REVEAL_MS + HOLD_AFTER_REVEAL_MS; // ~1950ms
const REDUCED_MOTION_HOLD_MS = 700;

export function BrandedSplash({ onFinish }: BrandedSplashProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const reducedMotionEnabled = useReducedMotion();

  React.useEffect(() => {
    const holdMs = reducedMotionEnabled ? REDUCED_MOTION_HOLD_MS : DISMISS_MS;
    const id = setTimeout(onFinish, holdMs);
    return () => clearTimeout(id);
  }, [onFinish, reducedMotionEnabled]);

  return (
    <View style={styles.container}>
      <View style={styles.centerWrap} accessibilityRole="header" accessibilityLabel="Thryftverse">
        <View style={styles.brandRow}>
          {WORDMARK.split('').map((letter, index) => {
            const delay = index * LETTER_STAGGER_MS;
            const entering = reducedMotionEnabled
              ? undefined
              : FadeInDown
                  .delay(delay)
                  .duration(LETTER_DURATION_MS);

            return (
              <Reanimated.Text
                key={`${letter}_${index}`}
                entering={entering}
                style={styles.brandLetter}
              >
                {letter}
              </Reanimated.Text>
            );
          })}
        </View>
        <Reanimated.Text
          entering={
            reducedMotionEnabled
              ? undefined
              : FadeIn.delay(TAGLINE_DELAY_MS).duration(TAGLINE_DURATION_MS)
          }
          style={styles.tagline}
        >
          Resale meets investment
        </Reanimated.Text>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    centerWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.lg,
    },
    brandRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 2,
    },
    brandLetter: {
      color: colors.textPrimary,
      fontFamily: FontFamily.bold,
      fontSize: TypographyV2.display.size,
      letterSpacing: 0.42,
    },
    tagline: {
      marginTop: 14,
      color: colors.brand,
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.label.size,
      letterSpacing: TypographyV2.label.letterSpacing,
    },
  });
}
