import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography, DockConstants } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { useToast } from '../context/ToastContext';
import { fetchCoOwnAssetById } from '../services/marketApi';
import { haptics } from '../utils/haptics';
import { CoOwnMarketHeader, CoOwnStickyActionDock } from '../components/coown';
import { useReducedMotion } from '../hooks/useReducedMotion';

type Props = StackScreenProps<RootStackParamList, 'CoOwnIssue'>;

const CATEGORIES = [
  { value: 'dispute', label: 'Ownership dispute', icon: 'shield-half-outline' as const },
  { value: 'technical', label: 'Technical problem', icon: 'bug-outline' as const },
  { value: 'fraud', label: 'Fraud or scam', icon: 'warning-outline' as const },
  { value: 'other', label: 'Other', icon: 'chatbox-ellipses-outline' as const },
];

export default function CoOwnIssueScreen({ navigation, route }: Props) {
  const { colors, isDark } = useAppTheme();
  const { show } = useToast();
  const insets = useSafeAreaInsets();
  const reducedMotionEnabled = useReducedMotion();
  const scrollBottomPadding = Math.max(insets.bottom, Space.md) + DockConstants.singleActionHeight;
  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [assetTitle, setAssetTitle] = useState<string | null>(null);

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

  const handleSubmit = () => {
    if (!category) {
      show('Select an issue category', 'error');
      return;
    }
    if (!description.trim()) {
      show('Describe the issue', 'error');
      return;
    }
    const categoryLabel = CATEGORIES.find((c) => c.value === category)?.label ?? 'Issue';
    show(`Opening support — reference: ${categoryLabel} for this Co-Own.`, 'info');
    navigation.navigate('HelpSupport');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <CoOwnMarketHeader
        title="Report an issue"
        subtitle="Help us resolve your concern"
        onBack={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: scrollBottomPadding }]} showsVerticalScrollIndicator={false}>
        {/* Asset context — show title, not UUID */}
        {assetId && (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300)}>
            <View style={[styles.assetContext, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="pricetag-outline" size={16} color={colors.textMuted} />
              <Text style={[styles.assetContextLabel, { color: colors.textMuted }]}>Item:</Text>
              <Text style={[styles.assetContextText, { color: colors.textPrimary }]} numberOfLines={1}>
                {assetTitle ?? 'Loading...'}
              </Text>
            </View>
          </Reanimated.View>
        )}

        {/* Issue category */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(50)}>
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
        </Reanimated.View>

        {/* Description */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(100)} style={{ marginTop: Space.lg }}>
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
        </Reanimated.View>

        {/* Note */}
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(150)} style={styles.note}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={[styles.noteText, { color: colors.textMuted }]}>
            Your report will be submitted through the Help & Support flow. Use the description above when contacting support.
          </Text>
        </Reanimated.View>
      </ScrollView>

      {/* Sticky action dock */}
      <CoOwnStickyActionDock>
        <AppButton
          title="Continue to support"
          onPress={handleSubmit}
          variant="primary"
          size="lg"
          hapticFeedback="medium"
          accessibilityLabel="Continue to support"
          style={{ flex: 1 }}
        />
      </CoOwnStickyActionDock>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  assetContext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.md,
    borderWidth: 0.5,
    padding: Space.sm + 2,
    marginBottom: Space.md,
  },
  assetContextLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
  },
  assetContextText: {
    flex: 1,
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.2,
  },
  sectionLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    marginBottom: Space.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  categoryCard: {
    width: '48%',
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Space.md,
    gap: Space.sm,
    alignItems: 'flex-start',
  },
  categoryLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  note: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.lg,
    alignItems: 'flex-start',
  },
  noteText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    lineHeight: 18,
  },
});
