import React, { useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { ActiveTheme, Colors } from '../constants/colors';
import { Space, Radius, Type } from '../theme/designTokens';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useToast } from '../context/ToastContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppInput } from '../components/ui/AppInput';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { SettingsCard } from '../components/settings/SettingsCard';
import { Typography } from '../theme/designTokens';

type Props = StackScreenProps<RootStackParamList, 'HelpSupport'>;

export default function HelpSupportScreen({ navigation }: Props) {
  const { formatFromFiat } = useFormattedPrice();
  const { show } = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [faqSearch, setFaqSearch] = useState('');
  const scrollRef = useRef<ScrollView>(null);


  const handleOpenExternal = React.useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      // Silently fail
    }
  }, []);

  const handleOpenLiveChat = React.useCallback(() => {
    show('Live chat support is not available yet. Please email us for assistance.', 'info');
  }, [show]);

  const handleOpenEmail = React.useCallback(() => {
    void handleOpenExternal('mailto:support@thryftverse.com?subject=Thryftverse%20Support');
  }, [handleOpenExternal]);

  const fixedFeeLabel = formatFromFiat(0.7, 'GBP', { displayMode: 'fiat' });

  const allFaqs = useMemo(
    () => [
      {
        q: 'How does the platform charge work?',
        a: "Thryftverse applies a platform charge to each checkout. It funds secure payments, delivery issue handling, and buyer support if an item doesn't arrive or is significantly misdescribed. File a claim within 2 days of delivery.",
      },
      {
        q: 'How do I withdraw my balance?',
        a: "Go to Profile -> Balance -> Withdraw. Add a bank account first if you haven't already. Withdrawals typically take 1-3 business days.",
      },
      {
        q: 'What fees does Thryftverse charge?',
        a: `Thryftverse charges a 5% service fee on each sale, plus a fixed transaction fee of ${fixedFeeLabel}. Buyers also pay a platform charge on top of the item price.`,
      },
      {
        q: 'Can I cancel or return an order?',
        a: 'Buyers can request a cancellation within 1 hour of purchase. Returns and issue handling are covered under our platform charge support policy when items do not match the description.',
      },
      {
        q: 'How do I report a fake or misleading listing?',
        a: 'On any item page, tap the three-dot menu and select "Report". Our trust team reviews flagged items within 24 hours.',
      },
    ],
    [fixedFeeLabel]
  );

  const filteredFaqs = useMemo(() => {
    if (!faqSearch.trim()) return allFaqs;
    const query = faqSearch.toLowerCase();
    return allFaqs.filter((f) => f.q.toLowerCase().includes(query) || f.a.toLowerCase().includes(query));
  }, [allFaqs, faqSearch]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={Colors.background}
      />

      <ScreenHeader title="Help & Support" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {/* Quick Actions */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
            <View style={styles.quickRow}>
              {[
                {
                  icon: 'chatbubble-outline',
                  label: 'Live Chat',
                  onPress: handleOpenLiveChat,
                  accessibilityLabel: 'Open live chat support',
                  accessibilityHint: 'Starts a support conversation in chat.',
                },
                {
                  icon: 'mail-outline',
                  label: 'Email Us',
                  onPress: handleOpenEmail,
                  accessibilityLabel: 'Email support',
                  accessibilityHint: 'Opens your email app with a prefilled support address.',
                },
              ].map((a) => (
                <AnimatedPressable
                  key={a.label}
                  style={styles.quickBtn}
                  onPress={a.onPress}
                  accessibilityLabel={a.accessibilityLabel}
                  accessibilityHint={a.accessibilityHint}
                  hapticFeedback="light"
                  scaleValue={0.95}
                >
                  <View style={styles.quickIcon}>
                    <Ionicons name={a.icon as any} size={22} color={Colors.brand} />
                  </View>
                  <Text style={styles.quickLabel}>{a.label}</Text>
                </AnimatedPressable>
              ))}
            </View>
          </Reanimated.View>

          {/* FAQs */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(80)}>
            <Text style={styles.sectionTitle}>Frequently Asked</Text>

            {/* FAQ Search */}
            <AppInput
              label="Search FAQs"
              value={faqSearch}
              onChangeText={setFaqSearch}
              placeholder="Search FAQs..."
              clearButtonMode="while-editing"
              accessibilityLabel="Search FAQs"
            />

            <SettingsCard>
              {filteredFaqs.length === 0 ? (
                <View style={styles.emptyFaqs}>
                  <Text style={styles.emptyFaqsText}>No FAQs match your search</Text>
                </View>
              ) : (
                filteredFaqs.map((faq, idx) => (
                  <View key={faq.q}>
                    <AnimatedPressable
                      style={styles.faqRow}
                      onPress={() => setExpanded((prev) => (prev === faq.q ? null : faq.q))}
                      accessibilityLabel={`FAQ: ${faq.q}`}
                      accessibilityHint={expanded === faq.q ? 'Collapses this answer.' : 'Expands this answer.'}
                      accessibilityState={{ expanded: expanded === faq.q }}
                      hapticFeedback="light"
                    >
                      <Text style={styles.faqQ}>{faq.q}</Text>
                      <Ionicons
                        name={expanded === faq.q ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={Colors.textMuted}
                      />
                    </AnimatedPressable>
                    {expanded === faq.q && <Text style={styles.faqA}>{faq.a}</Text>}
                    {idx < filteredFaqs.length - 1 && <View style={styles.divider} />}
                  </View>
                ))
              )}
            </SettingsCard>
          </Reanimated.View>

          {/* Links */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(160)}>
            <SettingsCard>
              {[
                { icon: 'document-text-outline', label: 'Terms of Service', url: 'https://thryftverse.app/terms' },
                { icon: 'shield-checkmark-outline', label: 'Privacy Policy', url: 'https://thryftverse.app/privacy' },
                { icon: 'globe-outline', label: 'Thryftverse Blog', url: 'https://thryftverse.app/blog' },
              ].map((l, idx) => (
                <View key={l.label}>
                  <AnimatedPressable
                    style={styles.linkRow}
                    onPress={() => void handleOpenExternal(l.url)}
                    accessibilityLabel={`Open ${l.label}`}
                    accessibilityHint="Opens this link in your browser."
                    hapticFeedback="light"
                  >
                    <Ionicons name={l.icon as any} size={18} color={Colors.textMuted} />
                    <Text style={styles.linkText}>{l.label}</Text>
                    <Ionicons name="open-outline" size={14} color={Colors.textMuted} />
                  </AnimatedPressable>
                  {idx < 2 && <View style={styles.divider} />}
                </View>
              ))}
            </SettingsCard>
          </Reanimated.View>

          <Text style={styles.version}>Thryftverse v1.0.0 | response time ~2 hours</Text>
        </ScrollView>
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
    padding: Space.md,
    paddingBottom: Space.xl,
  },
  quickRow: {
    flexDirection: 'row',
    gap: Space.sm + Space.xs,
    marginBottom: Space.lg,
  },
  quickBtn: {
    flex: 1,
    alignItems: 'center',
    gap: Space.sm,
  },
  quickIcon: {
    width: 58,
    height: 58,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickLabel: {
    fontSize: Type.caption.size,
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.caption.letterSpacing,
  },
  sectionTitle: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: Type.meta.letterSpacing,
    marginBottom: Space.sm,
    marginLeft: Space.xs,
  },
  emptyFaqs: {
    paddingVertical: Space.lg,
    alignItems: 'center',
  },
  emptyFaqsText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
  faqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.md - Space.xs,
  },
  faqQ: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    lineHeight: Type.body.lineHeight,
    letterSpacing: Type.body.letterSpacing,
    paddingRight: Space.sm,
  },
  faqA: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    lineHeight: Type.caption.lineHeight,
    letterSpacing: Type.caption.letterSpacing,
    marginTop: Space.xs,
    paddingBottom: Space.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginLeft: Space.xs,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
    paddingVertical: Space.md - Space.xs,
  },
  linkText: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    lineHeight: Type.body.lineHeight,
    letterSpacing: Type.body.letterSpacing,
  },
  version: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Space.lg,
    marginBottom: Space.md,
  },
});
