import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  RefreshControl,
  ScrollView,
  Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { parseApiError } from '../lib/apiClient';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { AppButton } from '../components/ui/AppButton';
import { Space, Radius, Typography, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import {
  fetchIncident,
  createRecoveryChallenge,
  verifyRecoveryChallenge,
  restoreAccess,
  type CompromiseIncidentDetail } from '../services/accountSecurityApi';

type Props = NativeStackScreenProps<RootStackParamList, 'AccountSecurityRecovery'>;

type RecoveryPhase = 'overview' | 'verify' | 'verifying' | 'restoring' | 'done';

/**
 * AccountSecurityRecoveryScreen — the account-takeover recovery checklist.
 *
 * Design (AGENTS.md §4 — Anti-AI design policy):
 * - A focused recovery checklist with the next safest action, NOT a
 *   dashboard of cards.
 * - No card-on-card composition, no decorative warning gradient, no
 *   pulsing shields, no animated risk meters.
 * - One dominant next action; support is a restrained secondary row.
 * - The user sees plain-language state, what is protected, and what they
 *   need to do next — never internal risk scores or surveillance details.
 * - Money is NEVER auto-released on recovery. The cooldown is visible.
 */
export default function AccountSecurityRecoveryScreen({ navigation, route }: Props) {
  const caseId = route.params?.caseId;
  const { show } = useToast();
  const haptic = useHaptic();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [incident, setIncident] = useState<CompromiseIncidentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<RecoveryPhase>('overview');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [proof, setProof] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const loadIncident = useCallback(async () => {
    if (!caseId) {
      setError('No case ID provided.');
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const data = await fetchIncident(caseId);
      setIncident(data);
      if (data.state === 'restored_monitored' || data.state === 'closed_genuine') {
        setPhase('done');
      }
    } catch (err) {
      const parsed = parseApiError(err, 'Unable to load recovery details.');
      setError(parsed.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [caseId]);

  useEffect(() => {
    void loadIncident();
  }, [loadIncident]);

  const handleRefresh = useCallback(() => {
    haptic.light();
    setRefreshing(true);
    void loadIncident();
  }, [loadIncident, haptic]);

  const handleStartVerification = useCallback(async () => {
    if (!caseId) return;
    setActionLoading(true);
    try {
      const challenge = await createRecoveryChallenge(caseId, { factor: 'email' });
      setChallengeId(challenge.challengeId);
      setPhase('verify');
      haptic.medium();
    } catch (err) {
      const parsed = parseApiError(err, 'Could not start verification.');
      show(parsed.message, 'error');
    } finally {
      setActionLoading(false);
    }
  }, [caseId, haptic, show]);

  const handleVerify = useCallback(async () => {
    if (!caseId || !challengeId || !proof.trim()) return;
    setPhase('verifying');
    try {
      const result = await verifyRecoveryChallenge(caseId, challengeId, proof.trim());
      if (result.verified) {
        haptic.heavy();
        setPhase('restoring');
        // Auto-proceed to restore
        try {
          const restoration = await restoreAccess(caseId);
          setIncident((prev) => prev ? {
            ...prev,
            state: restoration.state,
            cooldownUntil: restoration.cooldownUntil,
            recoveryMethod: 'trusted_channel' } : prev);
          setPhase('done');
          show('Account secured. Some actions are temporarily limited.', 'success');
        } catch (restoreErr) {
          const parsed = parseApiError(restoreErr, 'Verification succeeded but restoration failed.');
          show(parsed.message, 'error');
          setPhase('overview');
        }
      } else {
        haptic.medium();
        show('That code did not match. Try again.', 'error');
        setPhase('verify');
      }
    } catch (err) {
      const parsed = parseApiError(err, 'Verification failed.');
      show(parsed.message, 'error');
      setPhase('verify');
    }
  }, [caseId, challengeId, proof, haptic, show]);

  // ── Loading state ──────────────────────────────────────────────────
  if (loading) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Secure your account"
            onBack={() => navigation.goBack()}
          />
        }
      >
        <FlagshipState variant="loading" title="Loading recovery details" />
      </FlagshipScreen>
    );
  }

  // ── Error state ────────────────────────────────────────────────────
  if (error && !incident) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Secure your account"
            onBack={() => navigation.goBack()}
          />
        }
      >
        <FlagshipState
          variant="error"
          actionLabel="Try again"
          onAction={() => {
            setLoading(true);
            void loadIncident();
          }}
        />
      </FlagshipScreen>
    );
  }

  if (!incident) return null;

  const isContained = incident.state === 'contained' || incident.state === 'suspected';
  const isRecovering = incident.state === 'recovery_in_progress';
  const isRestored = incident.state === 'restored_monitored';
  const isClosed = incident.state === 'closed_genuine' || incident.state === 'closed_compromised';

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Secure your account"
          onBack={() => navigation.goBack()}
        />
      }
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: Space.xl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.textMuted}
          />
        }
        showsVerticalScrollIndicator={false}
      >
      {/* ── Status summary (plain-language, no scores) ──────────────── */}
      <View style={[styles.statusBlock, { borderLeftColor: isRestored || isClosed ? colors.success : colors.warning }]}>
        <Text style={[styles.statusText, { color: colors.textPrimary }]}>
          {isRestored && 'Your account is secured'}
          {isClosed && 'Recovery complete'}
          {isContained && 'Your account is being kept safe'}
          {isRecovering && 'Recovering your account'}
        </Text>
        <Text style={[styles.statusSub, { color: colors.textSecondary }]}>
          {isRestored && 'Some actions are temporarily limited while we monitor.'}
          {isClosed && 'You can use your account normally.'}
          {isContained && 'We have paused payouts and signed out other sessions.'}
          {isRecovering && 'Follow the steps below to restore access.'}
        </Text>
      </View>

      {/* ── What is protected (truthful, no decoration) ─────────────── */}
      {(incident.payoutHoldActive || incident.withdrawalHoldActive || incident.protectedChangeHoldActive) && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            What is protected
          </Text>
          {incident.payoutHoldActive && (
            <Text style={[styles.protectedRow, { color: colors.textPrimary }]}>
              <Ionicons name="lock-closed-outline" size={14} color={colors.textSecondary} />  Payout details changes
            </Text>
          )}
          {incident.withdrawalHoldActive && (
            <Text style={[styles.protectedRow, { color: colors.textPrimary }]}>
              <Ionicons name="lock-closed-outline" size={14} color={colors.textSecondary} />  Withdrawals
            </Text>
          )}
          {incident.protectedChangeHoldActive && (
            <Text style={[styles.protectedRow, { color: colors.textPrimary }]}>
              <Ionicons name="lock-closed-outline" size={14} color={colors.textSecondary} />  Email, phone and password changes
            </Text>
          )}
          <Text style={[styles.protectedNote, { color: colors.textMuted }]}>
            Your funds are safe. These actions are paused until you confirm access.
          </Text>
        </View>
      )}

      {/* ── Recovery checklist ──────────────────────────────────────── */}
      {!isRestored && !isClosed && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            Steps to restore access
          </Text>

          {/* Step 1: Verify identity */}
          <ChecklistStep
            number={1}
            title="Confirm it is you"
            description="We will send a verification code to your original email."
            done={isRecovering || phase === 'verify' || phase === 'verifying'}
            colors={colors}
            styles={styles}
          />

          {phase === 'overview' && (
            <AppButton
              title="Start verification"
              variant="primary"
              size="md"
              onPress={handleStartVerification}
              disabled={actionLoading}
              style={styles.stepAction}
            />
          )}

          {phase === 'verify' && (
            <View style={styles.verifyBlock}>
              <Text style={[styles.verifyLabel, { color: colors.textSecondary }]}>
                Enter the code sent to your email
              </Text>
              <TextInput
                style={[styles.verifyInput, { color: colors.textPrimary, borderColor: colors.border }]}
                value={proof}
                onChangeText={setProof}
                placeholder="Verification code"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                autoCapitalize="none"
                autoFocus
              />
              <AppButton
                title="Verify"
                variant="primary"
                size="md"
                onPress={handleVerify}
                disabled={!proof.trim() || phase !== 'verify'}
                style={styles.stepAction}
              />
            </View>
          )}

          {phase === 'verifying' && (
            <Text style={[styles.verifyingText, { color: colors.textMuted }]}>
              Verifying…
            </Text>
          )}

          {phase === 'restoring' && (
            <Text style={[styles.verifyingText, { color: colors.textMuted }]}>
              Restoring access…
            </Text>
          )}

          {/* Step 2: Restore (happens automatically after verification) */}
          <ChecklistStep
            number={2}
            title="Restore access"
            description="We will restore your access and start a short monitoring period."
            done={isRestored || isClosed}
            colors={colors}
            styles={styles}
          />

          {/* Step 3: Cooldown */}
          <ChecklistStep
            number={3}
            title="Monitoring period"
            description={incident.cooldownUntil
              ? `Some actions remain limited until ${new Date(incident.cooldownUntil).toLocaleDateString()}.`
              : 'Some actions remain limited for a short period after recovery.'}
            done={isClosed}
            colors={colors}
            styles={styles}
          />
        </View>
      )}

      {/* ── Done state ──────────────────────────────────────────────── */}
      {(isRestored || isClosed) && (
        <View style={styles.section}>
          <AppButton
            title="Back to security"
            variant="primary"
            size="md"
            onPress={() => navigation.navigate('AccountSecurity')}
            style={styles.doneAction}
          />
        </View>
      )}

      {/* ── Support (restrained secondary) ──────────────────────────── */}
      <View style={styles.section}>
        <Text style={[styles.supportText, { color: colors.textSecondary }]}>
          Need help?{' '}
          <Text
            style={{ color: colors.brand }}
            onPress={() => navigation.navigate('HelpSupport')}
          >
            Contact support
          </Text>
        </Text>
      </View>
      </ScrollView>
    </FlagshipScreen>
  );
}

