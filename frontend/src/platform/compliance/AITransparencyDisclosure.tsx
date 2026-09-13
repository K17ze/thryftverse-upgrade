/**
 * EU AI Act transparency disclosure component.
 *
 * Displays a modal/sheet explaining which AI features are used in the app,
 * what data is processed, how recommendations work, and what control
 * options the user has. Required by the EU AI Act (effective 2026).
 *
 * Should be shown on first use of AI features and accessible from
 * Settings → AI Preferences.
 *
 * @example
 * ```tsx
 * <AITransparencyDisclosure
 *   features={['recommendations', 'search', 'image-labeling']}
 *   visible={showDisclosure}
 *   onDismiss={() => setShowDisclosure(false)}
 * />
 * ```
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  AccessibilityRole,
  Linking } from 'react-native';
import { appStorage } from '../../storage/mmkv';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { getAlgorithmDemoMode } from '../../services/algorithmTransparencyApi';
import { CONVERSATIONAL_SEARCH_DEMO_MODE } from '../../services/conversationalSearchApi';

const DISMISSED_KEY = '@thryftverse/ai_disclosure_dismissed';
const DISMISSED_TIMESTAMP_KEY = '@thryftverse/ai_disclosure_dismissed_at';

export type AIFeature =
  | 'recommendations'
  | 'search'
  | 'image-labeling'
  | 'conversational-search'
  | 'price-prediction'
  | 'fraud-detection';

export interface AITransparencyDisclosureProps {
  /** List of AI features used. Defaults to all known features. */
  features?: AIFeature[];
  /** Whether the modal is visible. */
  visible: boolean;
  /** Called when the user dismisses the disclosure. */
  onDismiss: () => void;
}

interface FeatureInfo {
  title: string;
  description: string;
  /** Description shown when the feature is in demo/illustrative mode. */
  demoDescription?: string;
  dataProcessed: string[];
}

const FEATURE_INFO: Record<AIFeature, FeatureInfo> = {
  recommendations: {
    title: 'Personalized Recommendations',
    description:
      'We use a recommendation engine that analyses your browsing history, likes, purchases, and saved items to suggest listings you may be interested in. The model runs on our servers and does not access your private messages.',
    demoDescription:
      'Recommendations are shown in demo mode using illustrative data. No browsing history or personal data is processed by a server-side model. When the recommendation engine is live, it will analyse your activity to suggest relevant listings.',
    dataProcessed: ['Browsing history', 'Liked items', 'Purchase history', 'Saved searches'] },
  search: {
    title: 'Search Ranking',
    description:
      'Search results are ranked by text relevance and listing-quality signals such as completeness, photos and recency. Ranking is deterministic — it does not use a machine-learning model trained on your behaviour.',
    dataProcessed: ['Search queries', 'Listing metadata'] },
  'image-labeling': {
    title: 'Photo Detail Hints',
    description:
      'When you add listing photos, we may suggest a title, brand or category based on the photo file name and your own hints. No image recognition is used, and every suggestion is shown for your review before it is applied.',
    dataProcessed: ['Photo file names', 'Your own listing inputs'] },
  'conversational-search': {
    title: 'Natural-language search',
    description:
      'You can search using everyday phrases like "vintage denim under £50". Your query is matched against known keywords — brands, categories, colours, sizes, conditions and price ranges — and listings are ranked by keyword relevance. This is heuristic keyword matching, not AI: no language model interprets your intent. Queries may be logged for error diagnosis.',
    demoDescription:
      'Natural-language search is in demo mode. Your query is processed on-device using the same keyword matching as the live service, against illustrative results. No AI or language model is used in either mode.',
    dataProcessed: ['Search query text'] },
  'price-prediction': {
    title: 'Price Guidance',
    description:
      'For listings and Co-Own assets we show reference ranges based on category resale averages or the most recent settled distributions. These are reference ranges — not machine-generated forecasts and not financial advice.',
    dataProcessed: ['Category resale averages', 'Settled distribution history'] },
  'fraud-detection': {
    title: 'Fraud Detection',
    description:
      'We use rules-based checks to flag potentially fraudulent activity, such as unusual transaction patterns or off-platform payment requests. Flagged activity is sent for human review — no automated system takes action on your account on its own.',
    dataProcessed: ['Transaction patterns', 'Account metadata', 'Listing content'] } };

