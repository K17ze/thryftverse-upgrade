import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, DockConstants, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { useToast } from '../context/ToastContext';
import { fetchCoOwnAssetById, createCoOwnAssetIssue } from '../services/marketApi';
import { haptics } from '../utils/haptics';
import { useConnectivity } from '../hooks/useConnectivity';
import { CoOwnStickyActionDock, CoOwnOfflineBanner } from '../components/coown';
import { useScreenCaptureProtection } from '../platform/screenCapture';
import { parseApiError } from '../lib/apiClient';

type Props = NativeStackScreenProps<RootStackParamList, 'CoOwnIssue'>;

const CATEGORIES = [
  { value: 'dispute', label: 'Ownership dispute', icon: 'alert-circle-outline' as const },
  { value: 'technical', label: 'Technical problem', icon: 'bug-outline' as const },
  { value: 'fraud', label: 'Fraud or scam', icon: 'warning-outline' as const },
  { value: 'other', label: 'Other', icon: 'chatbox-ellipses-outline' as const },
];

export default function CoOwnIssueScreen({ navigation, route }: Props) {
  useScreenCaptureProtection();
  const { colors } = useAppTheme();
  const { show } = useToast();
  const { isOffline } = useConnectivity();
  const insets = useSafeAreaInsets();
  const scrollBottomPadding = Math.max(insets.bottom, Space.md) + DockConstants.singleActionHeight;
  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [assetTitle, setAssetTitle] = useState<string | null>(null);
  const [isAssetTitleLoading, setIsAssetTitleLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedCaseId, setSubmittedCaseId] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);

  const assetId = route.params?.assetId;

  // Fetch the asset title so we can show it instead of the raw UUID.
  React.useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    setIsAssetTitleLoading(true);
    fetchCoOwnAssetById(assetId)
      .then((asset) => {
        if (!cancelled) {
          setAssetTitle(asset.title);
          setIsAssetTitleLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAssetTitle(null);
          setIsAssetTitleLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [assetId]);

  const handleSubmit = async () => {
    // Inline validation — clear errors first, then re-validate
    let hasError = false;
    if (!category) {
      setCategoryError('Select an issue category');
      hasError = true;
    } else {
      setCategoryError(null);
    }
    if (description.trim().length < 10) {
      setDescriptionError('Add at least 10 characters so the team can investigate.');
      hasError = true;
    } else {
      setDescriptionError(null);
    }
    if (hasError) {
      haptics.error();
      return;
    }
    if (!assetId) {
      show('Unable to submit — missing asset context', 'error');
      return;
    }

    // Offline — fail fast and keep the draft rather than letting the
    // request hang and die on a network error toast.
    if (isOffline) {
      show('You are offline. Your report is kept here — reconnect and retry.', 'info');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createCoOwnAssetIssue({
        assetId,
        category: category as 'dispute' | 'technical' | 'fraud' | 'other',
        description: description.trim(),
      });
      haptics.success();
      setSubmittedCaseId(result.id);
      setIsSubmitted(true);
      show('Issue reported. Our team will review it shortly.', 'success');
    } catch (error) {
      haptics.error();
      // Draft is preserved — user can retry without re-entering
      const parsed = parseApiError(error, 'Could not submit this report. Your text is still here; please retry.');
      show(parsed.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Report an issue"
          subtitle="Help us resolve your concern"
          onBack={() => navigation.goBack()}
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <CoOwnOfflineBanner isOffline={isOffline} />
      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: scrollBottomPadding }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {isSubmitted && submittedCaseId ? (
          /* ── Confirmation view with case reference ── */
          <View style={styles.confirmation}>
            <View style={[styles.confirmationIcon, { backgroundColor: colors.success }]}>
              <Ionicons name="checkmark" size={28} color={colors.surface} />
            </View>
            <Text style={[styles.confirmationTitle, { color: colors.textPrimary }]}>
              Case submitted
            </Text>
            <Text style={[styles.confirmationCaseId, { color: colors.textSecondary }]}>
              Reference #{submittedCaseId.slice(-8).toUpperCase()}
            </Text>
            <Text style={[styles.confirmationText, { color: colors.textMuted }]}>
              Our support team will review your report and respond shortly. Keep this reference for follow-up.
            </Text>
            {assetId && (
              <View style={[styles.assetContext, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="bag-handle-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.assetContextLabel, { color: colors.textMuted }]}>Item:</Text>
                <Text style={[styles.assetContextText, { color: colors.textPrimary }]} numberOfLines={1}>
                  {assetTitle ?? 'Item unavailable'}
                </Text>
              </View>
            )}
          </View>
        ) : (
          <>
            {/* Asset context — show title, not UUID */}
            {assetId && (
              <View style={[styles.assetContext, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="bag-handle-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.assetContextLabel, { color: colors.textMuted }]}>Item:</Text>
                <Text style={[styles.assetContextText, { color: colors.textPrimary }]} numberOfLines={1}>
                  {assetTitle ?? (isAssetTitleLoading ? 'Loading…' : 'Item unavailable')}
                </Text>
              </View>
            )}

            {/* Issue category */}
            <View>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Issue category</Text>
              <View style={styles.categoryGrid}>
                {CATEGORIES.map((cat) => {
                  const active = category === cat.value;
                  return (
                    <AnimatedPressable
                      key={cat.value}
                      style={[
                        styles.categoryCard,
                        {
                          backgroundColor: active ? colors.surfaceAlt : colors.surface,
                          borderColor: active ? colors.brand : categoryError ? colors.danger : colors.border,
                        },
                      ]}
                      onPress={() => { haptics.selection(); setCategory(cat.value); setCategoryError(null); }}
                      scaleValue={0.97}
                      hapticFeedback="light"
                      accessibilityRole="button"
                      accessibilityLabel={cat.label}
                      accessibilityState={{ selected: active }}
                    >
                      <Ionicons name={cat.icon} size={22} color={active ? colors.brand : colors.textSecondary} />
                      <Text style={[styles.categoryLabel, { color: active ? colors.brand : colors.textPrimary }]}>
                        {cat.label}
                      </Text>
                    </AnimatedPressable>
                  );
                })}
              </View>
              {categoryError && (
                <Text style={[styles.inlineError, { color: colors.danger }]}>
                  {categoryError}
                </Text>
              )}
            </View>

            {/* Description */}
            <View style={{ marginTop: Space.lg }}>
              <AppInput
                label="Description"
                placeholder="Describe what happened and what you need..."
                value={description}
                onChangeText={(text) => { setDescription(text); setDescriptionError(null); }}
                maxLength={4000}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                containerStyle={{ marginBottom: 0 }}
              />
              {descriptionError && (
                <Text style={[styles.inlineError, { color: colors.danger }]}>
                  {descriptionError}
                </Text>
              )}
            </View>

            {/* Note — trust card */}
            <View style={styles.note}>
              <View style={[styles.noteCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.noteIconWrap}>
                  <Ionicons name="information-circle" size={16} color={colors.textSecondary} />
                </View>
                <View style={styles.noteTextWrap}>
                  <Text style={[styles.noteTitle, { color: colors.textPrimary }]}>
                    How this works
                  </Text>
                  <Text style={[styles.noteText, { color: colors.textMuted }]}>
                    Your report will be submitted to our support team for review. You can follow up in the Help & Support chat if needed.
                  </Text>
                </View>
              </View>
            </View>
          </>
        )}
      </KeyboardAwareScrollView>

      {/* Sticky action dock */}
      <CoOwnStickyActionDock>
        {isSubmitted ? (
          <AppButton
            title="Done"
            onPress={() => navigation.goBack()}
            variant="primary"
            size="lg"
            hapticFeedback="medium"
            accessibilityLabel="Close issue report"
            style={{ flex: 1 }}
          />
        ) : (
          <AppButton
            title={isSubmitting ? 'Submitting…' : 'Submit report'}
            onPress={handleSubmit}
            variant="primary"
            size="lg"
            loading={isSubmitting}
            disabled={isSubmitting || !category || description.trim().length < 10}
            hapticFeedback="medium"
            accessibilityLabel="Submit issue report"
            style={{ flex: 1 }}
          />
        )}
      </CoOwnStickyActionDock>
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  assetContext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.sm + 2,
    marginBottom: Space.lg,
  },
  assetContextLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    lineHeight: TypographyV2.meta.lineHeight,
  },
  assetContextText: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
  },
  sectionLabel: {
    fontSize: TypographyV2.label.size,
    fontFamily: TypographyV2.label.fontFamily,
    marginBottom: Space.sm,
    textTransform: 'uppercase',
    letterSpacing: TypographyV2.label.letterSpacing,
    lineHeight: TypographyV2.label.lineHeight,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  categoryCard: {
    width: '48%',
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    padding: Space.md,
    gap: Space.sm,
    alignItems: 'flex-start',
  },
  categoryLabel: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
  },
  note: {
    marginTop: Space.lg,
  },
  noteCard: {
    flexDirection: 'row',
    gap: Space.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
  },
  noteIconWrap: {
    width: Space.xl - Space.xs,
    height: Space.xl - Space.xs,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noteTextWrap: {
    flex: 1,
  },
  noteTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    marginBottom: Space.xs / 2,
  },
  noteText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    lineHeight: TypographyV2.meta.lineHeight,
  },
  inlineError: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight,
    marginTop: Space.xs,
  },
  // ── Confirmation ──
  confirmation: {
    alignItems: 'center',
    paddingVertical: Space.xl,
    gap: Space.sm,
  },
  confirmationIcon: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Space.sm,
  },
  confirmationTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
  },
  confirmationCaseId: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  confirmationText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    lineHeight: TypographyV2.body.lineHeight,
    textAlign: 'center',
    paddingHorizontal: Space.lg,
  },
});
