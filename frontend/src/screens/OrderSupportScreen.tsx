import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme } from '../theme/ThemeContext';
import { Colors } from '../constants/colors';
import { Space, Radius, Type, Typography, Elevation } from '../theme/designTokens';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { useHaptic } from '../hooks/useHaptic';
import { Caption, BodyEmphasis, Meta } from '../components/ui/Text';

type Props = StackScreenProps<RootStackParamList, 'OrderSupport'>;

const SUPPORT_TOPICS = [
  { id: 'not_received', icon: 'cube-outline', label: 'Item not received', description: 'My order has not arrived within the expected timeframe.' },
  { id: 'not_as_described', icon: 'alert-circle-outline', label: 'Not as described', description: 'The item condition, size, or authenticity does not match the listing.' },
  { id: 'damaged', icon: 'bandage-outline', label: 'Item arrived damaged', description: 'The item was damaged during shipping or arrived broken.' },
  { id: 'wrong_item', icon: 'shuffle-outline', label: 'Wrong item sent', description: 'I received a different item than what I ordered.' },
  { id: 'return', icon: 'return-down-back-outline', label: 'Request a return', description: 'I want to return the item for a refund.' },
  { id: 'other', icon: 'chatbubble-outline', label: 'Other issue', description: 'Something else is wrong with my order.' },
];

export default function OrderSupportScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const { isDark } = useAppTheme();
  const { show } = useToast();
  const haptic = useHaptic();

  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedTicketId, setSubmittedTicketId] = useState<string | null>(null);

  const createSupportTicketOnApi = useStore((state) => state.createSupportTicketOnApi);

  const canSubmit = selectedTopic && details.trim().length > 10 && !isSubmitting && !isSubmitted;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    haptic.medium();
    setIsSubmitting(true);

    try {
      const topic = SUPPORT_TOPICS.find((t) => t.id === selectedTopic)!;
      const ticketId = await createSupportTicketOnApi({
        orderId,
        topicId: topic.id,
        topicLabel: topic.label,
        details: details.trim(),
      });

      setIsSubmitting(false);
      setIsSubmitted(true);
      setSubmittedTicketId(ticketId);
      show('Support request submitted. We will review and respond within 24 hours.', 'success');
    } catch {
      setIsSubmitting(false);
      show('Unable to submit support request. Please check your connection and try again.', 'error');
    }
  }, [canSubmit, haptic, createSupportTicketOnApi, orderId, selectedTopic, details, show]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScreenHeader
        title="Order Support"
        onBack={() => navigation.goBack()}
      />

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Reanimated.View entering={FadeInDown.duration(300).delay(40)}>
            <Meta color={Colors.textMuted} style={styles.sectionLabel}>SELECT TOPIC</Meta>
            <View style={styles.topicsCard}>
              {SUPPORT_TOPICS.map((topic) => {
                const isActive = selectedTopic === topic.id;
                return (
                  <AnimatedPressable
                    key={topic.id}
                    onPress={() => {
                      haptic.light();
                      setSelectedTopic(topic.id);
                    }}
                    activeOpacity={0.7}
                    scaleValue={0.98}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isActive }}
                    accessibilityLabel={topic.label}
                  >
                    <View style={[styles.topicRow, isActive && styles.topicRowActive]}>
                      <View style={[styles.topicIcon, isActive && styles.topicIconActive]}>
                        <Ionicons
                          name={topic.icon as any}
                          size={20}
                          color={isActive ? Colors.textInverse : Colors.textSecondary}
                        />
                      </View>
                      <View style={styles.topicText}>
                        <Text style={[styles.topicLabel, isActive && styles.topicLabelActive]}>
                          {topic.label}
                        </Text>
                        <Caption
                          color={isActive ? Colors.textInverse : Colors.textMuted}
                          numberOfLines={2}
                        >
                          {topic.description}
                        </Caption>
                      </View>
                      {isActive && (
                        <Ionicons name="checkmark-circle" size={22} color={Colors.textInverse} />
                      )}
                    </View>
                  </AnimatedPressable>
                );
              })}
            </View>
          </Reanimated.View>

          <Reanimated.View entering={FadeInDown.duration(300).delay(80)}>
            <Meta color={Colors.textMuted} style={styles.sectionLabel}>DETAILS</Meta>
            <View style={styles.detailsCard}>
              <AppInput
                value={details}
                onChangeText={setDetails}
                placeholder="Describe your issue in detail..."
                multiline
                maxLength={800}
                inputContainerStyle={styles.textArea}
                accessibilityLabel="Support details input"
              />
              <Text style={styles.charCount}>{details.length}/800</Text>
            </View>
          </Reanimated.View>

          {isSubmitted && submittedTicketId && (
            <Reanimated.View entering={FadeInDown.duration(300)} style={styles.successCard}>
              <Ionicons name="checkmark-circle" size={32} color={Colors.success} />
              <BodyEmphasis style={styles.successTitle}>Request received</BodyEmphasis>
              <Caption color={Colors.textSecondary} style={styles.successSub}>
                Ticket #{submittedTicketId.slice(-8).toUpperCase()}
              </Caption>
              <Caption color={Colors.textMuted} style={styles.successSub}>
                Our support team typically responds within 24 hours.
              </Caption>
            </Reanimated.View>
          )}

          {!isSubmitted && (
            <Reanimated.View entering={FadeInDown.duration(300).delay(120)} style={styles.honestNote}>
              <Ionicons name="time-outline" size={16} color={Colors.textMuted} />
              <Caption color={Colors.textMuted} style={styles.honestNoteText}>
                Our support team typically responds within 24 hours. For urgent issues, contact us through the Help & Support page.
              </Caption>
            </Reanimated.View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {isSubmitted ? (
            <AppButton
              title="Done"
              onPress={() => navigation.goBack()}
              variant="primary"
              size="lg"
              hapticFeedback="medium"
              accessibilityLabel="Close support request"
            />
          ) : (
            <AppButton
              title={isSubmitting ? 'Submitting...' : 'Submit Request'}
              onPress={handleSubmit}
              disabled={!canSubmit}
              variant="primary"
              size="lg"
              style={[!canSubmit && styles.btnDisabled]}
              hapticFeedback="medium"
              accessibilityLabel="Submit support request"
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
    gap: Space.lg,
  },
  sectionLabel: {
    marginLeft: Space.sm,
    letterSpacing: 1.2,
    marginBottom: Space.sm,
  },
  topicsCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    ...Elevation.subtle,
  },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 4,
    paddingVertical: 12,
    paddingHorizontal: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  topicRowActive: {
    backgroundColor: Colors.textPrimary,
  },
  topicIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topicIconActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  topicText: {
    flex: 1,
  },
  topicLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
    marginBottom: 2,
  },
  topicLabelActive: {
    color: Colors.textInverse,
  },
  detailsCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    ...Elevation.subtle,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'right',
    marginTop: Space.xs,
  },
  honestNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingHorizontal: Space.sm,
  },
  honestNoteText: {
    flex: 1,
    lineHeight: Type.caption.lineHeight + 2,
  },
  footer: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  successCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.lg,
    alignItems: 'center',
    gap: Space.sm,
    ...Elevation.subtle,
  },
  successTitle: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginTop: Space.sm,
  },
  successSub: {
    textAlign: 'center',
    lineHeight: Type.caption.lineHeight + 2,
  },
});
