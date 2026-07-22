import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppButton } from '../ui/AppButton';
import { haptics } from '../../utils/haptics';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CoOwnFirstTradeGuideProps {
  visible: boolean;
  onClose: () => void;
  onComplete: () => void;
  onContinueToTrade?: () => void;
}

interface GuideStep {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
  keyTakeaway?: string;
}

// ── Guide content ────────────────────────────────────────────────────────────

const GUIDE_STEPS: GuideStep[] = [
  {
    icon: 'pie-chart-outline',
    title: 'What you own',
    body: 'Each instrument has a finite number of asset-specific units. Your settled units and ownership percentage are recorded against that instrument; 1ZE is the currency used to place and settle orders.',
    keyTakeaway: 'Asset units are ownership; 1ZE is settlement currency',
  },
  {
    icon: 'cart-outline',
    title: 'How buying works',
    body: 'Choose a quantity and review the protected price, maximum 1ZE reservation, fees, and estimated result before submitting. An accepted order may fill fully, partially, or remain open.',
    keyTakeaway: 'Review the maximum reservation before submitting',
  },
  {
    icon: 'swap-horizontal-outline',
    title: 'How selling works',
    body: 'Only settled, unreserved units can be offered for sale. A limit order fills only when compatible demand is available, so an exit can take time or may not fill at your chosen price.',
    keyTakeaway: 'An exit is not guaranteed',
  },
  {
    icon: 'warning-outline',
    title: 'Liquidity & risk',
    body: 'Co-Own units are not cash. Prices can move, market data can become stale, and thin markets may use an auction or request-for-quote flow. Only commit value you can afford to hold.',
    keyTakeaway: 'Only invest what you can afford to hold',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Rights & custody',
    body: 'Read the instrument dossier for its recorded provenance, custody, insurance, valuation, transfer limits, and current rights version. If required rights remain incomplete, trading stays disabled.',
    keyTakeaway: 'Rights are instrument-specific and versioned',
  },
];

// ── Component ────────────────────────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');

