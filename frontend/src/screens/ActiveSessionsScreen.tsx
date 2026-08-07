import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, Platform, RefreshControl, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useToast } from '../context/ToastContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Space, Radius, Type , Typography, Stroke  } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { AppButton } from '../components/ui/AppButton';
import { SettingsSection } from '../components/settings/SettingsSection';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SettingsListSkeleton } from '../components/skeletons/SettingsListSkeleton';
import {
  fetchActiveSessions,
  revokeSession,
  revokeOtherSessions,
  type SessionInfo,
} from '../services/accountApi';
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

function platformIcon(platform: string): React.ComponentProps<typeof Ionicons>['name'] {
  if (platform === 'iOS') return 'phone-portrait-outline';
  if (platform === 'Android') return 'phone-portrait-outline';
  if (platform === 'Web') return 'desktop-outline';
  return 'hardware-chip-outline';
}

export default function ActiveSessionsScreen({ navigation }: Props) {
  const { show } = useToast();
  const { colors } = useAppTheme();
  const reducedMotionEnabled = useReducedMotion();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);

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
    Alert.alert(
      'End this session?',
      `This will sign out "${session.deviceName}" immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End session',
          style: 'destructive',
          onPress: async () => {
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
          },
        },
      ]
    );
  }, [show]);

  const handleEndAllOthers = useCallback(() => {
    const otherCount = sessions.filter((s) => !s.isCurrent).length;
    if (otherCount === 0) {
      show('No other sessions to end', 'info');
      return;
    }
    Alert.alert(
      'End all other sessions?',
      `This will sign you out of ${otherCount} other device${otherCount > 1 ? 's' : ''}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End all others',
          style: 'destructive',
          onPress: async () => {
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
          },
        },
      ]
    );
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
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}>
          <View style={[styles.trustSurface, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.trustHeader}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.success} />
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
        </Reanimated.View>

        {error && (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}>
            <View style={[styles.errorBanner, { backgroundColor: colors.danger + '10', borderColor: colors.danger + '30' }]}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
              <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            </View>
          </Reanimated.View>
        )}

        {loading ? (
          <SettingsListSkeleton count={4} />
        ) : (
          <>
            {/* This device */}
            <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}>
              <SettingsSection title="This device" noCard>
                {currentSessions.length > 0 ? (
                  currentSessions.map((session) => (
                    <View key={session.id} style={styles.sessionRow}>
                      <View style={styles.deviceIcon}>
                        <Ionicons name={platformIcon(session.platform)} size={22} color={colors.brand} />
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
                  <View style={styles.sessionRow}>
                    <View style={styles.deviceIcon}>
                      <Ionicons name="phone-portrait-outline" size={22} color={colors.brand} />
                    </View>
                    <View style={styles.sessionText}>
                      <Text style={styles.sessionName}>{Platform.OS === 'ios' ? 'iPhone' : 'Android device'}</Text>
                      <Text style={styles.sessionMeta}>Active now</Text>
                    </View>
                    <View style={styles.currentBadge}>
                      <Text style={styles.currentBadgeText}>Current</Text>
                    </View>
                  </View>
                )}
              </SettingsSection>
            </Reanimated.View>

            {/* Other devices */}
            <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}>
              <SettingsSection title="Other devices" noCard>
                {otherSessions.length === 0 ? (
                  <View style={styles.emptyGroup}>
                    <Ionicons name="desktop-outline" size={32} color={colors.textMuted} />
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
                        <Ionicons name={platformIcon(session.platform)} size={22} color={colors.textSecondary} />
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
            </Reanimated.View>

            {/* End all others */}
            {otherSessions.length > 0 && (
              <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)} style={styles.endAllContainer}>
                <AppButton
                  title={revokingOthers ? 'Ending all…' : 'End all other sessions'}
                  onPress={handleEndAllOthers}
                  variant="secondary"
                  size="md"
                  disabled={revokingOthers}
                  style={{ borderRadius: Radius.xl }}
                />
              </Reanimated.View>
            )}
          </>
        )}
      </ScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  scrollContent: {
    paddingBottom: Space.xxl,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 4,
    padding: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  sessionRowLast: {
    borderBottomWidth: 0,
  },
  deviceIcon: {
    width: Space.xxl,
    height: Space.xxl,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sessionText: {
    flex: 1,
  },
  sessionName: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
  },
  sessionMeta: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    marginTop: Space.xs / 2,
    letterSpacing: Type.caption.letterSpacing,
  },
  currentBadge: {
    backgroundColor: colors.success + '20',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.md,
  },
  currentBadgeText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: colors.success,
    letterSpacing: Type.meta.letterSpacing,
  },
  emptyGroup: {
    alignItems: 'center',
    paddingVertical: Space.xl,
    gap: Space.sm,
  },
  emptyTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
  },
  emptyBody: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: Type.caption.lineHeight,
    paddingHorizontal: Space.md,
  },
  trustSurface: {
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.lg,
    marginHorizontal: Space.md,
    marginBottom: Space.lg,
  },
  trustHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  trustTitle: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
    flex: 1,
  },
  trustBody: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.caption.lineHeight,
    letterSpacing: Type.caption.letterSpacing,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.lg,
    borderWidth: Stroke.standard,
    padding: Space.md,
    marginHorizontal: Space.md,
    marginBottom: Space.md,
  },
  errorText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    flex: 1,
  },
  endAllContainer: {
    paddingHorizontal: Space.md,
    marginTop: Space.md,
  },
});
}
