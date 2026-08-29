/**
 * DataPrivacyScreen — GDPR-aligned data privacy control surface.
 *
 * Explains what data is collected, offers data export (GDPR portability) and
 * deletion, exposes privacy controls (personalised ads, analytics,
 * recommendation personalisation), and documents retention and third-party
 * sharing policies with opt-outs.
 *
 * Per AGENTS.md §11 (Truthful UI): every action row navigates to a real
 * screen or performs a real toggle. Explanatory text is truthful about what
 * each action does. The export/delete rows route to the canonical
 * DataExportScreen and DeleteAccountScreen rather than duplicating logic.
 *
 * Design (per AGENTS.md §4):
 * - Flat composition, hairline separators, no card-on-card
 * - One dominant panel (the "Your data" explanation block)
 * - Max two non-avatar radius sizes (Radius.md for blocks, Radius.lg for hero)
 * - Max three type sizes per viewport (title, body, caption)
 * - All colors via useAppTheme(), all geometry via design tokens
 *
 * State coverage (per AGENTS.md §14):
 * - Populated: full control set
 * - Disabled: toggles reflect real preference state
 */

import React from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';
import { useSettingsPreferences } from '../context/SettingsPreferencesContext';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { Space, Radius, Type, Typography } from '../theme/designTokens';

type Props = NativeStackScreenProps<RootStackParamList, 'DataPrivacy'>;

const DATA_CATEGORIES: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; description: string }[] = [
  { icon: 'person-outline', label: 'Profile', description: 'Username, display name, bio, avatar' },
  { icon: 'pricetag-outline', label: 'Listings', description: 'Items you have listed for sale' },
  { icon: 'bag-outline', label: 'Orders', description: 'Purchase and sale order history' },
  { icon: 'chatbubble-outline', label: 'Messages', description: 'Conversations and message metadata' },
  { icon: 'location-outline', label: 'Addresses', description: 'Saved delivery addresses' },
  { icon: 'card-outline', label: 'Payments', description: 'Saved cards and bank accounts' },
];

