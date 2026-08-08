import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import Reanimated, { FadeInRight, FadeInLeft } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Type, Space, Radius, Typography } from '../theme/designTokens';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { useReducedMotion } from '../hooks/useReducedMotion';

const { width: SCREEN_W } = Dimensions.get('window');

type NavT = NativeStackNavigationProp<RootStackParamList>;

type Step = 0 | 1 | 2 | 3;

interface QuizOption {
  label: string;
  value: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}

const GENDER_OPTIONS: QuizOption[] = [
  { label: 'Women', value: 'Women', icon: 'female-outline' },
  { label: 'Men', value: 'Men', icon: 'male-outline' },
  { label: 'Both', value: 'Both', icon: 'people-outline' },
];

const STYLE_OPTIONS: QuizOption[] = [
  { label: 'Minimal', value: 'Minimal', icon: 'remove-circle-outline' },
  { label: 'Streetwear', value: 'Streetwear', icon: 'walk-outline' },
  { label: 'Vintage', value: 'Vintage', icon: 'time-outline' },
  { label: 'Gorpcore', value: 'Gorpcore', icon: 'leaf-outline' },
  { label: 'Archive', value: 'Archive', icon: 'archive-outline' },
  { label: 'Techwear', value: 'Techwear', icon: 'hardware-chip-outline' },
];

const PRICE_OPTIONS: QuizOption[] = [
  { label: 'Under £50', value: 'budget' },
  { label: '£50 – £150', value: 'mid' },
  { label: '£150 – £300', value: 'premium' },
  { label: '£300+', value: 'luxury' },
];