// ── Checklist step ─────────────────────────────────────────────────────

function ChecklistStep({
  number,
  title,
  description,
  done,
  colors,
  styles }: {
  number: number;
  title: string;
  description: string;
  done: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.stepRow}>
      <View style={[
        styles.stepNumber,
        { backgroundColor: done ? colors.success : colors.surfaceAlt, borderColor: done ? colors.success : colors.border },
      ]}>
        {done ? (
          <Ionicons name="checkmark" size={14} color={colors.background} />
        ) : (
          <Text style={[styles.stepNumberText, { color: colors.textSecondary }]}>{number}</Text>
        )}
      </View>
      <View style={styles.stepContent}>
        <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>
          {title}
        </Text>
        <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>
          {description}
        </Text>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    statusBlock: {
      borderLeftWidth: 3,
      borderRadius: Radius.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
      marginBottom: Space.lg,
      gap: Space.xs },
    statusText: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: TypographyV2.sectionTitle.fontFamily,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      lineHeight: TypographyV2.sectionTitle.lineHeight },
    statusSub: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      lineHeight: TypographyV2.body.lineHeight },
    section: {
      marginBottom: Space.lg,
      paddingHorizontal: Space.md },
    sectionTitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      textTransform: 'uppercase',
      marginBottom: Space.sm },
    protectedRow: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      lineHeight: TypographyV2.body.lineHeight,
      paddingVertical: Space.xs },
    protectedNote: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight,
      marginTop: Space.sm },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: Space.sm,
      gap: Space.md },
    stepNumber: {
      width: 24,
      height: 24,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: Stroke.standard,
      marginTop: 2 },
    stepNumberText: {
      fontSize: TypographyV2.captionElevated.size,
      fontFamily: Typography.family.semibold },
    stepContent: {
      flex: 1,
      gap: 2 },
    stepTitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing },
    stepDesc: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight },
    stepAction: {
      marginTop: Space.sm,
      marginBottom: Space.sm,
      alignSelf: 'flex-start' },
    verifyBlock: {
      marginTop: Space.sm,
      marginBottom: Space.sm,
      gap: Space.sm },
    verifyLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    verifyInput: {
      borderWidth: Stroke.standard,
      borderRadius: Radius.md,
      paddingHorizontal: Space.md,
      paddingVertical: Space.smMd,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: 2 },
    verifyingText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      paddingVertical: Space.sm },
    doneAction: {
      alignSelf: 'stretch' },
    supportText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      textAlign: 'center',
      paddingVertical: Space.md } });
}
