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
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

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
  dataProcessed: string[];
}

const FEATURE_INFO: Record<AIFeature, FeatureInfo> = {
  recommendations: {
    title: 'Personalized Recommendations',
    description:
      'We use a recommendation engine that analyses your browsing history, likes, purchases, and saved items to suggest listings you may be interested in. The model runs on our servers and does not access your private messages.',
    dataProcessed: ['Browsing history', 'Liked items', 'Purchase history', 'Saved searches'] },
  search: {
    title: 'AI-Powered Search',
    description:
      'Search results are ranked using a machine learning model that considers relevance, listing quality, and your past interactions. The search index is rebuilt periodically from listing data.',
    dataProcessed: ['Search queries', 'Click-through data', 'Listing metadata'] },
  'image-labeling': {
    title: 'On-Device Image Labeling',
    description:
      'When you upload photos, we use on-device ML Kit to suggest tags and categories. Image processing happens entirely on your device — no images are sent to our servers for labeling.',
    dataProcessed: ['Local image data (on-device only)'] },
  'conversational-search': {
    title: 'Conversational AI Search',
    description:
      'You can search using natural language. Your query is sent to our AI service, which interprets intent and returns relevant listings. Queries are not stored beyond the session.',
    dataProcessed: ['Search query text', 'Session ID'] },
  'price-prediction': {
    title: 'Price Predictions',
    description:
      'For Co-Own assets, we display AI-generated price predictions based on historical market data. These are estimates, not financial advice, and should not be the sole basis for investment decisions.',
    dataProcessed: ['Historical price data', 'Market indicators'] },
  'fraud-detection': {
    title: 'Fraud Detection',
    description:
      'We use automated systems to detect potentially fraudulent activity. These systems analyse transaction patterns, listing content, and account behaviour. Suspicious activity is flagged for human review.',
    dataProcessed: ['Transaction patterns', 'Account metadata', 'Listing content'] } };

const ALL_FEATURES: AIFeature[] = [
  'recommendations',
  'search',
  'image-labeling',
  'conversational-search',
  'price-prediction',
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
    () => features.map((f) => FEATURE_INFO[f]).filter(Boolean),
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
      borderRadius: 16,
      alignItems: 'center' },
    primaryButtonText: {
      fontSize: TypographyV2.sectionTitle.size,
      fontWeight: '600',
      color: colors.textInverse } });

  return (
    <Modal visible={visible} transparent animationType="slide" accessible accessibilityRole={summaryRole}>
      <Pressable style={styles.overlay} onPress={handleDismiss} accessibilityRole="button" accessibilityLabel="Close disclosure">
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()} accessibilityRole="none">
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>AI Transparency</Text>
            <Text style={styles.subtitle}>
              ThryftVerse uses artificial intelligence to enhance your
              experience. This disclosure explains what AI features we use,
              what data is processed, and how you can control your data.
            </Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionLabel}>AI Features We Use</Text>
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