export function CoOwnFirstTradeGuide({
  visible,
  onClose,
  onComplete,
  onContinueToTrade,
}: CoOwnFirstTradeGuideProps) {
  const { colors } = useAppTheme();
  const [currentStep, setCurrentStep] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const isLastStep = currentStep === GUIDE_STEPS.length - 1;
  const step = GUIDE_STEPS[currentStep];
  const stepIconColor = currentStep === 3 ? colors.warning : colors.textPrimary;

  const handleNext = useCallback(() => {
    if (isLastStep) {
      haptics.success();
      onComplete();
      return;
    }
    haptics.tap();
    setCurrentStep((prev) => prev + 1);
    scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
  }, [isLastStep, onComplete]);

  const handleBack = useCallback(() => {
    if (currentStep === 0) {
      onClose();
      return;
    }
    setCurrentStep((prev) => prev - 1);
    scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
  }, [currentStep, onClose]);

  const handleSkip = useCallback(() => {
    haptics.tap();
    onClose();
  }, [onClose]);

  const handleContinueToTrade = useCallback(() => {
    haptics.press();
    onComplete();
    onContinueToTrade?.();
  }, [onComplete, onContinueToTrade]);

  // Reset to first step when reopened
  React.useEffect(() => {
    if (visible) setCurrentStep(0);
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.background }]} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.headerIcon, { backgroundColor: `${colors.brand}15` }]}>
                <Ionicons name="school-outline" size={18} color={colors.brand} />
              </View>
              <View>
                <Text style={[styles.title, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.25}>Before your first order</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  Ownership, settlement and exit in five steps
                </Text>
              </View>
            </View>
            <Pressable
              onPress={handleSkip}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Skip guide"
            >
              <Text style={[styles.skipText, { color: colors.textMuted }]}>Skip</Text>
            </Pressable>
          </View>

          {/* Progress dots */}
          <View style={styles.progressRow}>
            {GUIDE_STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.progressDot,
                  { backgroundColor: i <= currentStep ? colors.brand : colors.border },
                  i === currentStep && styles.progressDotActive,
                ]}
              />
            ))}
          </View>

          {/* Step content */}
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.stepCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.stepIconWrap, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name={step.icon as any} size={32} color={stepIconColor} />
              </View>
              <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>{step.title}</Text>
              <Text style={[styles.stepBody, { color: colors.textSecondary }]}>
                {step.body}
              </Text>

              {step.keyTakeaway && (
                <View style={[styles.takeawayBox, { backgroundColor: `${colors.brand}08`, borderColor: `${colors.brand}25` }]}>
                  <Ionicons name="bulb-outline" size={14} color={colors.brand} />
                  <Text style={[styles.takeawayText, { color: colors.textPrimary }]}>
                    {step.keyTakeaway}
                  </Text>
                </View>
              )}

              {/* Recap summary on the last step */}
              {isLastStep && (
                <View style={[styles.recapBox, { backgroundColor: `${colors.brand}06`, borderColor: `${colors.brand}20` }]}>
                  <Text style={[styles.recapTitle, { color: colors.textPrimary }]}>Quick recap</Text>
                  {GUIDE_STEPS.filter((s) => s.keyTakeaway).map((s, i) => (
                    <View key={i} style={styles.recapRow}>
                      <Ionicons name="checkmark-circle-outline" size={13} color={colors.brand} />
                      <Text style={[styles.recapItem, { color: colors.textSecondary }]}>
                        {s.keyTakeaway}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Step counter */}
            <Text style={[styles.stepCounter, { color: colors.textMuted }]}>
              Step {currentStep + 1} of {GUIDE_STEPS.length}
            </Text>
          </ScrollView>

          {/* Footer */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <AnimatedPressable
              style={[styles.backBtn, { borderColor: colors.border }]}
              onPress={handleBack}
              activeOpacity={0.8}
              scaleValue={0.97}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel={currentStep === 0 ? 'Close guide' : 'Previous step'}
            >
              <Ionicons name="arrow-back" size={16} color={colors.textSecondary} />
              <Text style={[styles.backBtnText, { color: colors.textSecondary }]}>
                {currentStep === 0 ? 'Close' : 'Back'}
              </Text>
            </AnimatedPressable>

            {isLastStep ? (
              <View style={styles.footerRight}>
                {onContinueToTrade && (
                  <AppButton
                    title="Start trading"
                    icon={<Ionicons name="arrow-forward" size={16} color={colors.textInverse} />}
                    variant="primary"
                    size="md"
                    onPress={handleContinueToTrade}
                    style={styles.continueBtn}
                    accessibilityLabel="Complete guide and start trading"
                  />
                )}
                <AppButton
                  title="Got it"
                  variant={onContinueToTrade ? 'secondary' : 'primary'}
                  size="md"
                  onPress={handleNext}
                  style={styles.gotItBtn}
                  accessibilityLabel="Complete guide"
                />
              </View>
            ) : (
              <AppButton
                title="Next"
                icon={<Ionicons name="arrow-forward" size={16} color={colors.textInverse} />}
                variant="primary"
                size="md"
                onPress={handleNext}
                accessibilityLabel="Next step"
              />
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingBottom: Space.xl,
    maxHeight: '85%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: Space.sm,
    marginBottom: Space.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    flex: 1,
    paddingRight: Space.sm,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  title: {
    fontSize: 17,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    lineHeight: 17,
  },
  skipText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    marginTop: 4,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
  },
  progressDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  progressDotActive: {
    width: 20,
    borderRadius: 4,
  },
  scroll: {
    paddingHorizontal: Space.md,
  },
  scrollContent: {
    paddingBottom: Space.lg,
  },
  stepCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.lg,
    alignItems: 'center',
    gap: Space.md,
  },
  stepIconWrap: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  stepBody: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    lineHeight: 22,
    textAlign: 'center',
  },
  takeawayBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: Space.xs,
  },
  takeawayText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    lineHeight: 18,
  },
  recapBox: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    marginTop: Space.sm,
    gap: 6,
  },
  recapTitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    marginBottom: 2,
  },
  recapRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  recapItem: {
    flex: 1,
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    lineHeight: 16,
  },
  stepCounter: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    textAlign: 'center',
    marginTop: Space.md,
    letterSpacing: 0.3,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  backBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  continueBtn: {
    // AppButton handles its own sizing
  },
  gotItBtn: {
    // AppButton handles its own sizing
  },
});
