import React, { useMemo, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps, RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Control, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { FlagshipScreen, FlagshipHeader, FlagshipState, FlagshipFormSection } from '../components/flagship';
import { SettingsInfoBanner } from '../components/settings/SettingsInfoBanner';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useConnectivity } from '../hooks/useConnectivity';
import { fetchKycStatus, type KycStatus } from '../services/complianceApi';
import { parseApiError } from '../lib/apiClient';

type Props = NativeStackScreenProps<RootStackParamList, 'VerificationStatus'>;

// Effective verification status — merges local + backend into one of four states.
type EffectiveStatus = 'unverified' | 'in_review' | 'verified' | 'rejected';

interface TimelineStep {
  label: string;
  detail: string;
  status: 'complete' | 'active' | 'pending';
  icon: React.ComponentProps<typeof Ionicons>['name'];
}

export default function VerificationStatusScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();
  const { isOffline } = useConnectivity();

  const currentUser = useStore((state) => state.currentUser);
  const coOwnCompliance = useStore((state) => state.coOwnCompliance);

  const [backendStatus, setBackendStatus] = useState<KycStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async (silent = false) => {
    if (!currentUser?.id) {
      setIsLoading(false);
      return;
    }
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const res = await fetchKycStatus(currentUser.id);
      setBackendStatus(res.kycStatus);
    } catch (err) {
      const isNetworkError = isOffline || (err instanceof Error && /network|fetch|timeout/i.test(err.message));
      const parsed = parseApiError(err, isNetworkError ? 'You appear to be offline. Check your connection and try again.' : undefined);
      setError(parsed.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [currentUser?.id, isOffline]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    void loadStatus(true);
  }, [loadStatus]);

  // ── Derive effective status ──
  const emailVerified = currentUser?.emailVerified ?? false;
  const kycVerifiedLocal = coOwnCompliance.kycVerified;
  const backendVerified = backendStatus?.status === 'verified';
  const backendPending = backendStatus?.status === 'pending';
  const backendRejected = backendStatus?.status === 'rejected';

  const effectiveStatus: EffectiveStatus = useMemo(() => {
    if (kycVerifiedLocal || backendVerified) return 'verified';
    if (backendRejected) return 'rejected';
    if (backendPending) return 'in_review';
    return 'unverified';
  }, [kycVerifiedLocal, backendVerified, backendRejected, backendPending]);

  const handleStartVerification = useCallback(() => {
    haptic.light();
    navigation.navigate('Verification');
  }, [navigation, haptic]);

  const handleResubmit = useCallback(() => {
    haptic.medium();
    navigation.navigate('Verification');
  }, [navigation, haptic]);

  // ── Timeline ── derived from backend status fields + email
  const timeline: TimelineStep[] = useMemo(() => {
    const docStatus = backendStatus?.documentStatus ?? 'unsubmitted';
    const livenessStatus = backendStatus?.livenessStatus ?? 'unsubmitted';

    return [
      {
        label: 'Email confirmed',
        detail: emailVerified ? 'Verified' : 'Pending — check your inbox',
        status: emailVerified ? 'complete' : 'pending',
        icon: emailVerified ? 'checkmark-circle' : 'mail-outline' },
      {
        label: 'Identity details',
        detail:
          effectiveStatus === 'unverified'
            ? 'Not started'
            : 'Submitted',
        status: effectiveStatus === 'unverified' ? 'pending' : 'complete',
        icon: 'person-outline' },
      {
        label: 'Document check',
        detail:
          docStatus === 'approved'
            ? 'Approved'
            : docStatus === 'submitted'
            ? 'Submitted — under review'
            : docStatus === 'rejected'
            ? 'Rejected'
            : 'Not submitted',
        status:
          docStatus === 'approved'
            ? 'complete'
            : docStatus === 'submitted'
            ? 'active'
            : docStatus === 'rejected'
            ? 'pending'
            : 'pending',
        icon: 'card-outline' },
      {
        label: 'Selfie & liveness',
        detail:
          livenessStatus === 'passed'
            ? 'Passed'
            : livenessStatus === 'pending'
            ? 'Under review'
            : livenessStatus === 'failed'
            ? 'Failed — retake required'
            : 'Not submitted',
        status:
          livenessStatus === 'passed'
            ? 'complete'
            : livenessStatus === 'pending'
            ? 'active'
            : 'pending',
        icon: 'scan-outline' },
      {
        label: 'Final review',
        detail:
          effectiveStatus === 'verified'
            ? 'Approved'
            : effectiveStatus === 'in_review'
            ? 'In review'
            : effectiveStatus === 'rejected'
            ? 'Declined'
            : 'Awaiting submission',
        status:
          effectiveStatus === 'verified'
            ? 'complete'
            : effectiveStatus === 'in_review'
            ? 'active'
            : 'pending',
        icon: 'checkmark-circle-outline' },
    ];
  }, [backendStatus, emailVerified, effectiveStatus]);

  // ── States ──
  if (isLoading) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Verification Status" onBack={() => navigation.goBack()} />}>
        <FlagshipState variant="loading" title="Loading verification status..." />
      </FlagshipScreen>
    );
  }

  if (error && !backendStatus) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Verification Status" onBack={() => navigation.goBack()} />}>
        <FlagshipState
          variant="error"
          title="Could not load status"
          subtitle={error}
          actionLabel="Try again"
          onAction={() => void loadStatus()}
        />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Verification Status" onBack={() => navigation.goBack()} />}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.textMuted} />
        }
      >
        {/* ── Status hero ── */}
        <StatusHero status={effectiveStatus} />

        {/* ── Status-specific content ── */}
        {effectiveStatus === 'unverified' && (
          <View>
            <FlagshipFormSection
              variant="flat"
              title="Build buyer trust"
              style={styles.section}
            >
              <View style={styles.panelContent}>
                <Text style={[styles.panelBody, { color: colors.textSecondary }]}>
                  Verified sellers get a trust badge, higher listing visibility, and access to higher selling limits. The process takes a few minutes to complete and is typically reviewed within 24 hours.
                </Text>
                <AnimatedPressable
                  style={styles.primaryBtn}
                  onPress={handleStartVerification}
                  hapticFeedback="medium"
                  accessibilityRole="button"
                  accessibilityLabel="Start verification"
                >
                  <Text style={styles.primaryBtnText}>Start verification</Text>
                </AnimatedPressable>
              </View>
            </FlagshipFormSection>
          </View>
        )}

        {effectiveStatus === 'in_review' && (
          <View>
            <FlagshipFormSection
              variant="flat"
              title="What we are checking"
              style={styles.section}
            >
              <View style={styles.panelContent}>
                <ReviewCheckItem icon="document-text-outline" text="Your identity details match the document provided" colors={colors} styles={styles} />
                <ReviewCheckItem icon="scan-outline" text="Document is genuine and not tampered with" colors={colors} styles={styles} />
                <ReviewCheckItem icon="happy-outline" text="Selfie matches the document photo" colors={colors} styles={styles} />
                <ReviewCheckItem icon="lock-closed-outline" text="Sanctions and fraud screening" colors={colors} styles={styles} />
                <View style={[styles.etaBanner, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name="time-outline" size={16} color={colors.warning} />
                  <Text style={[styles.etaText, { color: colors.textSecondary }]}>
                    Estimated review time: within 24 hours
                  </Text>
                </View>
              </View>
            </FlagshipFormSection>
          </View>
        )}

        {effectiveStatus === 'verified' && (
          <View>
            <FlagshipFormSection
              variant="flat"
              title="Your verification benefits"
              style={styles.section}
            >
              <View style={styles.panelContent}>
                <BenefitItem icon="checkmark-circle-outline" text="Verified seller badge on your profile and listings" colors={colors} styles={styles} />
                <BenefitItem icon="trending-up-outline" text="Higher listing visibility in search and discovery" colors={colors} styles={styles} />
                <BenefitItem icon="layers-outline" text="Higher selling limits and Co-Own eligibility" colors={colors} styles={styles} />
                <BenefitItem icon="people-outline" text="Buyer trust — verified sellers sell faster" colors={colors} styles={styles} />
              </View>
            </FlagshipFormSection>
          </View>
        )}

        {effectiveStatus === 'rejected' && (
          <View>
            <FlagshipFormSection
              variant="flat"
              title="Verification declined"
              style={styles.section}
            >
              <View style={styles.panelContent}>
                <Text style={[styles.panelBody, { color: colors.textSecondary }]}>
                  Your submission could not be verified. This can happen if the document was unclear, the selfie did not match, or details did not match our records. Review and resubmit.
                </Text>
                <AnimatedPressable
                  style={styles.primaryBtn}
                  onPress={handleResubmit}
                  hapticFeedback="medium"
                  accessibilityRole="button"
                  accessibilityLabel="Resubmit verification"
                >
                  <Text style={styles.primaryBtnText}>Resubmit verification</Text>
                </AnimatedPressable>
              </View>
            </FlagshipFormSection>
          </View>
        )}

        {/* ── Timeline ── */}
        <View>
          <FlagshipFormSection
            variant="flat"
            title="Verification timeline"
            style={styles.section}
          >
            <View style={styles.timelineList}>
              {timeline.map((step, i) => (
                <TimelineRow
                  key={step.label}
                  step={step}
                  isLast={i === timeline.length - 1}
                  colors={colors}
                  styles={styles}
                />
              ))}
            </View>
          </FlagshipFormSection>
        </View>

        {/* ── Trust & privacy note ── */}
        <SettingsInfoBanner
          icon="lock-closed-outline"
          text="Your verification data is encrypted, used only for identity checks, and deleted after review. It is never shared publicly."
        />

        <Pressable
          style={styles.footerLink}
          onPress={() => Linking.openURL('https://thryftverse.com/verification')}
          accessibilityRole="link"
          accessibilityLabel="Read the verification guide on the web"
        >
          <Text style={[styles.footerLinkText, { color: colors.brand }]}>
            Read our verification guide
          </Text>
        </Pressable>
      </ScrollView>
    </FlagshipScreen>
  );
}

