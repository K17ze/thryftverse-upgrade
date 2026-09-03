import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Radius, Space } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import {
  LOCALE_DISPLAY_INFO,
  type SupportedLanguageOption,
} from '../preferences/settingsPreferences';
import { useAppTranslation } from '../i18n/useAppTranslation';

interface LanguagePickerSheetProps {
  visible: boolean;
  onClose: () => void;
  selectedLanguage: SupportedLanguageOption;
  onSelect: (language: SupportedLanguageOption) => void;
}

// Map locale code back to the LANGUAGE_OPTIONS string used by the settings context.
const LOCALE_TO_LANGUAGE_OPTION: Record<string, SupportedLanguageOption> = {
  en: 'English (EN)',
  es: 'Spanish (ES)',
  fr: 'French (FR)',
  de: 'German (DE)',
  ar: 'Arabic (AR)',
  hi: 'Hindi (HI)',
  zh: 'Chinese (ZH)',
  pt: 'Portuguese (PT)',
  ja: 'Japanese (JA)',
  ru: 'Russian (RU)',
  tr: 'Turkish (TR)',
  ko: 'Korean (KO)',
  id: 'Indonesian (ID)',
};

export function LanguagePickerSheet({
  visible,
  onClose,
  selectedLanguage,
  onSelect,
}: LanguagePickerSheetProps) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('settings');
  const { height } = useWindowDimensions();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [shouldRender, setShouldRender] = React.useState(visible);
  const translateY = useSharedValue(height);
  const contextY = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      translateY.value = reducedMotion ? withTiming(height * 0.4, { duration: 0 }) : height * 0.4;
    } else if (shouldRender) {
      translateY.value = reducedMotion ? withTiming(height, { duration: 0 }) : height;
      setShouldRender(false);
    }
  }, [shouldRender, visible, reducedMotion, height, translateY]);

  const handleClose = () => {
    translateY.value = reducedMotion ? withTiming(height, { duration: 0 }) : height;
    onClose();
  };

  const handleSelect = (language: SupportedLanguageOption) => {
    onSelect(language);
    handleClose();
  };

  const gesture = Gesture.Pan()
    .onStart(() => {
      contextY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateY.value = Math.max(height * 0.1, contextY.value + e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 80 && e.velocityY > 500) {
        runOnJS(handleClose)();
      } else if (translateY.value > height * 0.7) {
        runOnJS(handleClose)();
      } else {
        translateY.value = reducedMotion ? withTiming(height * 0.4, { duration: 0 }) : height * 0.4;
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: withTiming(translateY.value < height ? 1 : 0, { duration: 200 }),
  }));

  if (!shouldRender) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Reanimated.View style={[styles.overlay, overlayStyle]} pointerEvents="auto">
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Reanimated.View>

      <GestureDetector gesture={gesture}>
        <Reanimated.View style={[styles.sheet, sheetStyle]} pointerEvents="auto">
          <View style={styles.handle} />

          <Text style={styles.title}>{t('rows.language')}</Text>

          {LOCALE_DISPLAY_INFO.map((info) => {
            const languageOption = LOCALE_TO_LANGUAGE_OPTION[info.locale] ?? 'English (EN)';
            const isSelected = languageOption === selectedLanguage;
            return (
              <Pressable
                key={info.locale}
                style={styles.row}
                onPress={() => handleSelect(languageOption)}
                accessibilityRole="button"
                accessibilityLabel={info.endonym}
                accessibilityState={{ selected: isSelected }}
              >
                <Text style={styles.endonym}>{info.endonym}</Text>
                {isSelected ? (
                  <Ionicons name="checkmark" size={20} color={colors.brand} />
                ) : null}
              </Pressable>
            );
          })}
        </Reanimated.View>
      </GestureDetector>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.overlay,
    },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.surface,
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      paddingHorizontal: Space.lg,
      paddingBottom: Space.xl,
      paddingTop: Space.sm,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: Space.md,
    },
    title: {
      ...TypographyV2.sectionTitle,
      color: colors.textPrimary,
      marginBottom: Space.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
      minHeight: 48,
    },
    endonym: {
      ...TypographyV2.body,
      color: colors.textPrimary,
    },
  });
}
