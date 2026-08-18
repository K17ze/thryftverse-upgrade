import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { SettingsSection } from '../components/settings/SettingsSection';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SettingsRow } from '../components/settings/SettingsRow';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Space, Radius, Type, Typography, Stroke } from '../theme/designTokens';
type Props = NativeStackScreenProps<RootStackParamList, 'HelpSupport'>;

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
        category: 'Buying',
        q: 'How does the platform charge work?',
        a: "Thryftverse applies a platform charge to each checkout. It funds secure payments, delivery issue handling, and buyer support if an item doesn't arrive or is significantly misdescribed. File a claim within 2 days of delivery.",
      },
      {
        category: 'Selling',
        q: 'How do I withdraw my balance?',
        a: "Go to Profile -> Balance -> Withdraw. Add a bank account first if you haven't already. Withdrawals typically take 1-3 business days.",
      },
      {
        category: 'Selling',
        q: 'What fees does Thryftverse charge?',
        a: `Thryftverse charges a 5% service fee on each sale, plus a fixed transaction fee of ${fixedFeeLabel}. Buyers also pay a platform charge on top of the item price.`,
      },
      {
        category: 'Buying',
        q: 'Can I cancel or return an order?',
        a: 'Buyers can request a cancellation within 1 hour of purchase. Returns and issue handling are covered under our platform charge support policy when items do not match the description.',
      },
      {
        category: 'Safety',
        q: 'How do I report a fake or misleading listing?',
        a: 'On any item page, tap the three-dot menu and select "Report". Our moderation team reviews flagged items as quickly as we can.',
      },
    ],
    [fixedFeeLabel]
  );

  const filteredFaqs = useMemo(() => {
    if (!faqSearch.trim()) return allFaqs;
    const query = faqSearch.toLowerCase();
    return allFaqs.filter(
      (f) =>
        f.q.toLowerCase().includes(query) ||
        f.a.toLowerCase().includes(query) ||
        f.category.toLowerCase().includes(query)
    );
  }, [allFaqs, faqSearch]);

  const categories = useMemo(() => {
    const map = new Map<string, typeof allFaqs>();
    for (const faq of filteredFaqs) {
      const list = map.get(faq.category) ?? [];
      list.push(faq);
      map.set(faq.category, list);
    }
    return Array.from(map.entries());
  }, [filteredFaqs]);

  return (
    <FlagshipScreen header={<FlagshipHeader title="Help & Support" subtitle="Find answers fast" onBack={() => navigation.goBack()} />} keyboardAvoiding>
        {/* Search as the hero — self-serve first */}
        <View style={{ paddingHorizontal: Space.md, paddingTop: Space.md, paddingBottom: Space.sm }}>
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={faqSearch}
              onChangeText={setFaqSearch}
              placeholder="Search for help…"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Search help articles"
            />
            {faqSearch ? (
              <AnimatedPressable onPress={() => setFaqSearch('')} hitSlop={8} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </AnimatedPressable>
            ) : null}
          </View>
        </View>

        {/* Categorized help articles */}
        {categories.length === 0 ? (
          <View style={styles.emptyFaqs}>
            <Ionicons name="search-outline" size={28} color={colors.textMuted} />
            <Text style={styles.emptyFaqsText}>No articles match "{faqSearch}"</Text>
            <Text style={styles.emptyFaqsHint}>Try different words, or contact us below.</Text>
          </View>
        ) : (
          categories.map(([category, faqs]) => (
            <View key={category}>
              <SettingsSection title={category}>
                {faqs.map((faq, idx) => (
                  <View key={faq.q}>
                    <AnimatedPressable
                      onPress={() => setExpanded((prev) => (prev === faq.q ? null : faq.q))}
                      hapticFeedback="light"
                      scaleValue={0.995}
                    >
                      <View style={[styles.faqRow, idx < faqs.length - 1 && styles.border]}>
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
                ))}
              </SettingsSection>
            </View>
          ))
        )}

        {/* Contact us — last resort, not the first option */}
        <View>
          <SettingsSection title="Still need help?">
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
              isLast
            />
          </SettingsSection>
        </View>

        {/* Legal */}
        <View>
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
        </View>

        {/* Version */}
        <Text style={styles.version}>Thryftverse v1.0.0</Text>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    backgroundColor: colors.surface,
    borderRadius: Radius.xl,
    paddingHorizontal: Space.md,
    paddingVertical: Space.smMd,
    borderWidth: Stroke.standard,
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
    paddingVertical: Space.xl,
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
  },
  emptyFaqsText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
    letterSpacing: Type.body.letterSpacing,
    textAlign: 'center',
  },
  emptyFaqsHint: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    letterSpacing: Type.caption.letterSpacing,
    textAlign: 'center',
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