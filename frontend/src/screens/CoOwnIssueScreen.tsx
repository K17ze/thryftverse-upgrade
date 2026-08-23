import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, DockConstants, Stroke } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { useToast } from '../context/ToastContext';
import { fetchCoOwnAssetById, createCoOwnAssetIssue } from '../services/marketApi';
import { haptics } from '../utils/haptics';
import { CoOwnStickyActionDock } from '../components/coown';
import { useScreenCaptureProtection } from '../platform/screenCapture';

type Props = NativeStackScreenProps<RootStackParamList, 'CoOwnIssue'>;

const CATEGORIES = [
  { value: 'dispute', label: 'Ownership dispute', icon: 'shield-half-outline' as const },
  { value: 'technical', label: 'Technical problem', icon: 'bug-outline' as const },
  { value: 'fraud', label: 'Fraud or scam', icon: 'warning-outline' as const },
  { value: 'other', label: 'Other', icon: 'chatbox-ellipses-outline' as const },
];

export default function CoOwnIssueScreen({ navigation, route }: Props) {
  useScreenCaptureProtection();
  const { colors } = useAppTheme();
  const { show } = useToast();
  const insets = useSafeAreaInsets();
  const scrollBottomPadding = Math.max(insets.bottom, Space.md) + DockConstants.singleActionHeight;
  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [assetTitle, setAssetTitle] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const assetId = route.params?.assetId;

  // Fetch the asset title so we can show it instead of the raw UUID.
  React.useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    fetchCoOwnAssetById(assetId)
      .then((asset) => {
        if (!cancelled) setAssetTitle(asset.title);
      })
      .catch(() => {
        if (!cancelled) setAssetTitle(null);
      });
    return () => { cancelled = true; };
  }, [assetId]);

  const handleSubmit = async () => {
    if (!category) {
      show('Select an issue category', 'error');
      return;
    }
    if (!description.trim()) {
      show('Describe the issue', 'error');
      return;
    }
    if (!assetId) {
      show('Unable to submit — missing asset context', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await createCoOwnAssetIssue({
        assetId,
        category: category as 'dispute' | 'technical' | 'fraud' | 'other',
        description: description.trim(),
      });
      haptics.success();
      show('Issue reported. Our team will review it shortly.', 'success');
      navigation.navigate('HelpSupport');
    } catch {
      haptics.error();
      // Backend endpoint may not be deployed yet — fall back to support chat
      // so the user can still get help.
      show('Could not submit report. Please describe this issue in the support chat.', 'info');
      navigation.navigate('HelpSupport');
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
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: scrollBottomPadding }]} showsVerticalScrollIndicator={false}>
        {/* Asset context — show title, not UUID */}
        {assetId && (
          <View style={[styles.assetContext, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="pricetag-outline" size={16} color={colors.textMuted} />
            <Text style={[styles.assetContextLabel, { color: colors.textMuted }]}>Item:</Text>
            <Text style={[styles.assetContextText, { color: colors.textPrimary }]} numberOfLines={1}>
              {assetTitle ?? 'Loading...'}
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
                      borderColor: active ? colors.brand : colors.border,
                    },
                  ]}
                  onPress={() => { haptics.selection(); setCategory(cat.value); }}
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
        </View>

        {/* Description */}
        <View style={{ marginTop: Space.lg }}>
          <AppInput
            label="Description"
            placeholder="Describe what happened and what you need..."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            containerStyle={{ marginBottom: 0 }}
          />
        </View>

        {/* Note — trust card */}
        <View style={styles.note}>
          <View style={[styles.noteCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.noteIconWrap, { backgroundColor: colors.surfaceAlt }]}>
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
      </ScrollView>

      {/* Sticky action dock */}
      <CoOwnStickyActionDock>
        <AppButton
          title={isSubmitting ? 'Submitting…' : 'Submit report'}
          onPress={handleSubmit}
          variant="primary"
          size="lg"
          loading={isSubmitting}
          disabled={isSubmitting || !category || !description.trim()}
          hapticFeedback="medium"
          accessibilityLabel="Submit issue report"
          style={{ flex: 1 }}
        />
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
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
  assetContextText: {
    flex: 1,
    fontSize: Type.bodyStrong.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyStrong.letterSpacing,
    lineHeight: Type.bodyStrong.lineHeight,
  },
  sectionLabel: {
    fontSize: Type.label.size,
    fontFamily: Typography.family.semibold,
    marginBottom: Space.sm,
    textTransform: 'uppercase',
    letterSpacing: Type.label.letterSpacing,
    lineHeight: Type.label.lineHeight,
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
    fontSize: Type.bodyStrong.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyStrong.letterSpacing,
    lineHeight: Type.bodyStrong.lineHeight,
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
    fontSize: Type.bodyStrong.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyStrong.letterSpacing,
    lineHeight: Type.bodyStrong.lineHeight,
    marginBottom: Space.xs / 2,
  },
  noteText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
});
