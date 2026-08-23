import React, { useMemo } from 'react';
import {
  AnimatedPressable } from '../components/AnimatedPressable';
import {
  View,
  Text,
  StyleSheet,
  Share,
  FlatList
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useStore } from '../store/useStore';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { Space, Radius, Type, Typography, LetterSpacing, Stroke, Control } from '../theme/designTokens';

type Props = NativeStackScreenProps<RootStackParamList, 'InviteFriends'>;

interface ReferralHistoryItem {
  id: string;
  inviteeName: string | null;
  inviteeHandle: string | null;
  invitedAt: string;
  joinedAt: string | null;
  status: 'invited' | 'joined' | 'completed' | 'rewarded';
  rewardAmount: number | null;
}

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
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const ACCENT = colors.brand;
  const CARD = colors.surface;
  const CARD_ALT = colors.surfaceAlt;
  const BORDER = colors.border;
  const MUTED = colors.textMuted;
  const TEXT = colors.textPrimary;
  const SUCCESS = colors.success;

  const referralCode = useMemo(
    () => generateReferralCode(currentUser?.id ?? 'GUEST'),
    [currentUser?.id]
  );
  const inviteLink = `https://thryftverse.app/invite/${referralCode}`;

  // Fetch referral stats from backend. Per AGENTS.md §6 (truthful UI), a
  // backend failure must NOT silently show fabricated zeros — the screen
  // surfaces a "Stats unavailable" state instead (research §5, defect at
  // InviteFriendsScreen.tsx:63-76).
  const [referralStats, setReferralStats] = React.useState({
    invited: 0,
    joined: 0,
    rewarded: 0,
    creditsBalance: 0,
  });
  const [statsUnavailable, setStatsUnavailable] = React.useState(false);

  const [referralHistory, setReferralHistory] = React.useState<ReferralHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [historyUnavailable, setHistoryUnavailable] = React.useState(false);

  React.useEffect(() => {
    if (!currentUser?.id) return;
    let mounted = true;
    setStatsUnavailable(false);
    fetch(`${process.env.EXPO_PUBLIC_API_URL ?? ''}/users/${currentUser.id}/referral-stats`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!mounted || !data) {
          if (mounted) setStatsUnavailable(true);
          return;
        }
        setReferralStats({
          invited: data.invited ?? 0,
          joined: data.joined ?? 0,
          rewarded: data.rewarded ?? 0,
          creditsBalance: data.creditsBalance ?? 0,
        });
      })
      .catch(() => {
        if (mounted) setStatsUnavailable(true);
      });
    return () => { mounted = false; };
  }, [currentUser?.id]);

  React.useEffect(() => {
    if (!currentUser?.id) return;
    let mounted = true;
    setHistoryLoading(true);
    setHistoryUnavailable(false);
    fetch(`${process.env.EXPO_PUBLIC_API_URL ?? ''}/users/${currentUser.id}/referrals`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!mounted) return;
        setHistoryLoading(false);
        if (!data || !Array.isArray(data.items)) {
          setHistoryUnavailable(true);
          return;
        }
        setReferralHistory(data.items.slice(0, 20));
      })
      .catch(() => {
        if (mounted) {
          setHistoryLoading(false);
          setHistoryUnavailable(true);
        }
      });
    return () => { mounted = false; };
  }, [currentUser?.id]);

  // Loyalty tier derived from referral activity.
  // Per AGENTS.md §11, we do NOT fabricate a "Bronze Member" tier for users
  // with zero referrals — the tier is only shown when actually earned.
  const loyaltyTier = useMemo<{ name: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string; nextThreshold: number | null; progress: number } | null>(() => {
    const { rewarded } = referralStats;
    if (rewarded >= 10) return { name: 'Gold', icon: 'trophy', color: ACCENT, nextThreshold: null, progress: 100 };
    if (rewarded >= 3) return { name: 'Silver', icon: 'medal', color: MUTED, nextThreshold: 10, progress: (rewarded / 10) * 100 };
    return null;
  }, [referralStats.rewarded, ACCENT, MUTED, BORDER]);

  const hasReferrals =
    referralStats.invited > 0 ||
    referralStats.joined > 0 ||
    referralStats.rewarded > 0 ||
    referralStats.creditsBalance > 0;

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Join me on Thryftverse — the marketplace for second-hand fashion. Use my code ${referralCode} and we both earn credit when you make your first sale. ${inviteLink}`,
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
    <FlagshipScreen
      header={<FlagshipHeader title="Invite friends" onBack={() => navigation.goBack()} />}
      contentStyle={styles.content}
    >
      {/* Hero */}
      <View
        style={styles.heroCard}
      >
        <Ionicons name="gift-outline" size={48} color={ACCENT} />
        <Text style={styles.heroTitle}>Invite & earn</Text>
        <Text style={styles.heroSubtitle}>
          Invite friends to Thryftverse. When they make their first sale, you both earn Thryftverse credit — give credit, get credit.
        </Text>
      </View>

      {/* Referral Code */}
      <View style={styles.flatSection}>
        <Text style={styles.sectionLabel}>YOUR REFERRAL CODE</Text>
        <View style={styles.codeRow}>
          <Text style={styles.codeText}>{referralCode}</Text>
          <AnimatedPressable style={styles.copyBtn} onPress={() => void handleCopyCode()} accessibilityLabel="Copy referral code" accessibilityRole="button">
            <Ionicons name="copy-outline" size={18} color={ACCENT} />
            <Text style={styles.copyText}>Copy</Text>
          </AnimatedPressable>
        </View>
      </View>

      {/* Share Link */}
      <View style={styles.flatSection}>
        <Text style={styles.sectionLabel}>YOUR INVITE LINK</Text>
        <View style={styles.linkRow}>
          <Text style={styles.linkText} numberOfLines={1}>
            {inviteLink}
          </Text>
          <AnimatedPressable style={styles.copyBtn} onPress={() => void handleCopyLink()} accessibilityLabel="Copy invite link" accessibilityRole="button">
            <Ionicons name="copy-outline" size={18} color={ACCENT} />
            <Text style={styles.copyText}>Copy</Text>
          </AnimatedPressable>
        </View>
      </View>

      {/* Share Options */}
      <View>
        <View style={styles.shareRow}>
          {([
            { icon: 'logo-whatsapp', label: 'WhatsApp', color: '#25D366' },
            { icon: 'logo-instagram', label: 'Instagram', color: '#E1306C' },
            { icon: 'mail-outline', label: 'Email', color: ACCENT },
            { icon: 'share-social-outline', label: 'More', color: MUTED },
          ] as Array<{ icon: React.ComponentProps<typeof Ionicons>['name']; label: string; color: string }>).map(s => (
            <AnimatedPressable key={s.label} style={styles.shareIconBtn} onPress={handleShare} accessibilityLabel={`Share via ${s.label}`} accessibilityRole="button">
              <View style={[styles.shareIconCircle, { borderColor: s.color }]}>
                <Ionicons name={s.icon} size={22} color={s.color} />
              </View>
              <Text style={styles.shareIconLabel}>{s.label}</Text>
            </AnimatedPressable>
          ))}
        </View>
      </View>

      {/* Rewards Summary */}
      <View style={styles.flatSection}>
        <View style={styles.rewardsHeader}>
          <Ionicons name="ribbon-outline" size={18} color={ACCENT} />
          <Text style={styles.rewardsTitle}>Your rewards</Text>
        </View>
        {statsUnavailable ? (
          <View style={styles.statsUnavailableRow}>
            <Ionicons name="cloud-offline-outline" size={20} color={MUTED} />
            <Text style={styles.statsUnavailableText}>
              Stats unavailable right now. Pull down to refresh or try again later.
            </Text>
          </View>
        ) : !hasReferrals ? (
          <View style={styles.statsUnavailableRow}>
            <Ionicons name="people-outline" size={20} color={MUTED} />
            <Text style={styles.statsUnavailableText}>
              No referrals yet — share your code to start earning.
            </Text>
          </View>
        ) : (
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
        )}
        <Text style={styles.rewardsFootnote}>
          Earn Thryftverse credit for each friend who completes their first sale. Credits apply to platform fees on your next listing.
        </Text>
      </View>

      {/* Referral History */}
      {historyUnavailable ? (
        <View style={styles.flatSection}>
          <View style={styles.rewardsHeader}>
            <Ionicons name="time-outline" size={18} color={ACCENT} />
            <Text style={styles.rewardsTitle}>Referral history</Text>
          </View>
          <View style={styles.statsUnavailableRow}>
            <Ionicons name="cloud-offline-outline" size={20} color={MUTED} />
            <Text style={styles.statsUnavailableText}>
              History unavailable right now. Try again later.
            </Text>
          </View>
        </View>
      ) : referralHistory.length > 0 ? (
        <View style={styles.flatSection}>
          <View style={styles.rewardsHeader}>
            <Ionicons name="time-outline" size={18} color={ACCENT} />
            <Text style={styles.rewardsTitle}>Referral history</Text>
          </View>
          <FlatList
            data={referralHistory}
            scrollEnabled={false}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => {
              const name = item.inviteeName || item.inviteeHandle || 'Anonymous';
              const dateLabel = new Date(item.invitedAt).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
              });
              const badgeStyle =
                item.status === 'invited' ? styles.badgeMuted :
                item.status === 'joined' ? styles.badgeBrand :
                styles.badgeSuccess;
              const badgeText =
                item.status === 'invited' ? styles.badgeMutedText :
                item.status === 'joined' ? styles.badgeBrandText :
                styles.badgeSuccessText;
              const label =
                item.status === 'invited' ? 'Invited' :
                item.status === 'joined' ? 'Joined' :
                item.status === 'completed' ? 'Completed' :
                'Rewarded';
              return (
                <View style={[styles.historyRow, index < referralHistory.length - 1 && styles.historyRowBordered]}>
                  <View style={styles.historyInfo}>
                    <Text style={styles.historyName} numberOfLines={1}>{name}</Text>
                    <Text style={styles.historyDate}>{dateLabel}</Text>
                  </View>
                  <View style={[styles.badge, badgeStyle]}>
                    <Text style={[styles.badgeText, badgeText]}>{label}</Text>
                  </View>
                </View>
              );
            }}
          />
        </View>
      ) : null}

      {/* Loyalty Tier — tier is derived from referral activity only.
          Per AGENTS.md §11, the tier badge is only shown when actually earned.
          We do NOT fabricate a "Bronze Member" tier for zero referrals, and we
          do NOT fabricate perks (reduced fees, priority support, exclusive
          drops) that the backend does not actually provide. */}
      {loyaltyTier && (
        <View style={styles.flatSection}>
          <View style={styles.loyaltyHeader}>
            <View style={[styles.loyaltyIconWrap, { borderColor: loyaltyTier.color }]}>
              <Ionicons name={loyaltyTier.icon} size={24} color={loyaltyTier.color} />
            </View>
            <View style={styles.loyaltyInfo}>
              <Text style={styles.loyaltyTierName}>{loyaltyTier.name} Member</Text>
              <Text style={styles.loyaltySubtext}>
                {loyaltyTier.nextThreshold
                  ? `${loyaltyTier.nextThreshold - referralStats.rewarded} more successful referrals to reach ${loyaltyTier.name === 'Silver' ? 'Gold' : 'Silver'}`
                  : 'Highest referral tier reached'}
              </Text>
            </View>
          </View>
          <View style={styles.loyaltyProgressTrack}>
            <View style={[styles.loyaltyProgressFill, { width: `${Math.min(loyaltyTier.progress, 100)}%`, backgroundColor: loyaltyTier.color }]} />
          </View>
          <Text style={styles.loyaltyFootnote}>
            Tier is based on successful referrals only.
          </Text>
        </View>
      )}

      {/* How it works */}
      <View style={styles.flatSection}>
        <Text style={styles.sectionLabel}>HOW IT WORKS</Text>
        {([
          { icon: 'share-outline', text: 'Share your referral link with friends' },
          { icon: 'person-add-outline', text: 'They sign up and create an account' },
          { icon: 'pricetag-outline', text: 'They list their first item for sale' },
          { icon: 'gift-outline', text: 'You both earn Thryftverse credit' },
        ] as Array<{ icon: React.ComponentProps<typeof Ionicons>['name']; text: string }>).map((step, i) => (
          <View key={i} style={[styles.stepRow, i < 3 && styles.stepRowBordered]}>
            <View style={styles.stepIconWrap}>
              <Ionicons name={step.icon} size={18} color={ACCENT} />
            </View>
            <Text style={styles.stepText}>{step.text}</Text>
          </View>
        ))}
      </View>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    content: { padding: Space.lg },
    flatSection: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingTop: Space.lg,
      marginBottom: Space.lg,
    },
    heroCard: {
      backgroundColor: colors.surface,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
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
      color: colors.textPrimary,
      marginTop: Space.md,
      marginBottom: Space.sm,
    },
    heroSubtitle: {
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      letterSpacing: Type.body.letterSpacing,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
      textAlign: 'center',
    },
    sectionLabel: {
      fontSize: Type.meta.size,
      lineHeight: Type.meta.lineHeight,
      letterSpacing: LetterSpacing.caps,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
      textTransform: 'uppercase',
      marginBottom: Space.sm,
      marginLeft: Space.xs,
    },
    section: { marginBottom: Space.lg },
    codeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm,
    },
    codeText: {
      fontSize: Type.title.size,
      lineHeight: Type.title.lineHeight,
      letterSpacing: Space.xs / 2,
      fontFamily: Typography.family.extrabold,
      color: colors.textPrimary,
    },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Space.sm,
    },
    linkText: {
      flex: 1,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      letterSpacing: Type.body.letterSpacing,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
    },
    copyBtn: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
    copyText: {
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight,
      letterSpacing: Type.caption.letterSpacing,
      fontFamily: Typography.family.semibold,
      color: colors.brand,
    },
    shareRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginBottom: Space.xl,
    },
    shareIconBtn: { alignItems: 'center', gap: Space.xs + 2 },
    shareIconCircle: {
      width: Space.xxl + Space.xxl + 8,
      height: Space.xxl + Space.xxl + 8,
      borderRadius: Space.lg + 4,
      borderWidth: Stroke.emphasis,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
    },
    shareIconLabel: {
      fontSize: Type.meta.size,
      lineHeight: Type.meta.lineHeight,
      letterSpacing: Type.meta.letterSpacing,
      fontFamily: Typography.family.medium,
      color: colors.textMuted,
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
      color: colors.textPrimary,
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
      gap: Space.xs / 2,
    },
    statValue: {
      fontSize: Type.title.size,
      lineHeight: Type.title.lineHeight,
      fontFamily: Typography.family.extrabold,
      color: colors.textPrimary,
    },
    statLabel: {
      fontSize: Type.meta.size,
      lineHeight: Type.meta.lineHeight,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
    },
    statDivider: {
      width: Stroke.standard,
      height: Space.xl + Space.xs,
      backgroundColor: colors.border,
    },
    rewardsFootnote: {
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight + 2,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
    },
    loyaltyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      marginBottom: Space.md,
    },
    loyaltyIconWrap: {
      width: Space.xl + Space.xl - 4,
      height: Space.xl + Space.xl - 4,
      borderRadius: Radius.xxl,
      borderWidth: Stroke.emphasis,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
    },
    loyaltyInfo: {
      flex: 1,
      gap: Space.xs / 2,
    },
    loyaltyTierName: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.bold,
      color: colors.textPrimary,
    },
    loyaltySubtext: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
    },
    loyaltyProgressTrack: {
      height: Space.xs + 2,
      borderRadius: Radius.sm,
      backgroundColor: colors.border,
      marginBottom: Space.md,
      overflow: 'hidden',
    },
    loyaltyProgressFill: {
      height: '100%',
      borderRadius: Radius.sm,
    },
    loyaltyFootnote: {
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight + 2,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
    },
    statsUnavailableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.md,
    },
    statsUnavailableText: {
      flex: 1,
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight + 2,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
    },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm,
    },
    stepRowBordered: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    stepIconWrap: {
      width: Control.chromeCompact,
      height: Space.xl + Space.xs,
      borderRadius: Radius.xl,
      backgroundColor: `${colors.brand}15`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepText: {
      flex: 1,
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      fontFamily: Typography.family.regular,
      color: colors.textPrimary,
    },
    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.md,
    },
    historyRowBordered: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    historyInfo: {
      flex: 1,
      gap: Space.xs / 2,
      marginRight: Space.sm,
    },
    historyName: {
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      fontFamily: Typography.family.semibold,
      color: colors.textPrimary,
    },
    historyDate: {
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight,
      fontFamily: Typography.family.regular,
      color: colors.textMuted,
    },
    badge: {
      paddingVertical: Space.xs / 2,
      paddingHorizontal: Space.sm,
      borderRadius: Radius.sm,
    },
    badgeText: {
      fontSize: Type.meta.size,
      lineHeight: Type.meta.lineHeight,
      letterSpacing: Type.meta.letterSpacing,
      fontFamily: Typography.family.semibold,
    },
    badgeMuted: {
      backgroundColor: `${colors.textMuted}15`,
    },
    badgeMutedText: {
      color: colors.textMuted,
    },
    badgeBrand: {
      backgroundColor: `${colors.brand}15`,
    },
    badgeBrandText: {
      color: colors.brand,
    },
    badgeSuccess: {
      backgroundColor: `${colors.success}15`,
    },
    badgeSuccessText: {
      color: colors.success,
    },
  });
}