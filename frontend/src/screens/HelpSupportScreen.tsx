import React, { useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TextInput,
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
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { SettingsHeader } from '../components/settings/SettingsHeader';
import { SettingsCard } from '../components/settings/SettingsCard';
import { Typography } from '../constants/typography';

type Props = StackScreenProps<RootStackParamList, 'HelpSupport'>;

export default function HelpSupportScreen({ navigation }: Props) {
  const { formatFromFiat } = useFormattedPrice();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [faqSearch, setFaqSearch] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const messageInputRef = useRef<TextInput>(null);
  const { show } = useToast();

  const handleOpenExternal = React.useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      // Silently fail
    }
  }, []);

  const handleOpenLiveChat = React.useCallback(() => {
    navigation.navigate('Chat', {
      conversationId: 'c1',
      focusQuery: 'support',
      partnerUserId: 'u1',
    });
  }, [navigation]);

  const handleOpenEmail = React.useCallback(() => {
    void handleOpenExternal('mailto:support@thryftverse.com?subject=Thryftverse%20Support');
  }, [handleOpenExternal]);

  const handleOpenTickets = React.useCallback(() => {
    scrollRef.current?.scrollTo({ y: 760, animated: true });
    setTimeout(() => messageInputRef.current?.focus(), 220);
    show('No open tickets. Start a new support message below.', 'info');
  }, [show]);

  const handleSendMessage = React.useCallback(() => {
    if (!message.trim()) return;
    setMessage('');
    show('Support message sent. We usually reply within 2 hours.', 'success');
  }, [message, show]);

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

      <SettingsHeader title="Help & Support" onBack={() => navigation.goBack()} />

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
                {
                  icon: 'document-text-outline',
                  label: 'My Tickets',
                  onPress: handleOpenTickets,
                  accessibilityLabel: 'View support tickets',
                  accessibilityHint: 'Scrolls to the message form to create a new support ticket.',
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

          {/* Contact form */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(160)}>
            <Text style={styles.sectionTitle}>Send a Message</Text>
            <SettingsCard>
              <AppInput
                ref={messageInputRef}
                label="Your message"
                placeholder="Describe your issue..."
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={4}
                accessibilityLabel="Support message"
                accessibilityHint="Type details about your issue so support can help you."
              />
              <AppButton
                title="Send message"
                icon={<Ionicons name="send" size={16} color={Colors.textInverse} />}
                onPress={handleSendMessage}
                disabled={!message.trim()}
                variant="primary"
                size="sm"
                style={[!message.trim() && styles.sendBtnDisabled]}
                accessibilityLabel="Send support message"
                accessibilityHint="Sends your message to the support team."
              />
            </SettingsCard>
          </Reanimated.View>

          {/* Links */}
          <Reanimated.View entering={FadeInDown.duration(300).delay(240)}>
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
    paddingBottom: Space.sm,
    letterSpacing: Type.caption.letterSpacing,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + Space.xs,
    paddingVertical: Space.md - Space.xs,
  },
  linkText: {
    flex: 1,
    fontSize: Type.body.size,
    color: Colors.textPrimary,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
  },
  version: {
    fontSize: Type.meta.size,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Space.sm,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
});
