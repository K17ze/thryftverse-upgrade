import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { Colors } from '../constants/colors';
import { Space, Typography } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import {
  FlagshipHeader,
  FlagshipScreen,
} from '../components/flagship';
import { reportUser, type ReportReason } from '../services/profileApi';
import { useToast } from '../context/ToastContext';

type Props = StackScreenProps<RootStackParamList, 'Report'>;

const REPORT_REASONS: Array<{
  key: ReportReason;
  label: string;
  description: string;
}> = [
  {
    key: 'spam',
    label: 'Spam or misleading',
    description: 'Unwanted promotion, scams or deceptive behaviour',
  },
  {
    key: 'inappropriate',
    label: 'Inappropriate content',
    description: 'Sexual, violent or otherwise unsafe content',
  },
  {
    key: 'counterfeit',
    label: 'Counterfeit activity',
    description: 'Fake goods or misleading authenticity claims',
  },
  {
    key: 'unresponsive',
    label: 'Seller is unresponsive',
    description: 'A transaction concern that could not be resolved',
  },
  {
    key: 'harassment',
    label: 'Harassment',
    description: 'Threatening, abusive or targeted unwanted contact',
  },
  {
    key: 'other',
    label: 'Something else',
    description: 'Tell the moderation team what happened',
  },
];

export default function ReportScreen({ navigation, route }: Props) {
  const { show } = useToast();
  const { type, targetId } = route.params;
  const [selectedReason, setSelectedReason] =
    React.useState<ReportReason | null>(null);
  const [details, setDetails] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSubmitted, setIsSubmitted] = React.useState(false);

  const canSubmit =
    type === 'user' &&
    Boolean(targetId) &&
    Boolean(selectedReason) &&
    !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit || !selectedReason || !targetId) return;
    setIsSubmitting(true);
    try {
      await reportUser(targetId, selectedReason, details.trim() || undefined);
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
            title="Report sent"
            onBack={() => navigation.goBack()}
          />
        }
      >
        <View style={styles.complete}>
          <Ionicons
            name="shield-checkmark-outline"
            size={28}
            color={Colors.textPrimary}
          />
          <Text style={styles.completeTitle}>Thank you for reporting this</Text>
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

  if (type !== 'user' || !targetId) {
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
            color={Colors.textMuted}
          />
          <Text style={styles.completeTitle}>Report target unavailable</Text>
          <Text style={styles.completeBody}>
            This report was opened without a valid account reference. Nothing
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

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Report account"
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
            <ActivityIndicator size="small" color={Colors.textInverse} />
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
            placeholderTextColor={Colors.textMuted}
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

const styles = StyleSheet.create({
  intro: {
    paddingVertical: Space.md,
  },
  introTitle: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: 17,
  },
  introBody: {
    maxWidth: 340,
    marginTop: 5,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  reasons: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  reason: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reasonDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  reasonCopy: {
    minWidth: 0,
    flex: 1,
    gap: 2,
  },
  reasonLabel: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: 14,
  },
  reasonDescription: {
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: Colors.textPrimary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.textPrimary,
  },
  details: {
    marginTop: Space.lg,
  },
  detailsLabel: {
    marginBottom: 7,
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: 13,
  },
  detailsInput: {
    minHeight: 116,
    padding: 13,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
    fontFamily: Typography.family.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  characterCount: {
    marginTop: 5,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: 11,
    textAlign: 'right',
  },
  submitAction: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.textPrimary,
  },
  submitDisabled: {
    opacity: 0.36,
  },
  submitText: {
    color: Colors.textInverse,
    fontFamily: Typography.family.semibold,
    fontSize: 14,
  },
  complete: {
    alignItems: 'center',
    paddingHorizontal: Space.xl,
    paddingTop: 88,
  },
  completeTitle: {
    marginTop: Space.md,
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: 17,
    textAlign: 'center',
  },
  completeBody: {
    maxWidth: 330,
    marginTop: Space.xs,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  doneAction: {
    minWidth: 150,
    minHeight: 44,
    marginTop: Space.lg,
    paddingHorizontal: Space.lg,
    borderRadius: 11,
    backgroundColor: Colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneActionText: {
    color: Colors.textInverse,
    fontFamily: Typography.family.semibold,
    fontSize: 14,
  },
  secondaryDoneAction: {
    minWidth: 140,
    minHeight: 44,
    marginTop: Space.lg,
    paddingHorizontal: Space.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryDoneText: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: 14,
  },
});
