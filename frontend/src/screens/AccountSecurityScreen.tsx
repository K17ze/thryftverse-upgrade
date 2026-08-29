import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { parseApiError } from '../lib/apiClient';
import { FlagshipScreen, FlagshipHeader, FlagshipState, FlagshipNavigationRow } from '../components/flagship';
import { AppButton } from '../components/ui/AppButton';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { Space, Radius, Stroke, IconGrammar } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { haptics } from '../utils/haptics';
import {
  fetchInterventionState,
  fetchSecuritySessions,
  revokeSecuritySession,
  revokeOtherSecuritySessions,
  declareCompromise,
  type UserSafeInterventionState,
  type SecuritySessionInfo } from '../services/accountSecurityApi';
import {
  registerPasskey,
  listUserPasskeys,
  removeUserPasskey,
  type PasskeyInfo } from '../services/passkeyApi';

type Props = NativeStackScreenProps<RootStackParamList, 'AccountSecurity'>;

function formatLastActive(iso: string | null): string {
  if (!iso) return 'Unknown';
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Active now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function platformIcon(platform: string): React.ComponentProps<typeof Ionicons>['name'] {
  if (platform === 'iOS' || platform === 'Android') return 'phone-portrait-outline';
  if (platform === 'Web') return 'desktop-outline';
  return 'hardware-chip-outline';
}

/**
 * AccountSecurityScreen — the security center for ThryftVerse.
 *
 * Design (AGENTS.md §4 — Anti-AI design policy):
 * - A focused surface with clear next actions, NOT a dashboard of cards.
 * - No card-on-card composition, no decorative warning gradient, no giant
 *   empty "danger zone", no pulsing shields, no animated risk meters, no
 *   gamified "security score."
 * - One dominant next action when intervention is needed; recovery and
 *   support are restrained secondary rows.
 * - Red is for confirmed destructive consequence; amber for unresolved
 *   checks; neutral for routine verification.
 * - Sessions are redacted: no token hashes, no raw device fingerprints.
 * - The user sees plain-language state and a clear next action — never
 *   numeric risk scores, model labels, or surveillance-like device details.
 */
export default function AccountSecurityScreen({ navigation }: Props) {
  const { show } = useToast();
  const haptic = useHaptic();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [intervention, setIntervention] = useState<UserSafeInterventionState | null>(null);
  const [sessions, setSessions] = useState<SecuritySessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const [declaring, setDeclaring] = useState(false);
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [registeringPasskey, setRegisteringPasskey] = useState(false);
  const [removingPasskeyId, setRemovingPasskeyId] = useState<string | null>(null);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmLabel?: string;
    variant?: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [interventionState, sessionList, passkeyList] = await Promise.all([
        fetchInterventionState(),
        fetchSecuritySessions(),
        listUserPasskeys().catch(() => [] as PasskeyInfo[]),
      ]);
      setIntervention(interventionState);
      setSessions(sessionList);
      setPasskeys(passkeyList);
    } catch (err) {
      const parsed = parseApiError(err, 'Unable to load security details right now.');
      setError(parsed.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    haptics.tap();
    setRefreshing(true);
    void loadData();
  }, [loadData]);

  const handleRevokeSession = useCallback(async (sessionId: string) => {
    setRevokingId(sessionId);
    try {
      await revokeSecuritySession(sessionId);
      haptic.medium();
      show('Session revoked', 'success');
      setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, isRevoked: true } : s));
    } catch (err) {
      const parsed = parseApiError(err, 'Could not revoke this session.');
      show(parsed.message, 'error');
    } finally {
      setRevokingId(null);
    }
  }, [haptic, show]);

  const handleRevokeOthers = useCallback(async () => {
    setConfirmSheet({
      visible: true,
      title: 'Revoke other sessions',
      message: 'This will sign out all other devices. You will stay signed in on this device.',
      confirmLabel: 'Revoke',
      variant: 'danger',
      onConfirm: async () => {
        setRevokingOthers(true);
        try {
          const result = await revokeOtherSecuritySessions();
          haptic.heavy();
          show(`${result.revokedCount} session${result.revokedCount === 1 ? '' : 's'} revoked`, 'success');
          setSessions((prev) => prev.map((s) => s.isCurrent ? s : { ...s, isRevoked: true }));
        } catch (err) {
          const parsed = parseApiError(err, 'Could not revoke other sessions.');
          show(parsed.message, 'error');
        } finally {
          setRevokingOthers(false);
        }
      } });
  }, [haptic, show]);

  const handleRegisterPasskey = useCallback(async () => {
    setRegisteringPasskey(true);
    try {
      const result = await registerPasskey();
      haptic.medium();
      show('Passkey added', 'success');
      // Reload passkeys
      const updated = await listUserPasskeys();
      setPasskeys(updated);
    } catch (err) {
      const parsed = parseApiError(err, 'Could not add passkey');
      show(parsed.message, 'error');
    } finally {
      setRegisteringPasskey(false);
    }
  }, [haptic, show]);

  const handleRemovePasskey = useCallback(async (credentialId: string) => {
    setConfirmSheet({
      visible: true,
      title: 'Remove passkey',
      message: 'You will need to use another sign-in method if you remove this passkey.',
      confirmLabel: 'Remove',
      variant: 'danger',
      onConfirm: async () => {
        setRemovingPasskeyId(credentialId);
        try {
          await removeUserPasskey(credentialId);
          haptic.medium();
          show('Passkey removed', 'success');
          setPasskeys((prev) => prev.filter((p) => p.credentialId !== credentialId));
        } catch (err) {
          const parsed = parseApiError(err, 'Could not remove passkey');
          show(parsed.message, 'error');
        } finally {
          setRemovingPasskeyId(null);
        }
      } });
  }, [haptic, show]);

  const handleDeclareCompromise = useCallback(async () => {
    setConfirmSheet({
      visible: true,
      title: 'Secure your account',
      message: 'If you think someone else accessed your account, we will sign out other sessions and hold payouts until you confirm it is safe.',
      confirmLabel: 'Secure account',
      variant: 'danger',
      onConfirm: async () => {
        setDeclaring(true);
        try {
          const result = await declareCompromise({});
          haptic.heavy();
          navigation.navigate('AccountSecurityRecovery', { caseId: result.caseId });
        } catch (err) {
          const parsed = parseApiError(err, 'Could not start account recovery.');
          show(parsed.message, 'error');
        } finally {
          setDeclaring(false);
        }
      } });
  }, [haptic, show, navigation]);

  // ── Loading state ──────────────────────────────────────────────────
  if (loading) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Security"
            onBack={() => navigation.goBack()}
          />
        }
      >
        <FlagshipState variant="loading" title="Loading security details" />
      </FlagshipScreen>
    );
  }

  // ── Error state ────────────────────────────────────────────────────
  if (error && !intervention) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Security"
            onBack={() => navigation.goBack()}
          />
        }
      >
        <FlagshipState
          variant="error"
          actionLabel="Try again"
          onAction={() => {
            setLoading(true);
            void loadData();
          }}
        />
      </FlagshipScreen>
    );
  }

  const hasIntervention = intervention && intervention.state !== 'normal';
  const isAmber = intervention?.state === 'review_in_progress' || intervention?.state === 'verification_required';
  const isRed = intervention?.state === 'access_limited';
  const activeSessions = sessions.filter((s) => !s.isRevoked);
  const otherSessions = activeSessions.filter((s) => !s.isCurrent);

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Security"
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
      {/* ── Intervention banner (only when non-normal) ─────────────── */}
      {hasIntervention && intervention && (
        <View
          style={[
            styles.interventionBanner,
            { borderLeftColor: isRed ? colors.danger : isAmber ? colors.warning : colors.textMuted },
          ]}
        >
          <Text style={[styles.interventionText, { color: colors.textPrimary }]}>
            {intervention.reasonFamily}
          </Text>
          {intervention.impactedCapabilities.length > 0 && (
            <Text style={[styles.interventionCaps, { color: colors.textSecondary }]}>
              {intervention.impactedCapabilities.map(capabilityLabel).join(' · ')}
            </Text>
          )}
          {intervention.nextAction.label && intervention.nextAction.route && (
            <AppButton
              title={intervention.nextAction.label}
              variant={isRed ? 'danger' : 'primary'}
              size="md"
              onPress={() => {
                haptic.medium();
                if (intervention.nextAction.route === '/account-security/recovery') {
                  // Navigate to recovery if we have an active case
                  // The intervention state doesn't carry the caseId directly,
                  // so we navigate to the security screen which will show the
                  // recovery entry point.
                  navigation.navigate('AccountSecurity');
                } else if (intervention.nextAction.route === '/account-security/sessions') {
                  // Scroll to sessions section — they're already on screen
                  haptic.light();
                } else if (intervention.nextAction.route === '/support') {
                  navigation.navigate('HelpSupport');
                }
              }}
              style={styles.interventionAction}
            />
          )}
        </View>
      )}

      {/* ── Sessions section ────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          {activeSessions.length === 0 ? 'No active sessions' : 'Where you are signed in'}
        </Text>
        {otherSessions.length > 0 && (
          <FlagshipNavigationRow
            title="Sign out other devices"
            subtitle={`${otherSessions.length} other session${otherSessions.length === 1 ? '' : 's'}`}
            icon="log-out-outline"
            iconColor={colors.danger}
            danger
            onPress={handleRevokeOthers}
            separator={false}
            accessibilityLabel="Sign out other devices"
            accessibilityHint="Revokes all sessions except this device"
          />
        )}
        {activeSessions.map((session, index) => (
          <SessionRow
            key={session.id}
            session={session}
            isRevoking={revokingId === session.id}
            onRevoke={() => handleRevokeSession(session.id)}
            isLast={index === activeSessions.length - 1}
            colors={colors}
            styles={styles}
          />
        ))}
        {activeSessions.length === 0 && (
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            No active sessions found.
          </Text>
        )}
      </View>

      {/* ── Recovery section (restrained, no decorative danger zone) ── */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          Account access
        </Text>
        <FlagshipNavigationRow
          title="Add passkey"
          subtitle={passkeys.length > 0
            ? `${passkeys.length} passkey${passkeys.length === 1 ? '' : 's'} registered`
            : 'Use Face ID, Touch ID, or a security key to sign in'}
          icon="key-outline"
          onPress={handleRegisterPasskey}
          separator={passkeys.length > 0}
          accessibilityLabel="Add a passkey"
          accessibilityHint="Register a passkey for faster, more secure sign-in"
        />
        {passkeys.map((passkey, index) => (
          <PasskeyRow
            key={passkey.credentialId}
            passkey={passkey}
            isRemoving={removingPasskeyId === passkey.credentialId}
            onRemove={() => handleRemovePasskey(passkey.credentialId)}
            isLast={index === passkeys.length - 1}
            colors={colors}
            styles={styles}
          />
        ))}
        <FlagshipNavigationRow
          title="Something looks wrong"
          subtitle="Secure your account if you see activity you do not recognise"
          icon="shield-checkmark-outline"
          onPress={handleDeclareCompromise}
          separator={false}
          accessibilityLabel="Secure your account"
          accessibilityHint="Starts account recovery if you suspect compromise"
        />
      </View>

      {/* ── Support (restrained secondary) ──────────────────────────── */}
      <View style={styles.section}>
        <FlagshipNavigationRow
          title="Contact support"
          icon="chatbubble-outline"
          onPress={() => navigation.navigate('HelpSupport')}
          separator={false}
          accessibilityLabel="Contact support"
          accessibilityHint="Open help and support"
        />
      </View>
      </ScrollView>

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((prev) => ({ ...prev, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'default'}
        onConfirm={confirmSheet.onConfirm}
      />
    </FlagshipScreen>
  );
}

// ── Session row ────────────────────────────────────────────────────────

function SessionRow({
  session,
  isRevoking,
  onRevoke,
  isLast,
  colors,
  styles }: {
  session: SecuritySessionInfo;
  isRevoking: boolean;
  onRevoke: () => void;
  isLast: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const icon = platformIcon(session.platform);
  return (
    <View style={[styles.sessionRow, !isLast && { borderBottomColor: colors.borderSubtle }]}>
      <View style={styles.sessionIconWrap}>
        <Ionicons name={icon} size={20} color={colors.textSecondary} />
      </View>
      <View style={styles.sessionContent}>
        <Text style={[styles.sessionDevice, { color: colors.textPrimary }]}>
          {session.deviceName || session.platform || 'Unknown device'}
          {session.isCurrent && (
            <Text style={[styles.sessionCurrent, { color: colors.success }]}>  · This device</Text>
          )}
        </Text>
        <Text style={[styles.sessionMeta, { color: colors.textSecondary }]}>
          {formatLastActive(session.lastSeenAt)}
          {session.ipAddress ? `  · ${session.ipAddress}` : ''}
        </Text>
      </View>
      {!session.isCurrent && !session.isRevoked && (
        <AppButton
          title={isRevoking ? '…' : 'Revoke'}
          variant="ghost"
          size="sm"
          onPress={onRevoke}
          disabled={isRevoking}
          style={styles.revokeBtn}
        />
      )}
      {session.isRevoked && !session.isCurrent && (
        <Text style={[styles.revokedLabel, { color: colors.textMuted }]}>
          Revoked
        </Text>
      )}
    </View>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function capabilityLabel(cap: string): string {
  const labels: Record<string, string> = {
    payout_changes: 'Payout changes',
    withdrawals: 'Withdrawals',
    protected_field_changes: 'Profile changes' };
  return labels[cap] ?? cap;
}

// ── Styles ─────────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    interventionBanner: {
      borderLeftWidth: 3,
      borderRadius: Radius.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
      marginBottom: Space.lg,
      gap: Space.xs },
    interventionText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      lineHeight: TypographyV2.body.lineHeight,
      letterSpacing: TypographyV2.body.letterSpacing },
    interventionCaps: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      lineHeight: TypographyV2.meta.lineHeight },
    interventionAction: {
      marginTop: Space.xs,
      alignSelf: 'flex-start' },
    section: {
      marginBottom: Space.lg },
    sectionTitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing,
      textTransform: 'uppercase',
      marginBottom: Space.sm,
      paddingHorizontal: Space.md },
    sessionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Space.smMd,
      paddingHorizontal: Space.md,
      borderBottomWidth: Stroke.hairline,
      minHeight: 52 },
    sessionIconWrap: {
      marginRight: Space.md },
    sessionContent: {
      flex: 1,
      gap: 2 },
    sessionDevice: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing },
    sessionCurrent: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily },
    sessionMeta: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    revokeBtn: {
      minWidth: 60 },
    revokedLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      letterSpacing: TypographyV2.meta.letterSpacing },
    emptyText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      letterSpacing: TypographyV2.body.letterSpacing,
      paddingHorizontal: Space.md,
      paddingVertical: Space.md } });
}

