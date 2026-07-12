import React, { useMemo } from 'react';
import {
  AnimatedPressable } from '../components/AnimatedPressable';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Share
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { ActiveTheme, Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Space, Radius, Type, Typography, LetterSpacing } from '../theme/designTokens';

type Props = StackScreenProps<RootStackParamList, 'InviteFriends'>;

const ACCENT = Colors.brand;
const BG = Colors.background;
const CARD = Colors.surface;
const CARD_ALT = Colors.surfaceAlt;
const BORDER = Colors.border;
const MUTED = Colors.textMuted;
const TEXT = Colors.textPrimary;
const SUCCESS = Colors.success;

/**
 * Generate a deterministic referral code from a user ID.
 * Format: TV-XXXXXX (6 chars from user ID, uppercased)
 */
function generateReferralCode(userId: string): string {
  const clean = userId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const code = clean.length >= 6 ? clean.slice(0, 6) : clean.padEnd(6, 'X');
  return `TV-${code}`;
}

export default function InviteFriendsScreen({ navigation }: Props) {
  const currentUser = useStore((s) => s.currentUser);
  const { show } = useToast();
  const reducedMotionEnabled = useReducedMotion();

  const referralCode = useMemo(
    () => generateReferralCode(currentUser?.id ?? 'GUEST'),
    [currentUser?.id]
  );
  const inviteLink = `https://thryftverse.app/invite/${referralCode}`;

  // Fetch referral stats from backend, with graceful fallback to zeros
  const [referralStats, setReferralStats] = React.useState({
    invited: 0,
    joined: 0,
    rewarded: 0,
    creditsBalance: 0,
  });

  React.useEffect(() => {
    if (!currentUser?.id) return;
    let mounted = true;
    fetch(`${process.env.EXPO_PUBLIC_API_URL ?? ''}/users/${currentUser.id}/referral-stats`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!mounted || !data) return;
        setReferralStats({
          invited: data.invited ?? 0,
          joined: data.joined ?? 0,
          rewarded: data.rewarded ?? 0,
          creditsBalance: data.creditsBalance ?? 0,
        });
      })
      .catch(() => {
        // Backend endpoint not available — keep zeros
      });
    return () => { mounted = false; };
  }, [currentUser?.id]);

  // Loyalty tier derived from referral activity
  const loyaltyTier = useMemo(() => {
    const { rewarded } = referralStats;
    if (rewarded >= 10) return { name: 'Gold', icon: 'trophy', color: '#FFD700', nextThreshold: null, progress: 100 };
    if (rewarded >= 3) return { name: 'Silver', icon: 'medal', color: '#C0C0C0', nextThreshold: 10, progress: (rewarded / 10) * 100 };
    return { name: 'Bronze', icon: 'ribbon', color: '#CD7F32', nextThreshold: 3, progress: (rewarded / 3) * 100 };
  }, [referralStats.rewarded]);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join me on Thryftverse - the premium marketplace for second-hand fashion! Use my code ${referralCode} at signup. ${inviteLink}`,
        title: 'Invite to Thryftverse',
      });
    } catch {}
  };

  const handleCopyLink = React.useCallback(async () => {
    await Clipboard.setStringAsync(inviteLink);
    show('Invite link copied to clipboard.', 'success');
  }, [inviteLink, show]);

  const handleCopyCode = React.useCallback(async () => {
    await Clipboard.setStringAsync(referralCode);
    show('Referral code copied.', 'success');
  }, [referralCode, show]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={BG} />
      <ScreenHeader title="Invite friends" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <Reanimated.View
          style={styles.heroCard}
          entering={reducedMotionEnabled ? undefined : FadeInDown.delay(0).duration(400)}
        >
          <Ionicons name="gift-outline" size={48} color={ACCENT} />
          <Text style={styles.heroTitle}>Invite & earn</Text>
          <Text style={styles.heroSubtitle}>
            Invite friends to Thryftverse. When they make their first sale, you both get a reward.
          </Text>
        </Reanimated.View>

        {/* Referral Code */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.delay(80).duration(400)}
        >
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>YOUR REFERRAL CODE</Text>
            <View style={styles.codeRow}>
              <Text style={styles.codeText}>{referralCode}</Text>
              <AnimatedPressable style={styles.copyBtn} onPress={() => void handleCopyCode()} accessibilityLabel="Copy referral code" accessibilityRole="button">
                <Ionicons name="copy-outline" size={16} color={ACCENT} />
                <Text style={styles.copyText}>Copy</Text>
              </AnimatedPressable>
            </View>
          </View>
        </Reanimated.View>

        {/* Share Link */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.delay(160).duration(400)}
        >
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>YOUR INVITE LINK</Text>
            <View style={styles.linkRow}>
              <Text style={styles.linkText} numberOfLines={1}>
                {inviteLink}
              </Text>
              <AnimatedPressable style={styles.copyBtn} onPress={() => void handleCopyLink()} accessibilityLabel="Copy invite link" accessibilityRole="button">
                <Ionicons name="copy-outline" size={16} color={ACCENT} />
                <Text style={styles.copyText}>Copy</Text>
              </AnimatedPressable>
            </View>
          </View>
        </Reanimated.View>

        {/* Share Options */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.delay(240).duration(400)}
        >
          <View style={styles.shareRow}>
            {[
              { icon: 'logo-whatsapp', label: 'WhatsApp', color: '#25D366' },
              { icon: 'logo-instagram', label: 'Instagram', color: '#E1306C' },
              { icon: 'mail-outline', label: 'Email', color: ACCENT },
              { icon: 'share-social-outline', label: 'More', color: MUTED },
            ].map(s => (
              <AnimatedPressable key={s.label} style={styles.shareIconBtn} onPress={handleShare} accessibilityLabel={`Share via ${s.label}`} accessibilityRole="button">
                <View style={[styles.shareIconCircle, { borderColor: s.color }]}>
                  <Ionicons name={s.icon as any} size={22} color={s.color} />
                </View>
                <Text style={styles.shareIconLabel}>{s.label}</Text>
              </AnimatedPressable>
            ))}
          </View>
        </Reanimated.View>

        {/* Rewards Summary */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.delay(320).duration(400)}
        >
          <View style={styles.rewardsCard}>
            <View style={styles.rewardsHeader}>
              <Ionicons name="ribbon-outline" size={18} color={ACCENT} />
              <Text style={styles.rewardsTitle}>Your rewards</Text>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statCell}>
                <Text style={styles.statValue}>{referralStats.invited}</Text>
                <Text style={styles.statLabel}>Invited</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCell}>
                <Text style={styles.statValue}>{referralStats.joined}</Text>
                <Text style={styles.statLabel}>Joined</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCell}>
                <Text style={[styles.statValue, { color: SUCCESS }]}>{referralStats.rewarded}</Text>
                <Text style={styles.statLabel}>Rewarded</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCell}>
                <Text style={[styles.statValue, { color: ACCENT }]}>£{referralStats.creditsBalance}</Text>
                <Text style={styles.statLabel}>Credits</Text>
              </View>
            </View>
            <Text style={styles.rewardsFootnote}>
              Earn £5 credit for each friend who completes their first sale. Credits apply to platform fees on your next listing.
            </Text>
          </View>
        </Reanimated.View>

        {/* Loyalty Tier Card */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.delay(360).duration(400)}
        >
          <View style={styles.loyaltyCard}>
            <View style={styles.loyaltyHeader}>
              <View style={[styles.loyaltyIconWrap, { borderColor: loyaltyTier.color }]}>
                <Ionicons name={loyaltyTier.icon as any} size={24} color={loyaltyTier.color} />
              </View>
              <View style={styles.loyaltyInfo}>
                <Text style={styles.loyaltyTierName}>{loyaltyTier.name} Member</Text>
                <Text style={styles.loyaltySubtext}>
                  {loyaltyTier.nextThreshold
                    ? `${loyaltyTier.nextThreshold - referralStats.rewarded} more referrals to reach ${loyaltyTier.name === 'Bronze' ? 'Silver' : 'Gold'}`
                    : 'Highest tier reached'}
                </Text>
              </View>
            </View>
            <View style={styles.loyaltyProgressTrack}>
              <View style={[styles.loyaltyProgressFill, { width: `${Math.min(loyaltyTier.progress, 100)}%`, backgroundColor: loyaltyTier.color }]} />
            </View>
            <View style={styles.loyaltyBenefitsRow}>
              <View style={styles.loyaltyBenefit}>
                <Ionicons name="pricetag-outline" size={14} color={MUTED} />
                <Text style={styles.loyaltyBenefitText}>Reduced fees</Text>
              </View>
              <View style={styles.loyaltyBenefit}>
                <Ionicons name="flash-outline" size={14} color={MUTED} />
                <Text style={styles.loyaltyBenefitText}>Priority support</Text>
              </View>
              <View style={styles.loyaltyBenefit}>
                <Ionicons name="star-outline" size={14} color={MUTED} />
                <Text style={styles.loyaltyBenefitText}>Exclusive drops</Text>
              </View>
            </View>
          </View>
        </Reanimated.View>

        {/* How it works */}
        <Reanimated.View
          entering={reducedMotionEnabled ? undefined : FadeInDown.delay(400).duration(400)}
        >
          <View style={styles.howItWorksCard}>
            <Text style={styles.sectionLabel}>HOW IT WORKS</Text>
            {[
              { icon: 'share-outline', text: 'Share your referral link with friends' },
              { icon: 'person-add-outline', text: 'They sign up and create an account' },
              { icon: 'pricetag-outline', text: 'They list their first item for sale' },
              { icon: 'gift-outline', text: 'You both get £5 credit automatically' },
            ].map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepIconWrap}>
                  <Ionicons name={step.icon as any} size={16} color={ACCENT} />
                </View>
                <Text style={styles.stepText}>{step.text}</Text>
              </View>
            ))}
          </View>
        </Reanimated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content: { padding: Space.lg },
  heroCard: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.xl,
    padding: Space.xl,
    alignItems: 'center',
    marginBottom: Space.xl,
  },
  heroTitle: {
    fontSize: Type.title.size,
    lineHeight: Type.title.lineHeight,
    letterSpacing: Type.title.letterSpacing,
    fontFamily: Typography.family.extrabold,
    color: TEXT,
    marginTop: Space.md,
    marginBottom: Space.sm,
  },
  heroSubtitle: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    letterSpacing: Type.body.letterSpacing,
    fontFamily: Typography.family.regular,
    color: MUTED,
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    letterSpacing: LetterSpacing.caps,
    fontFamily: Typography.family.medium,
    color: MUTED,
    textTransform: 'uppercase',
    marginBottom: Space.sm,
    marginLeft: Space.xs,
  },
  section: { marginBottom: Space.lg },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
  },
  codeText: {
    fontSize: Type.title.size,
    lineHeight: Type.title.lineHeight,
    letterSpacing: 2,
    fontFamily: Typography.family.extrabold,
    color: TEXT,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
  },
  linkText: {
    flex: 1,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    letterSpacing: Type.body.letterSpacing,
    fontFamily: Typography.family.regular,
    color: MUTED,
  },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
  copyText: {
    fontSize: Type.captionElevated.size,
    lineHeight: Type.captionElevated.lineHeight,
    letterSpacing: Type.captionElevated.letterSpacing,
    fontFamily: Typography.family.semibold,
    color: ACCENT,
  },
  shareRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Space.xl,
  },
  shareIconBtn: { alignItems: 'center', gap: 6 },
  shareIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARD_ALT,
  },
  shareIconLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    letterSpacing: Type.meta.letterSpacing,
    fontFamily: Typography.family.medium,
    color: MUTED,
  },
  rewardsCard: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.xl,
    padding: Space.lg,
    marginBottom: Space.lg,
  },
  rewardsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: Space.md,
  },
  rewardsTitle: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.semibold,
    color: TEXT,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.md,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: Type.title.size,
    lineHeight: Type.title.lineHeight,
    fontFamily: Typography.family.extrabold,
    color: TEXT,
  },
  statLabel: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    color: MUTED,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: BORDER,
  },
  rewardsFootnote: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight + 2,
    fontFamily: Typography.family.regular,
    color: MUTED,
  },
  loyaltyCard: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.xl,
    padding: Space.lg,
    marginBottom: Space.xl,
  },
  loyaltyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    marginBottom: Space.md,
  },
  loyaltyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARD_ALT,
  },
  loyaltyInfo: {
    flex: 1,
    gap: 2,
  },
  loyaltyTierName: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: TEXT,
  },
  loyaltySubtext: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: MUTED,
  },
  loyaltyProgressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: BORDER,
    marginBottom: Space.md,
    overflow: 'hidden',
  },
  loyaltyProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  loyaltyBenefitsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  loyaltyBenefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  loyaltyBenefitText: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: MUTED,
  },
  howItWorksCard: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: Radius.xl,
    padding: Space.lg,
    marginBottom: Space.xl,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
  },
  stepIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${ACCENT}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
    color: TEXT,
  },
});