// Only features that actually exist on this deployment are listed by
// default. 'image-labeling' and 'price-prediction' remain in FEATURE_INFO
// with honest descriptions for any surface that passes them explicitly,
// but they are not presented as AI features — photo hints are file-name
// heuristics and price guidance is a settled-history reference range.
const ALL_FEATURES: AIFeature[] = [
  'recommendations',
  'search',
  'conversational-search',
  'fraud-detection',
];

/**
 * Returns true if the user has previously dismissed the AI disclosure.
 * Used to decide whether to show it on first use of an AI feature.
 */
export function hasDismissedAIDisclosure(): boolean {
  try {
    return appStorage.getBoolean(DISMISSED_KEY) === true;
  } catch {
    return false;
  }
}

/**
 * Records that the user has dismissed the AI disclosure. The disclosure
 * can be re-shown from Settings → AI Preferences.
 */
export function markAIDisclosureDismissed(): void {
  try {
    appStorage.set(DISMISSED_KEY, true);
    appStorage.set(DISMISSED_TIMESTAMP_KEY, Date.now());
  } catch {
    // Best-effort.
  }
}

/**
 * Clears the dismissed state so the disclosure shows again on next
 * AI feature use.
 */
export function resetAIDisclosureDismissed(): void {
  try {
    appStorage.remove(DISMISSED_KEY);
    appStorage.remove(DISMISSED_TIMESTAMP_KEY);
  } catch {
    // Best-effort.
  }
}

