import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type } from '../theme/designTokens';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { SettingsSection } from '../components/settings/SettingsSection';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SettingsRow } from '../components/settings/SettingsRow';
import { SettingsInfoBanner } from '../components/settings/SettingsInfoBanner';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Typography } from '../theme/designTokens';

type Props = StackScreenProps<RootStackParamList, 'HelpSupport'>;

export default function HelpSupportScreen({ navigation }: Props) {
  const { show } = useToast();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { formatFromFiat } = useFormattedPrice();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [faqSearch, setFaqSearch] = useState('');

  const handleOpenExternal = React.useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      show('Unable to open link', 'error');
    }
  }, [show]);

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
    <FlagshipScreen header={<FlagshipHeader title="Help & Support" subtitle="Get answers and contact us" onBack={() => navigation.goBack()} />} keyboardAvoiding>
        {/* Hero summary */}
        <Reanimated.View entering={FadeInDown.duration(300)}>
          <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.heroRow}>
              <View style={[styles.heroIcon, { backgroundColor: colors.brand }]}>
                <Ionicons name="help-circle" size={20} color={colors.textInverse} />
              </View>
              <View style={styles.heroText}>
                <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>We're here to help</Text>
                <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                  Average response time ~2 hours
                </Text>
              </View>
            </View>
          </View>
        </Reanimated.View>

        {/* Contact options */}
        <Reanimated.View entering={FadeInDown.duration(300)}>
          <SettingsSection title="Contact us">
            <SettingsRow
              icon="mail-outline"
              title="Email support"
              subtitle="support@thryftverse.com"
              onPress={() => void handleOpenExternal('mailto:support@thryftverse.com?subject=Thryftverse%20Support')}
              isFirst
            />
            <SettingsRow
              icon="flag-outline"
              title="Report a problem"
              subtitle="Something not working right? Let us know"
              onPress={() => void handleOpenExternal('mailto:support@thryftverse.com?subject=Report%20a%20problem')}
            />
            <SettingsRow
              icon="shield-checkmark-outline"
              title="Safety and scams"
              subtitle="Tips to stay safe while buying and selling"
              onPress={() => void handleOpenExternal('https://thryftverse.app/safety')}
            />
            <SettingsRow
              icon="document-text-outline"
              title="Legal and privacy help"
              onPress={() => void handleOpenExternal('https://thryftverse.app/privacy')}
              isLast
            />
          </SettingsSection>
        </Reanimated.View>

        {/* FAQ Banner */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(60)} style={{ marginHorizontal: Space.md, marginBottom: Space.md }}>
          <SettingsInfoBanner
            text="Search our FAQs below for quick answers to common questions."
            icon="help-circle-outline"
            variant="info"
          />
        </Reanimated.View>

        {/* FAQ Search */}
        <Reanimated.View entering={FadeInDown.duration(300).delay(120)} style={{ marginHorizontal: Space.md, marginBottom: Space.md }}>
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={faqSearch}
              onChangeText={setFaqSearch}
              placeholder="Search FAQs..."
              placeholderTextColor={colors.textMuted}
            />
            {faqSearch ? (
              <AnimatedPressable onPress={() => setFaqSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </AnimatedPressable>
            ) : null}
          </View>
        </Reanimated.View>

        {/* FAQ Accordion */}
        <Reanimated.View entering={FadeInDown.duration(300)}>
          <SettingsSection title="Frequently asked">
            {filteredFaqs.length === 0 ? (
              <View style={styles.emptyFaqs}>
                <Text style={styles.emptyFaqsText}>No FAQs match your search</Text>
              </View>
            ) : (
              filteredFaqs.map((faq, idx) => (
                <View key={faq.q}>
                  <AnimatedPressable
                    onPress={() => setExpanded((prev) => (prev === faq.q ? null : faq.q))}
                    hapticFeedback="light"
                    scaleValue={0.995}
                  >
                    <View style={[styles.faqRow, idx < filteredFaqs.length - 1 && styles.border]}>
                      <Text style={styles.faqQ} numberOfLines={expanded === faq.q ? undefined : 2}>
                        {faq.q}
                      </Text>
                      <Ionicons
                        name={expanded === faq.q ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={colors.textMuted}
                      />
                    </View>
                    {expanded === faq.q && (
                      <Text style={styles.faqA}>{faq.a}</Text>
                    )}
                  </AnimatedPressable>
                </View>
              ))
            )}
          </SettingsSection>
        </Reanimated.View>

        {/* External links */}
        <Reanimated.View entering={FadeInDown.duration(300)}>
          <SettingsSection title="Legal">
            <SettingsRow
              icon="document-text-outline"
              title="Terms of Service"
              onPress={() => void handleOpenExternal('https://thryftverse.app/terms')}
              isFirst
            />
            <SettingsRow
              icon="shield-checkmark-outline"
              title="Privacy Policy"
              onPress={() => void handleOpenExternal('https://thryftverse.app/privacy')}
            />
            <SettingsRow
              icon="globe-outline"
              title="Thryftverse Blog"
              onPress={() => void handleOpenExternal('https://thryftverse.app/blog')}
              isLast
            />
          </SettingsSection>
        </Reanimated.View>

        {/* Version */}
        <Text style={styles.version}>Thryftverse v1.0.0 · Response time ~2 hours</Text>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  heroCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    marginBottom: Space.md,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroText: { flex: 1 },
  heroTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  heroSubtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginTop: 2,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    backgroundColor: colors.surface,
    borderRadius: Radius.xl,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
    paddingVertical: 0,
  },
  emptyFaqs: {
    paddingVertical: Space.lg,
    alignItems: 'center',
  },
  emptyFaqsText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
    letterSpacing: Type.body.letterSpacing,
  },
  faqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.md - Space.xs,
    paddingHorizontal: Space.md,
    gap: Space.sm,
  },
  border: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  faqQ: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    lineHeight: Type.body.lineHeight,
    letterSpacing: Type.body.letterSpacing,
    paddingRight: Space.sm,
  },
  faqA: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    lineHeight: Type.caption.lineHeight,
    letterSpacing: Type.caption.letterSpacing,
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
  },
  version: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: Space.lg,
    marginBottom: Space.md,
    letterSpacing: Type.meta.letterSpacing,
  },
  });
}