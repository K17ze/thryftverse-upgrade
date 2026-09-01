import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, RefreshControl, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useToast } from '../context/ToastContext';
import { Space, Radius, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { AppButton } from '../components/ui/AppButton';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { SettingsSection } from '../components/settings/SettingsSection';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SettingsListSkeleton } from '../components/skeletons/SettingsListSkeleton';
import { AppIcon } from '../components/common/AppIcon';
import { IconSize, type SemanticIconName } from '../theme/iconTokens';
import {
  fetchActiveSessions,
  revokeSession,
  revokeOtherSessions,
  type SessionInfo } from '../services/accountApi';
import { haptics } from '../utils/haptics';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveSessions'>;

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

function platformIcon(platform: string): SemanticIconName {
  if (platform === 'iOS' || platform === 'Android') return 'phone';
  if (platform === 'Web') return 'desktop';
  return 'desktop';
}

export default function ActiveSessionsScreen({ navigation }: Props) {
  const { show } = useToast();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmLabel?: string;
    variant?: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  const loadSessions = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchActiveSessions();
      setSessions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleRefresh = useCallback(() => {
    haptics.tap();
    setRefreshing(true);
    void loadSessions();
  }, [loadSessions]);

  const handleEndSession = useCallback((session: SessionInfo) => {
    setConfirmSheet({
      visible: true,
      title: 'End this session?',
      message: `This will sign out "${session.deviceName}" immediately.`,
      confirmLabel: 'End session',
      variant: 'danger',
      onConfirm: async () => {
        setRevokingId(session.id);
        try {
          await revokeSession(session.id);
          haptics.success();
          show('Session ended', 'success');
          setSessions((prev) => prev.filter((s) => s.id !== session.id));
        } catch (err) {
          show(err instanceof Error ? err.message : 'Failed to end session', 'error');
        } finally {
          setRevokingId(null);
        }
      } });
  }, [show]);

  const handleEndAllOthers = useCallback(() => {
    const otherCount = sessions.filter((s) => !s.isCurrent).length;
    if (otherCount === 0) {
      show('No other sessions to end', 'info');
      return;
    }
    setConfirmSheet({
      visible: true,
      title: 'End all other sessions?',
      message: `This will sign you out of ${otherCount} other device${otherCount > 1 ? 's' : ''}.`,
      confirmLabel: 'End all others',
      variant: 'danger',
      onConfirm: async () => {
        setRevokingOthers(true);
        try {
          const count = await revokeOtherSessions();
          haptics.success();
          show(`${count} session${count !== 1 ? 's' : ''} ended`, 'success');
          await loadSessions();
        } catch (err) {
          show(err instanceof Error ? err.message : 'Failed to end sessions', 'error');
        } finally {
          setRevokingOthers(false);
        }
      } });
  }, [sessions, show, loadSessions]);

  const currentSessions = sessions.filter((s) => s.isCurrent);
  const otherSessions = sessions.filter((s) => !s.isCurrent);

  return (
    <FlagshipScreen header={<FlagshipHeader title="Active Sessions" subtitle="Device security overview" onBack={() => navigation.goBack()} />}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.textSecondary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Security overview */}
          <View style={[styles.trustSurface, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.trustHeader}>
              <AppIcon name="lock" focused size={IconSize.md} color="success" opticalCenter accessible={false} />
              <Text style={styles.trustTitle}>
                {loading ? 'Checking your sessions…' : otherSessions.length === 0 ? 'Your account is secure' : `${otherSessions.length} other active session${otherSessions.length > 1 ? 's' : ''}`}
              </Text>
            </View>
            <Text style={[styles.trustBody, { color: colors.textSecondary }]}>
              {loading
                ? 'Reviewing all devices signed into your account.'
                : otherSessions.length === 0
                  ? 'Only this device is currently signed in. When you sign in on other devices, they will appear here.'
                  : 'Review the sessions below. If you don\u2019t recognise a device, end the session immediately.'}
            </Text>
          </View>

        {error && (
            <View style={[styles.errorBanner, { backgroundColor: colors.dangerSubtle, borderColor: colors.dangerBorder }]}>
              <AppIcon name="warning" size={IconSize.sm} color="danger" opticalCenter accessible={false} />
              <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            </View>
        )}

        {loading ? (
          <SettingsListSkeleton count={4} />
        ) : (
          <>
            {/* This device */}
              <SettingsSection title="This device" noCard>
                {currentSessions.length > 0 ? (
                  currentSessions.map((session) => (
                    <View key={session.id} style={styles.sessionRow}>
                      <View style={styles.deviceIcon}>
                        <AppIcon name={platformIcon(session.platform)} size={IconSize.lg} color="brand" opticalCenter accessible={false} />
                      </View>
                      <View style={styles.sessionText}>
                        <Text style={styles.sessionName}>{session.deviceName}</Text>
                        <Text style={styles.sessionMeta}>{session.ipAddress ?? 'Unknown IP'} · {formatLastActive(session.lastSeenAt ?? session.createdAt)}</Text>
                      </View>
                      <View style={styles.currentBadge}>
                        <Text style={styles.currentBadgeText}>Current</Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <View style={styles.emptyGroup}>
                    <AppIcon name="help" size={IconSize.hero} color="textMuted" opticalCenter accessible={false} />
                    <Text style={styles.emptyTitle}>Could not identify this device</Text>
                    <Text style={styles.emptyBody}>
                      Pull to refresh to try again.
                    </Text>
                  </View>
                )}
              </SettingsSection>

            {/* Other devices */}
              <SettingsSection title="Other devices" noCard>
                {otherSessions.length === 0 ? (
                  <View style={styles.emptyGroup}>
                    <AppIcon name="desktop" size={IconSize.hero} color="textMuted" opticalCenter accessible={false} />
                    <Text style={styles.emptyTitle}>No other active sessions</Text>
                    <Text style={styles.emptyBody}>
                      When you sign in on another device, it will appear here so you can review it.
                    </Text>
                  </View>
                ) : (
                  otherSessions.map((session, idx) => (
                    <View
                      key={session.id}
                      style={[
                        styles.sessionRow,
                        idx === otherSessions.length - 1 && styles.sessionRowLast,
                      ]}
                    >
                      <View style={styles.deviceIcon}>
                        <AppIcon name={platformIcon(session.platform)} size={IconSize.lg} color="textSecondary" opticalCenter accessible={false} />
                      </View>
                      <View style={styles.sessionText}>
                        <Text style={styles.sessionName}>{session.deviceName}</Text>
                        <Text style={styles.sessionMeta}>{session.ipAddress ?? 'Unknown IP'} · {formatLastActive(session.lastSeenAt ?? session.createdAt)}</Text>
                      </View>
                      <AppButton
                        title={revokingId === session.id ? 'Ending…' : 'End'}
                        onPress={() => handleEndSession(session)}
                        variant="secondary"
                        size="sm"
                        disabled={revokingId === session.id}
                        style={{ borderRadius: Radius.md, minWidth: 60 }}
                      />
                    </View>
                  ))
                )}
              </SettingsSection>

            {/* End all others */}
            {otherSessions.length > 0 && (
              <View style={styles.endAllContainer}>
                <AppButton
                  title={revokingOthers ? 'Ending all…' : 'End all other sessions'}
                  onPress={handleEndAllOthers}
                  variant="secondary"
                  size="md"
                  disabled={revokingOthers}
                  style={{ borderRadius: Radius.xl }}
                />
              </View>
            )}
          </>
        )}
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  scrollContent: {
    paddingBottom: Space.xxl },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.smMd,
    padding: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle },
  sessionRowLast: {
    borderBottomWidth: 0 },
  deviceIcon: {
    width: Space.xxl,
    height: Space.xxl,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center' },
  sessionText: {
    flex: 1 },
  sessionName: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.body.letterSpacing },
  sessionMeta: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    marginTop: Space.xs / 2,
    letterSpacing: TypographyV2.meta.letterSpacing },
  currentBadge: {
    backgroundColor: colors.successSubtle,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.md },
  currentBadgeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.success,
    letterSpacing: TypographyV2.meta.letterSpacing },
  emptyGroup: {
    alignItems: 'center',
    paddingVertical: Space.xl,
    gap: Space.sm },
  emptyTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.body.letterSpacing },
  emptyBody: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: TypographyV2.meta.lineHeight,
    paddingHorizontal: Space.md },
  trustSurface: {
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.lg,
    marginHorizontal: Space.md,
    marginBottom: Space.lg },
  trustHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: Space.sm },
  trustTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.body.letterSpacing,
    flex: 1 },
  trustBody: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight,
    letterSpacing: TypographyV2.meta.letterSpacing },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    padding: Space.md,
    marginHorizontal: Space.md,
    marginBottom: Space.md },
  errorText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    flex: 1 },
  endAllContainer: {
    paddingHorizontal: Space.md,
    marginTop: Space.md } });
}