// ── Passkey row ────────────────────────────────────────────────────────

function PasskeyRow({
  passkey,
  isRemoving,
  onRemove,
  isLast,
  colors,
  styles }: {
  passkey: PasskeyInfo;
  isRemoving: boolean;
  onRemove: () => void;
  isLast: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const label = passkey.name || (passkey.backupEligible ? 'Synced passkey' : 'This device');
  return (
    <View style={[styles.sessionRow, !isLast && { borderBottomColor: colors.borderSubtle }]}>
      <View style={styles.sessionIconWrap}>
        <Ionicons name="key-outline" size={20} color={colors.textSecondary} />
      </View>
      <View style={styles.sessionContent}>
        <Text style={[styles.sessionDevice, { color: colors.textPrimary }]}>
          {label}
        </Text>
        <Text style={[styles.sessionMeta, { color: colors.textSecondary }]}>
          {passkey.backupEligible ? 'Synced across devices' : 'Single device'}
          {passkey.lastUsedAt ? `  · Used ${formatLastActive(passkey.lastUsedAt)}` : ''}
        </Text>
      </View>
      <AppButton
        title={isRemoving ? '…' : 'Remove'}
        variant="ghost"
        size="sm"
        onPress={onRemove}
        style={styles.revokeBtn}
      />
    </View>
  );
}
