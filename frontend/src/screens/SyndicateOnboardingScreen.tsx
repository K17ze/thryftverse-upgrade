import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { Space, Radius, Type, Typography, Stroke, LetterSpacing } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { haptics } from '../utils/haptics';

type NavT = NativeStackNavigationProp<RootStackParamList>;

// Co-Own specific educational slides — not generic explainer content.
const SLIDES = [
  {
    icon: 'cube-outline' as const,
    title: 'Own a piece of something desirable',
    body: 'Co-Own lets you buy units of fashion, luxury, and collectable items. You own a real fraction of the item, not the item itself.',
  },
  {
    icon: 'cart-outline' as const,
    title: 'Buy units at your own pace',
    body: 'Browse available items, see the unit price, and buy as many units as you want. Settlement is in GBP, TVUSD, or both. A 1% fee applies.',
  },
  {
    icon: 'swap-horizontal-outline' as const,
    title: 'Sell when you are ready',
    body: 'List your units for sale at market price or set a limit. Buyers must match your offer for the trade to fill. Liquidity is not guaranteed.',
  },
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Trust and protection',
    body: 'Issuers are verified sellers. Authenticity, buyer protection, and storage information are shown on each item. Risks are clearly disclosed.',
  },
];

export default function CoOwnOnboardingScreen() {
  const navigation = useNavigation<NavT>();
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = React.useState(0);

  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  const handleNext = () => {
    if (isLast) {
      haptics.tap();
      navigation.replace('CoOwnHub');
      return;
    }
    haptics.selection();
    setIndex((prev) => Math.min(prev + 1, SLIDES.length - 1));
  };

  const handleSkip = () => {
    haptics.tap();
    navigation.replace('CoOwnHub');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Header */}
      <View style={styles.headerRow}>
        <AnimatedPressable
          onPress={() => navigation.goBack()}
          style={[styles.headerBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          scaleValue={0.92}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </AnimatedPressable>
        <Text style={[styles.progressLabel, { color: colors.textMuted }]}>
          {index + 1} of {SLIDES.length}
        </Text>
        <AnimatedPressable
          onPress={handleSkip}
          scaleValue={0.96}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
        >
          <Text style={[styles.skipText, { color: colors.textSecondary }]}>Skip</Text>
        </AnimatedPressable>
      </View>

      {/* Hero slide */}
      <View style={styles.hero}>
        <View
          key={slide.title}
          style={styles.heroSlide}
        >
          <View style={[styles.iconRing, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <Ionicons name={slide.icon} size={64} color={colors.brand} />
          </View>

          {/* Welcome badge — shown only on the first slide */}
          {index === 0 && (
            <View style={[styles.welcomeBadge, { backgroundColor: `${colors.brand}15` }]}>
              <Text style={[styles.welcomeBadgeText, { color: colors.brand }]}>Co-Own investing</Text>
            </View>
          )}

          <Text style={[styles.title, { color: colors.textPrimary }]}>{slide.title}</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{slide.body}</Text>

          {/* First-slide checklist — what you'll learn */}
          {index === 0 && (
            <View style={[styles.checklist, { borderColor: colors.border }]}>
              <Text style={[styles.checklistTitle, { color: colors.textSecondary }]}>What you'll learn</Text>
              {[
                'How Co-Own fractional ownership works',
                'Buying and selling units at your pace',
                'Trust, protection, and risk disclosure',
              ].map((item, i) => (
                <View key={i} style={styles.checklistItem}>
                  <Ionicons name="checkmark-circle-outline" size={14} color={colors.brand} />
                  <Text style={[styles.checklistText, { color: colors.textSecondary }]}>{item}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Space.lg) }]}>
        <View style={styles.dotsRow}>
          {SLIDES.map((_, dotIdx) => (
            <View
              key={`dot_${dotIdx}`}
              style={[
                styles.dot,
                { backgroundColor: dotIdx === index ? colors.brand : colors.surfaceAlt },
                dotIdx === index && styles.dotActive,
              ]}
            />
          ))}
        </View>

        <AnimatedPressable
          style={[styles.primaryBtn, { backgroundColor: colors.brand }]}
          onPress={handleNext}
          scaleValue={0.97}
          hapticFeedback="medium"
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Enter Co-Own hub' : 'Next slide'}
        >
          <Text style={[styles.primaryBtnText, { color: colors.background }]}>
            {isLast ? 'Enter Co-Own' : 'Next'}
          </Text>
          <Ionicons name="arrow-forward" size={16} color={colors.background} />
        </AnimatedPressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Space.lg,
  },
  headerRow: {
    paddingTop: Space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: LetterSpacing.wide + 0.18,
  },
  headerBtn: {
    width: Space.xl + Space.sm,
    height: Space.xl + Space.sm,
    borderRadius: Radius.xxl,
    borderWidth: Stroke.standard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroSlide: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconRing: {
    width: Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + 8,
    height: Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + 8,
    borderRadius: Space.xxl + Space.xxl + Space.xxl + 8,
    borderWidth: Stroke.standard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: Space.lg,
    fontSize: Type.display.size,
    fontFamily: Typography.family.bold,
    letterSpacing: LetterSpacing.tight - 0.38,
    textAlign: 'center',
    lineHeight: Type.display.size - 2,
  },
  welcomeBadge: {
    marginTop: Space.md,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs / 2 + 1,
    borderRadius: Radius.full,
  },
  welcomeBadgeText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.bold,
    letterSpacing: LetterSpacing.caps - 0.02,
    textTransform: 'uppercase',
  },
  body: {
    marginTop: Space.sm,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.body.size + 9,
    textAlign: 'center',
    paddingHorizontal: Space.md,
  },
  checklist: {
    marginTop: Space.lg,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    gap: Space.sm,
    alignSelf: 'stretch',
    maxWidth: Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + Space.xxl + 16,
  },
  checklistTitle: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    textTransform: 'uppercase',
    letterSpacing: LetterSpacing.caps - 0.02,
    marginBottom: Space.xs / 2,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  checklistText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.caption.size + 6,
  },
  footer: {
    paddingTop: Space.lg,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs + 3,
    marginBottom: Space.lg,
  },
  dot: {
    width: Space.xs / 2 + 2,
    height: Space.xs / 2 + 2,
    borderRadius: Radius.sm,
  },
  dotActive: {
    width: Space.lg,
  },
  primaryBtn: {
    borderRadius: Radius.lg,
    paddingVertical: Space.smMd,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
  },
  primaryBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
  },
});