export function AITransparencyDisclosure({
  features = ALL_FEATURES,
  visible,
  onDismiss }: AITransparencyDisclosureProps): React.JSX.Element | null {
  const { colors } = useAppTheme();
  const [expandedFeature, setExpandedFeature] = useState<AIFeature | null>(null);

  const activeFeatures = useMemo(
    () => features.map((f) => {
      const info = FEATURE_INFO[f];
      if (!info) return null;
      // Use demo description when the feature is in demo mode and a demo
      // description is available — truthful UI per AGENTS.md §11.
      const useDemo =
        (f === 'recommendations' && getAlgorithmDemoMode()) ||
        (f === 'conversational-search' && CONVERSATIONAL_SEARCH_DEMO_MODE);
      return useDemo && info.demoDescription
        ? { ...info, description: info.demoDescription }
        : info;
    }).filter((info): info is FeatureInfo => info !== null),
    [features],
  );

  const handleDismiss = useCallback(() => {
    markAIDisclosureDismissed();
    onDismiss();
  }, [onDismiss]);

  const handleContact = useCallback(() => {
    Linking.openURL('mailto:ai-transparency@thryftverse.com');
  }, []);

  const handlePrivacyPolicy = useCallback(() => {
    Linking.openURL('https://thryftverse.com/privacy');
  }, []);

  if (!visible) return null;

  const summaryRole: AccessibilityRole = 'summary';

  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '85%',
      paddingBottom: 34 },
    header: {
      paddingHorizontal: Space.lg,
      paddingTop: Space.lg,
      paddingBottom: 12 },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: Space.md },
    title: {
      fontSize: TypographyV2.screenTitle.size,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 6 },
    subtitle: {
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.textSecondary,
      lineHeight: TypographyV2.bodyStrong.lineHeight },
    sectionLabel: {
      fontSize: TypographyV2.label.size,
      fontWeight: '600',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: Space.lg,
      paddingTop: 20,
      paddingBottom: 8 },
    featureRow: {
      paddingHorizontal: Space.lg,
      paddingVertical: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle },
    featureTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontWeight: '600',
      color: colors.textPrimary,
      marginBottom: 4 },
    featureDescription: {
      fontSize: TypographyV2.body.size,
      color: colors.textSecondary,
      lineHeight: TypographyV2.body.lineHeight },
    dataLabel: {
      fontSize: TypographyV2.meta.size,
      fontWeight: '500',
      color: colors.textMuted,
      marginTop: 8,
      marginBottom: 4 },
    dataChip: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6 },
    chip: {
      backgroundColor: colors.surfaceAlt,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      marginRight: 6,
      marginBottom: 4 },
    chipText: {
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary },
    controlsSection: {
      paddingHorizontal: Space.lg,
      paddingTop: 20 },
    controlItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle },
    controlText: {
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.textPrimary,
      flex: 1 },
    controlChevron: {
      fontSize: TypographyV2.sectionTitle.size,
      color: colors.textMuted },
    contactSection: {
      paddingHorizontal: Space.lg,
      paddingTop: 20,
      paddingBottom: 8 },
    contactText: {
      fontSize: TypographyV2.body.size,
      color: colors.textSecondary,
      lineHeight: TypographyV2.body.lineHeight },
    buttonRow: {
      flexDirection: 'row',
      paddingHorizontal: Space.lg,
      paddingTop: Space.lg,
      gap: 12 },
    primaryButton: {
      flex: 1,
      backgroundColor: colors.brand,
      paddingVertical: Space.md,
      borderRadius: Radius.xl,
      alignItems: 'center' },
    primaryButtonText: {
      fontSize: TypographyV2.sectionTitle.size,
      fontWeight: '600',
      color: colors.textInverse } });

  return (
    <Modal visible={visible} transparent animationType="slide" accessibilityRole={summaryRole}>
      <Pressable style={styles.overlay} onPress={handleDismiss} accessibilityRole="button" accessibilityLabel="Close disclosure">
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()} accessibilityRole="none">
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>AI Transparency</Text>
            <Text style={styles.subtitle}>
              ThryftVerse uses automated systems — and, where configured, an
              AI provider — to power the features below. This disclosure
              explains what each feature does, what data it processes, and
              the controls you have.
            </Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionLabel}>Automated and assisted features</Text>
            {activeFeatures.map((info, index) => {
              const featureKey = features[index];
              const isExpanded = expandedFeature === featureKey;
              return (
                <Pressable
                  key={featureKey}
                  style={styles.featureRow}
                  onPress={() =>
                    setExpandedFeature(isExpanded ? null : featureKey)
                  }
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={info.title}
                >
                  <Text style={styles.featureTitle}>{info.title}</Text>
                  <Text style={styles.featureDescription}>{info.description}</Text>
                  {isExpanded && (
                    <View>
                      <Text style={styles.dataLabel}>Data processed:</Text>
                      <View style={styles.dataChip}>
                        {info.dataProcessed.map((d) => (
                          <View key={d} style={styles.chip}>
                            <Text style={styles.chipText}>{d}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </Pressable>
              );
            })}

            <Text style={styles.sectionLabel}>Your Controls</Text>
            <View style={styles.controlsSection}>
              <Pressable
                style={styles.controlItem}
                onPress={handlePrivacyPolicy}
                accessible
                accessibilityRole="link"
                accessibilityLabel="Read our privacy policy"
              >
                <Text style={styles.controlText}>Read our privacy policy</Text>
                <Text style={styles.controlChevron}>›</Text>
              </Pressable>
              <Pressable
                style={styles.controlItem}
                onPress={() => Linking.openURL('app://personalisation')}
                accessible
                accessibilityRole="link"
                accessibilityLabel="Manage personalisation settings"
              >
                <Text style={styles.controlText}>
                  Manage personalisation settings
                </Text>
                <Text style={styles.controlChevron}>›</Text>
              </Pressable>
              <Pressable
                style={styles.controlItem}
                onPress={() => Linking.openURL('app://ai-preferences')}
                accessible
                accessibilityRole="link"
                accessibilityLabel="Opt out of AI features"
              >
                <Text style={styles.controlText}>Opt out of AI features</Text>
                <Text style={styles.controlChevron}>›</Text>
              </Pressable>
            </View>

            <View style={styles.contactSection}>
              <Text style={styles.contactText}>
                Questions about our AI systems? Contact us at
                ai-transparency@thryftverse.com
              </Text>
            </View>

            <View style={styles.buttonRow}>
              <Pressable
                style={styles.primaryButton}
                onPress={handleDismiss}
                accessible
                accessibilityRole="button"
                accessibilityLabel="I understand"
              >
                <Text style={styles.primaryButtonText}>I understand</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