// ── Status hero ──
// Flat, prominent status block — no card, no circle. The icon colour + bold
// subtitle-size title carry the visual hierarchy (per AGENTS.md flat canvas).
function StatusHero({ status }: { status: EffectiveStatus }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const config = STATUS_HERO_CONFIG[status];
  const accentColor =
    config.accent === 'success'
      ? colors.success
      : config.accent === 'warning'
      ? colors.warning
      : config.accent === 'danger'
      ? colors.danger
      : colors.brand;

  return (
    <View style={styles.statusHero}>
      <Ionicons
        name={config.icon}
        size={32}
        color={accentColor}
        style={styles.statusHeroIcon}
      />
      <View style={styles.statusHeroBody}>
        <Text style={[styles.statusHeroTitle, { color: colors.textPrimary }]}>
          {config.title}
        </Text>
        <Text style={[styles.statusHeroSubtitle, { color: colors.textSecondary }]}>
          {config.subtitle}
        </Text>
      </View>
    </View>
  );
}

const STATUS_HERO_CONFIG: Record<
  EffectiveStatus,
  { title: string; subtitle: string; icon: React.ComponentProps<typeof Ionicons>['name']; accent: 'brand' | 'success' | 'warning' | 'danger' }
> = {
  unverified: {
    title: 'Not verified',
    subtitle: 'Verify your identity to unlock seller benefits',
    icon: 'alert-circle-outline',
    accent: 'brand' },
  in_review: {
    title: 'In review',
    subtitle: 'We are checking your submission — typically within 24 hours',
    icon: 'hourglass-outline',
    accent: 'warning' },
  verified: {
    title: 'Verified',
    subtitle: 'Your identity is confirmed. You have the verified seller badge.',
    icon: 'checkmark-circle',
    accent: 'success' },
  rejected: {
    title: 'Verification declined',
    subtitle: 'Your submission could not be verified. Resubmit to try again.',
    icon: 'close-circle-outline',
    accent: 'danger' } };

