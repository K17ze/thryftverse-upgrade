import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Space, Typography, Type, Radius, Control, Stroke } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import {
  FlagshipHeader,
  FlagshipScreen,
} from '../components/flagship';
import { reportUser, type ReportReason } from '../services/profileApi';
import { reportListing, type ListingReportReason } from '../services/listingsApi';
import { useToast } from '../context/ToastContext';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Report'>;

const REPORT_REASONS: Array<{
  key: ReportReason;
  label: string;
  description: string;
}> = [
  {
    key: 'spam',
    label: 'Spam',
    description: 'Unwanted promotion, scams or repetitive messages',
  },
  {
    key: 'harassment',
    label: 'Harassment',
    description: 'Threatening, abusive or targeted unwanted contact',
  },
  {
    key: 'counterfeit',
    label: 'Fake item',
    description: 'Counterfeit goods or misleading authenticity claims',
  },
  {
    key: 'off_platform',
    label: 'Off-platform request',
    description: 'Asked to transact outside Thryftverse, against policy',
  },
  {
    key: 'other',
    label: 'Something else',
    description: 'Tell the moderation team what happened',
  },
];

export default function ReportScreen({ navigation, route }: Props) {
  const { show } = useToast();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { type, targetId } = route.params;
  const [selectedReason, setSelectedReason] =
    React.useState<ReportReason | null>(null);
  const [details, setDetails] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSubmitted, setIsSubmitted] = React.useState(false);

  const canSubmit =
    Boolean(targetId) &&
    Boolean(selectedReason) &&
    !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit || !selectedReason || !targetId) return;
    setIsSubmitting(true);
    try {
      if (type === 'user') {
        await reportUser(targetId, selectedReason, details.trim() || undefined);
      } else {
        await reportListing(
          targetId,
          selectedReason as ListingReportReason,
          details.trim() || undefined
        );
      }
      setIsSubmitted(true);
    } catch {
      show('The report could not be sent. Check your connection and try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Report submitted"
            onBack={() => navigation.goBack()}
          />
        }
      >
        <View style={styles.complete}>
          <Ionicons
            name="shield-checkmark-outline"
            size={28}
            color={colors.textPrimary}
          />
          <Text style={styles.completeTitle}>Report submitted</Text>
          <Text style={styles.completeBody}>
            The moderation team received your report. Blocking is available
            separately if you no longer want contact from this account.
          </Text>
          <AnimatedPressable
            style={styles.doneAction}
            onPress={() => navigation.goBack()}
            activeOpacity={0.78}
            scaleValue={0.98}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Text style={styles.doneActionText}>Done</Text>
          </AnimatedPressable>
        </View>
      </FlagshipScreen>
    );
  }

  if (!targetId) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Report"
            onBack={() => navigation.goBack()}
          />
        }
      >
        <View style={styles.complete}>
          <Ionicons
            name="alert-circle-outline"
            size={28}
            color={colors.textMuted}
          />
          <Text style={styles.completeTitle}>Report target unavailable</Text>
          <Text style={styles.completeBody}>
            This report was opened without a valid reference. Nothing
            has been submitted.
          </Text>
          <AnimatedPressable
            style={styles.secondaryDoneAction}
            onPress={() => navigation.goBack()}
            activeOpacity={0.72}
            scaleValue={0.98}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.secondaryDoneText}>Go back</Text>
          </AnimatedPressable>
        </View>
      </FlagshipScreen>
    );
  }

  const reportTitle = type === 'user' ? 'Report account' : 'Report listing';

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title={reportTitle}
          subtitle="Reports are confidential"
          onBack={() => navigation.goBack()}
        />
      }
      stickyFooter={
        <AnimatedPressable
          style={[styles.submitAction, !canSubmit && styles.submitDisabled]}
          onPress={handleSubmit}
          activeOpacity={0.78}
          scaleValue={0.985}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel="Send report"
          accessibilityState={{ disabled: !canSubmit, busy: isSubmitting }}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <Text style={styles.submitText}>Send report</Text>
          )}
        </AnimatedPressable>
      }
      footerInsetHeight={96}
    >
      <View style={styles.intro}>
        <Text style={styles.introTitle}>What happened?</Text>
        <Text style={styles.introBody}>
          Choose the reason that best describes the issue. Do not include
          passwords, payment details or other sensitive information.
        </Text>
      </View>

      <View style={styles.reasons}>
        {REPORT_REASONS.map((reason, index) => {
          const selected = selectedReason === reason.key;
          return (
            <AnimatedPressable
              key={reason.key}
              style={[
                styles.reason,
                index < REPORT_REASONS.length - 1 && styles.reasonDivider,
              ]}
              onPress={() => setSelectedReason(reason.key)}
              activeOpacity={0.68}
              scaleValue={0.99}
              hapticFeedback="selection"
              accessibilityRole="radio"
              accessibilityLabel={reason.label}
              accessibilityHint={reason.description}
              accessibilityState={{ selected }}
            >
              <View style={styles.reasonCopy}>
                <Text style={styles.reasonLabel}>{reason.label}</Text>
                <Text style={styles.reasonDescription}>
                  {reason.description}
                </Text>
              </View>
              <View style={[styles.radio, selected && styles.radioSelected]}>
                {selected ? <View style={styles.radioDot} /> : null}
              </View>
            </AnimatedPressable>
          );
        })}
      </View>

      {selectedReason === 'other' ? (
        <View style={styles.details}>
          <Text style={styles.detailsLabel}>Additional details</Text>
          <TextInput
            style={styles.detailsInput}
            value={details}
            onChangeText={setDetails}
            placeholder="Describe what happened"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={500}
            textAlignVertical="top"
            accessibilityLabel="Additional report details"
          />
          <Text style={styles.characterCount}>{details.length}/500</Text>
        </View>
      ) : null}
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  intro: {
    paddingVertical: Space.md,
  },
  introTitle: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  introBody: {
    maxWidth: 340,
    marginTop: Space.xs,
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight + 2,
  },
  reasons: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  reason: {
    minHeight: Control.hit + Space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  reasonDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  reasonCopy: {
    minWidth: 0,
    flex: 1,
    gap: Space.xs / 2,
  },
  reasonLabel: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
  },
  reasonDescription: {
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight + 2,
  },
  radio: {
    width: Space.lg - Space.xs,
    height: Space.lg - Space.xs,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.textPrimary,
  },
  radioDot: {
    width: Space.sm + 2,
    height: Space.sm + 2,
    borderRadius: Radius.full,
    backgroundColor: colors.textPrimary,
  },
  details: {
    marginTop: Space.lg,
  },
  detailsLabel: {
    marginBottom: Space.xs + 2,
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
  },
  detailsInput: {
    minHeight: Space.xl * 3 + Space.md + Space.xs,
    padding: Space.md,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    borderRadius: Radius.md,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    fontFamily: Typography.family.regular,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
  },
  characterCount: {
    marginTop: Space.xs,
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    letterSpacing: Type.meta.letterSpacing,
    textAlign: 'right',
  },
  submitAction: {
    minHeight: Space.xxl,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.textPrimary,
  },
  submitDisabled: {
    opacity: 0.36,
  },
  submitText: {
    color: colors.textInverse,
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
  },
  complete: {
    alignItems: 'center',
    paddingHorizontal: Space.xl,
    paddingTop: Control.hit * 2,
  },
  completeTitle: {
    marginTop: Space.md,
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    letterSpacing: Type.subtitle.letterSpacing,
    textAlign: 'center',
  },
  completeBody: {
    maxWidth: 330,
    marginTop: Space.xs,
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight + 2,
    textAlign: 'center',
  },
  doneAction: {
    minWidth: 150,
    minHeight: Control.hit,
    marginTop: Space.lg,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.full,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneActionText: {
    color: colors.textInverse,
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
  },
  secondaryDoneAction: {
    minWidth: 140,
    minHeight: Control.hit,
    marginTop: Space.lg,
    paddingHorizontal: Space.lg,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryDoneText: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
  },
  });
}