export default function StyleQuizScreen() {
  const navigation = useNavigation<NavT>();
  const haptic = useHaptic();
  const { show } = useToast();
  const reducedMotion = useReducedMotion();
  const updatePersonalisation = useStore((state) => state.updatePersonalisationPreferences);
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [step, setStep] = useState<Step>(0);
  const [selectedGender, setSelectedGender] = useState<string>('');
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [selectedPrice, setSelectedPrice] = useState<string>('');

  const toggleStyle = (value: string) => {
    haptic.light();
    setSelectedStyles((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]
    );
  };

  const handleNext = () => {
    haptic.medium();
    if (step === 0 && !selectedGender) {
      show('Select a preference', 'info');
      return;
    }
    if (step < 3) {
      setStep((s) => (s + 1) as Step);
    }
  };

  const handleBack = () => {
    haptic.light();
    if (step > 0) {
      setStep((s) => (s - 1) as Step);
    } else {
      navigation.goBack();
    }
  };

  const handleSkip = () => {
    haptic.light();
    navigation.goBack();
  };

  const handleComplete = () => {
    haptic.medium();
    const genderFilter = selectedGender === 'Both' ? ['Women', 'Men'] : [selectedGender];
    updatePersonalisation({
      genderFilter,
      categoriesAndSizesPref: selectedStyles.length > 0 ? selectedStyles.join(', ') : 'Balanced',
      brandsPref: selectedPrice ? selectedPrice : 'Any',
    });
    show('Feed personalised — your Explore and Home feeds now reflect your preferences.', 'success');
    // Navigate to Home tab to show the personalised feed
    navigation.navigate('MainTabs', { screen: 'Home' });
  };

  const progress = ((step + 1) / 4) * 100;

  const renderStep0 = () => (
    <Reanimated.View entering={reducedMotion ? undefined : FadeInRight.duration(250)} style={styles.stepContent}>
      <Text style={styles.stepTitle}>What are you shopping for?</Text>
      <Text style={styles.stepSub}>We'll tailor your feed to match.</Text>
      <View style={styles.optionsGrid}>
        {GENDER_OPTIONS.map((opt) => (
          <AnimatedPressable
            key={opt.value}
            style={[styles.optionCard, selectedGender === opt.value && styles.optionCardActive]}
            onPress={() => { haptic.light(); setSelectedGender(opt.value); }}
            activeOpacity={0.88}
          >
            <Ionicons name={opt.icon} size={28} color={selectedGender === opt.value ? colors.background : colors.textPrimary} />
            <Text style={[styles.optionLabel, selectedGender === opt.value && styles.optionLabelActive]}>{opt.label}</Text>
          </AnimatedPressable>
        ))}
      </View>
    </Reanimated.View>
  );

  const renderStep1 = () => (
    <Reanimated.View entering={reducedMotion ? undefined : FadeInRight.duration(250)} style={styles.stepContent}>
      <Text style={styles.stepTitle}>Pick your styles</Text>
      <Text style={styles.stepSub}>Select all that apply.</Text>
      <View style={styles.optionsWrap}>
        {STYLE_OPTIONS.map((opt) => {
          const isActive = selectedStyles.includes(opt.value);
          return (
            <AnimatedPressable
              key={opt.value}
              style={[styles.pill, isActive && styles.pillActive]}
              onPress={() => toggleStyle(opt.value)}
              activeOpacity={0.88}
            >
              <Ionicons name={opt.icon} size={16} color={isActive ? colors.background : colors.textPrimary} />
              <Text style={[styles.pillLabel, isActive && styles.pillLabelActive]}>{opt.label}</Text>
            </AnimatedPressable>
          );
        })}
      </View>
    </Reanimated.View>
  );

  const renderStep2 = () => (
    <Reanimated.View entering={reducedMotion ? undefined : FadeInRight.duration(250)} style={styles.stepContent}>
      <Text style={styles.stepTitle}>What's your price range?</Text>
      <Text style={styles.stepSub}>We'll surface listings that fit.</Text>
      <View style={styles.optionsColumn}>
        {PRICE_OPTIONS.map((opt) => (
          <AnimatedPressable
            key={opt.value}
            style={[styles.rowOption, selectedPrice === opt.value && styles.rowOptionActive]}
            onPress={() => { haptic.light(); setSelectedPrice(opt.value); }}
            activeOpacity={0.88}
          >
            <Text style={[styles.rowOptionLabel, selectedPrice === opt.value && styles.rowOptionLabelActive]}>{opt.label}</Text>
            {selectedPrice === opt.value && <Ionicons name="checkmark" size={18} color={colors.background} />}
          </AnimatedPressable>
        ))}
      </View>
    </Reanimated.View>
  );

  const renderStep3 = () => (
    <Reanimated.View entering={reducedMotion ? undefined : FadeInRight.duration(250)} style={styles.stepContent}>
      <View style={styles.completeIconWrap}>
        <Ionicons name="checkmark-circle" size={64} color={colors.success} />
      </View>
      <Text style={styles.stepTitle}>You're all set</Text>
      <Text style={styles.stepSub}>Your Explore feed will be tailored to your preferences.</Text>
      <View style={styles.summaryCard}>
        <SummaryRow label="Shopping for" value={selectedGender || '—'} />
        <SummaryRow label="Styles" value={selectedStyles.length > 0 ? selectedStyles.join(', ') : '—'} />
        <SummaryRow label="Price range" value={selectedPrice ? PRICE_OPTIONS.find(p => p.value === selectedPrice)?.label ?? '—' : '—'} />
      </View>
    </Reanimated.View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="Style Quiz" onBack={handleBack} />

      {/* Progress */}
      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <View style={styles.progressHeader}>
          <Text style={styles.progressText}>Step {step + 1} of 4</Text>
          {step < 3 && (
            <AnimatedPressable onPress={handleSkip} activeOpacity={0.8}>
              <Text style={styles.skipText}>Skip</Text>
            </AnimatedPressable>
          )}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </ScrollView>

      {/* Footer action */}
      <View style={styles.footer}>
        {step < 3 ? (
          <AppButton title="Next" variant="primary" size="lg" onPress={handleNext} />
        ) : (
          <AppButton title="Done" variant="primary" size="lg" onPress={handleComplete} />
        )}
      </View>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingHorizontal: Space.md, paddingTop: Space.lg, paddingBottom: Space.xl },
  progressWrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.md,
  },
  progressTrack: {
    height: Space.xs,
    borderRadius: Radius.sm,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.textPrimary,
    borderRadius: Radius.sm,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Space.sm,
  },
  progressText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
  },
  skipText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.brand,
  },
  stepContent: {
    gap: Space.sm,
  },
  stepTitle: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    letterSpacing: Type.title.letterSpacing,
  },
  stepSub: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
    letterSpacing: Type.body.letterSpacing,
    marginBottom: Space.md,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  optionCard: {
    width: (SCREEN_W - Space.md * 2 - Space.sm) / 2,
    aspectRatio: 1.2,
    borderRadius: Radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
  },
  optionCardActive: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  optionLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  optionLabelActive: {
    color: colors.background,
  },
  optionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md - 2,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.full,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pillActive: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  pillLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  pillLabelActive: {
    color: colors.background,
  },
  optionsColumn: {
    gap: Space.sm,
  },
  rowOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderRadius: Radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowOptionActive: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  rowOptionLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  rowOptionLabelActive: {
    color: colors.background,
  },
  completeIconWrap: {
    alignItems: 'center',
    marginBottom: Space.md,
  },
  summaryCard: {
    marginTop: Space.md,
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: Space.md,
    gap: Space.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
  },
  summaryValue: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'right',
  },
  footer: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
  },
  });
}
