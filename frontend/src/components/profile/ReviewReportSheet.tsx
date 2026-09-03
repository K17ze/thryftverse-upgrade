import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { NativeSheet } from '../../platform/native';
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
  type KeyboardAwareScrollViewRef } from '../../platform/keyboard/KeyboardProvider';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Typography } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { haptics } from '../../utils/haptics';
import { reportReview, type ReviewReportReason } from '../../services/reviewApi';

const REPORT_REASONS: { key: ReviewReportReason; label: string }[] = [
  { key: 'fake_or_incentivized', label: 'Fake or incentivized review' },
  { key: 'harmful_or_abusive', label: 'Harmful or abusive content' },
  { key: 'personal_data', label: 'Contains personal data' },
  { key: 'spam', label: 'Spam or irrelevant' },
  { key: 'other', label: 'Other reason' },
];

interface ReviewReportSheetProps {
  visible: boolean;
  reviewId: string;
  onDismiss: () => void;
  onSubmitted?: () => void;
  onError?: (message: string) => void;
}

export function ReviewReportSheet({
  visible,
  reviewId,
  onDismiss,
  onSubmitted,
  onError }: ReviewReportSheetProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [selected, setSelected] = useState<ReviewReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);

  useEffect(() => {
    if (!visible) {
      setSelected(null);
      setDetails('');
      setIsSubmitting(false);
    }
  }, [visible]);

  const handleSubmit = async () => {
    if (!selected || isSubmitting) return;
    haptics.press();
    setIsSubmitting(true);
    try {
      await reportReview(reviewId, selected, details.trim() || undefined);
      haptics.success();
      onSubmitted?.();
      onDismiss();
    } catch (err: any) {
      haptics.error();
      const message = err?.message ?? 'Could not submit report';
      onError?.(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <NativeSheet visible={visible} onDismiss={onDismiss} snapPoints={[{ fraction: 0.6 }]}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>Report review</Text>
        </View>

        <KeyboardAwareScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {REPORT_REASONS.map((reason) => {
            const isActive = selected === reason.key;
            return (
              <Pressable
                key={reason.key}
                style={({ pressed }) => [
                  styles.reasonRow,
                  { borderBottomColor: colors.borderSubtle },
                  pressed && { opacity: 0.6 },
                ]}
                onPress={() => { haptics.tap(); setSelected(reason.key); }}
                accessibilityRole="radio"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={reason.label}
              >
                <Text
                  style={[
                    styles.reasonLabel,
                    { color: isActive ? colors.brand : colors.textPrimary },
                    isActive && { fontFamily: Typography.family.semibold },
                  ]}
                >
                  {reason.label}
                </Text>
              </Pressable>
            );
          })}

          {selected ? (
            <View style={styles.detailsWrap}>
              <TextInput
                style={[styles.detailsInput, { borderColor: colors.border, color: colors.textPrimary }]}
                value={details}
                onChangeText={setDetails}
                placeholder="Add details (optional)"
                placeholderTextColor={colors.textMuted}
                maxLength={500}
                accessibilityLabel="Report details"
                onFocus={() => {
                  setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
                }}
              />
            </View>
          ) : null}
        </KeyboardAwareScrollView>

        <KeyboardStickyView>
          <AnimatedPressable
            style={[styles.submitBtn, { backgroundColor: colors.brand }, !selected && { opacity: 0.5 }]}
            onPress={handleSubmit}
            activeOpacity={0.85}
            disabled={!selected || isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Submit report"
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <Text style={[styles.submitBtnText, { color: colors.textInverse }]}>
                Submit report
              </Text>
            )}
          </AnimatedPressable>
        </KeyboardStickyView>
      </View>
    </NativeSheet>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1 },
    header: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.xs },
    title: {
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.sm },
    reasonRow: {
      paddingVertical: Space.md + 2,
      borderBottomWidth: StyleSheet.hairlineWidth,
      minHeight: 52,
      justifyContent: 'center' },
    reasonLabel: {
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      fontFamily: TypographyV2.bodyStrong.fontFamily },
    detailsWrap: {
      marginTop: Space.md },
    detailsInput: {
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: Radius.md,
      paddingHorizontal: Space.md,
      paddingVertical: Space.md - 2,
      fontSize: TypographyV2.body.size,
      lineHeight: TypographyV2.body.lineHeight,
      fontFamily: TypographyV2.body.fontFamily,
      minHeight: 48 },
    submitBtn: {
      height: 52,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginHorizontal: Space.md,
      marginTop: Space.sm,
      marginBottom: Space.sm },
    submitBtnText: {
      fontSize: TypographyV2.bodyStrong.size,
      lineHeight: TypographyV2.bodyStrong.lineHeight,
      fontFamily: TypographyV2.bodyStrong.fontFamily } });
}