export default function DataPrivacyScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { show } = useToast();
  const {
    analyticsOptOut,
    setAnalyticsOptOut,
    personalizedAds,
    setPersonalizedAds,
    recommendationPersonalization,
    setRecommendationPersonalization,
    thirdPartySharing,
    setThirdPartySharing,
  } = useSettingsPreferences();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const handleOpenExternal = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      show('Unable to open link', 'error');
    }
  };

  const toggleWithHaptic = (setter: (v: boolean) => void) => (v: boolean) => {
    haptic.selection();
    setter(v);
  };

  return (
    <FlagshipScreen
      respectBottomInset
      header={
        <FlagshipHeader
          title="Data & Privacy"
          onBack={() => navigation.goBack()}
        />
      }
    >
      {/* ── Device-local indicator (truthful UI per AGENTS.md §11) ── */}
      <View
        style={[styles.demoBanner, { backgroundColor: colors.surfaceAlt }]}
        accessibilityRole="header"
        accessibilityLabel="Device-local privacy controls"
      >
        <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.demoBannerText}>
          These privacy controls are saved on this device and stay in effect
          across app restarts.
        </Text>
      </View>

      {/* ── Your data — flat category rows (no card wrapper) ── */}
      <SettingsSection title="Your data" noCard>
        {DATA_CATEGORIES.map((category, i) => (
          <SettingsRow
            key={category.label}
            icon={category.icon}
            title={category.label}
            subtitle={category.description}
            isFirst={i === 0}
            isLast={i === DATA_CATEGORIES.length - 1}
          />
        ))}
      </SettingsSection>

      {/* ── Data actions — export ── */}
      <View>
        <SettingsSection title="Your data rights" noCard>
          <SettingsRow
            icon="download-outline"
            title="Download your data"
            subtitle="Export a copy of your account data (GDPR portability)"
            onPress={() => navigation.navigate('DataExport')}
            isFirst
            isLast
          />
        </SettingsSection>
      </View>

      {/* ── Privacy controls ── */}
      <View>
        <SettingsSection title="Privacy controls" noCard>
          <SettingsRow
            icon="megaphone-outline"
            title="Personalised ads"
            subtitle="Allow us to use your activity to show relevant ads"
            toggleValue={personalizedAds}
            onToggle={toggleWithHaptic(setPersonalizedAds)}
            isFirst
          />
          <SettingsRow
            icon="analytics-outline"
            title="Analytics"
            subtitle="Send anonymous usage data to improve ThryftVerse"
            toggleValue={!analyticsOptOut}
            onToggle={(v) => { haptic.selection(); setAnalyticsOptOut(!v); }}
          />
          <SettingsRow
            icon="person-outline"
            title="Recommendation personalisation"
            subtitle="Use your activity to personalise feed recommendations"
            toggleValue={recommendationPersonalization}
            onToggle={toggleWithHaptic(setRecommendationPersonalization)}
            isLast
          />
        </SettingsSection>
      </View>

      {/* ── Data retention ── */}
      <View>
        <View style={styles.infoBlock}>
          <View style={styles.infoHeader}>
            <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
            <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>Data retention</Text>
          </View>
          <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
            We retain your account data for as long as your account is active. After account deletion, personal data is removed within 30 days, except where retention is required by law (e.g. tax records for 7 years). Listing and order data needed for buyer protection is retained for the duration of any open dispute plus 90 days.
          </Text>
        </View>
      </View>

      {/* ── Third-party sharing ── */}
      <View>
        <SettingsSection title="Third-party sharing" noCard>
          <SettingsRow
            icon="share-outline"
            title="Share data with partners"
            subtitle="Allow sharing anonymised data with shipping and payment partners"
            toggleValue={thirdPartySharing}
            onToggle={toggleWithHaptic(setThirdPartySharing)}
            isFirst
            isLast
          />
        </SettingsSection>
        <View style={styles.infoBlock}>
          <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
            We share data with shipping carriers and payment processors only to fulfil your orders and payouts. We never sell your personal data. Disabling this toggle stops anonymised aggregate sharing but does not affect order fulfilment.
          </Text>
        </View>
      </View>

      {/* ── Cookie preferences ── */}
      <View>
        <SettingsSection title="Cookie preferences" noCard>
          <SettingsRow
            icon="document-text-outline"
            title="Cookie policy"
            subtitle="How we use cookies and local storage"
            onPress={() => void handleOpenExternal('https://thryftverse.app/cookies')}
            isFirst
            isLast
          />
        </SettingsSection>
      </View>

      {/* Account deletion is a quiet, deliberate hand-off to the dedicated
          confirmation flow. It is separated with a hairline rather than a
          warning card so this utility screen does not visually dramatise or
          duplicate the irreversible action before the user opts into it. */}
      <SettingsSection
        title="Account"
        description="Deletion is permanent. Open orders, disputes or payouts may need to be resolved first."
        noCard
      >
        <View style={[styles.destructiveDivider, { borderTopColor: colors.dangerBorder }]}>
          <SettingsRow
            icon="trash-outline"
            title="Delete account"
            subtitle="Review affected data and verify your identity"
            danger
            onPress={() => navigation.navigate('DeleteAccount')}
            accessibilityLabel="Delete account"
            accessibilityHint="Review what will be removed and verify your identity before permanently deleting your account"
            isFirst
            isLast
          />
        </View>
      </SettingsSection>

      {/* ── Legal ── */}
      <View>
        <SettingsSection title="Legal" noCard>
          <SettingsRow
            icon="shield-checkmark-outline"
            title="Privacy Policy"
            onPress={() => void handleOpenExternal('https://thryftverse.app/privacy')}
            isFirst
          />
          <SettingsRow
            icon="document-text-outline"
            title="Terms of Service"
            onPress={() => void handleOpenExternal('https://thryftverse.app/terms')}
            isLast
          />
        </SettingsSection>
      </View>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    demoBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      marginBottom: Space.md,
    },
    demoBannerText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.caption.letterSpacing,
      lineHeight: Type.caption.lineHeight,
      color: colors.textSecondary,
      flex: 1,
    },
    infoBlock: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      marginBottom: Space.md,
    },
    infoHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginBottom: Space.xs,
    },
    infoTitle: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
    },
    infoBody: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.caption.lineHeight,
      letterSpacing: Type.caption.letterSpacing,
    },
    destructiveDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
    },
  });
}