// ── Sub-components ──
function ReviewCheckItem({
  icon,
  text,
  colors,
  styles }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.checkRow}>
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <Text style={[styles.checkText, { color: colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

function BenefitItem({
  icon,
  text,
  colors,
  styles }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  text: string;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.checkRow}>
      <Ionicons name={icon} size={18} color={colors.success} />
      <Text style={[styles.checkText, { color: colors.textPrimary }]}>{text}</Text>
    </View>
  );
}

function TimelineRow({
  step,
  isLast,
  colors,
  styles }: {
  step: TimelineStep;
  isLast: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const color =
    step.status === 'complete'
      ? colors.success
      : step.status === 'active'
      ? colors.warning
      : colors.textMuted;

  return (
    <View style={[styles.timelineRow, isLast && styles.timelineRowLast]}>
      <View style={styles.timelineMarkerCol}>
        <View style={[styles.timelineDot, { borderColor: color }]}>
          <Ionicons name={step.icon} size={14} color={color} />
        </View>
        {!isLast && <View style={[styles.timelineConnector, { backgroundColor: colors.borderSubtle }]} />}
      </View>
      <View style={styles.timelineBody}>
        <Text style={[styles.timelineLabel, { color: colors.textPrimary }]}>{step.label}</Text>
        <Text style={[styles.timelineDetail, { color }]}>{step.detail}</Text>
      </View>
    </View>
  );
}

// ── Styles ──
function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.xl },
    statusHero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      paddingHorizontal: Space.md,
      paddingVertical: Space.lg },
    statusHeroIcon: {
      marginBottom: 0 },
    statusHeroBody: {
      flex: 1 },
    statusHeroTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      marginBottom: 2 },
    statusHeroSubtitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily },
    section: {
      marginBottom: Space.md },
    panelContent: {
      gap: Space.sm },
    panelBody: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      lineHeight: TypographyV2.body.lineHeight },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.xs / 2 },
    checkText: {
      flex: 1,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      lineHeight: TypographyV2.body.lineHeight },
    etaBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs + 2,
      borderRadius: Radius.md,
      marginTop: Space.xs },
    etaText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily },
    primaryBtn: {
      height: Control.hit + 2,
      borderRadius: Radius.md,
      backgroundColor: colors.brand,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: Space.xs },
    primaryBtnText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textInverse },
    timelineList: {
      paddingVertical: Space.xs },
    timelineRow: {
      flexDirection: 'row',
      gap: Space.sm,
      minHeight: Control.hit },
    timelineRowLast: {
      minHeight: 0 },
    timelineMarkerCol: {
      width: Space.xl - Space.xs,
      alignItems: 'center' },
    timelineDot: {
      width: Space.xl - Space.xs,
      height: Space.xl - Space.xs,
      borderRadius: Radius.xl,
      borderWidth: Stroke.standard + Stroke.hairline,
      alignItems: 'center',
      justifyContent: 'center' },
    timelineConnector: {
      width: StyleSheet.hairlineWidth,
      flex: 1,
      minHeight: Space.md + Space.xs,
      marginTop: Space.xs / 2 },
    timelineBody: {
      flex: 1,
      paddingBottom: Space.sm },
    timelineLabel: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      marginBottom: Space.xs / 4 },
    timelineDetail: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily },
    footerLink: {
      alignItems: 'center',
      paddingVertical: Space.sm },
    footerLinkText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily } });
}
