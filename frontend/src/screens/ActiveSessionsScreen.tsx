import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { Colors } from '../constants/colors';
import { Space, Radius, Type , Typography  } from '../theme/designTokens';
import { AppButton } from '../components/ui/AppButton';
import { SettingsSection } from '../components/settings/SettingsSection';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { useReducedMotion } from '../hooks/useReducedMotion';

type Props = StackScreenProps<RootStackParamList, 'ActiveSessions'>;

interface SessionItem {
  id: string;
  deviceName: string;
  location: string;
  lastActive: string;
  isCurrent: boolean;
}

export default function ActiveSessionsScreen({ navigation }: Props) {
  const { show } = useToast();
  const currentUser = useStore((s) => s.currentUser);
  const reducedMotionEnabled = useReducedMotion();

  const [sessions] = useState<SessionItem[]>([
    {
      id: 'current',
      deviceName: `${Platform.OS === 'ios' ? 'iPhone' : 'Android'} (${Platform.Version ?? 'Unknown'})`,
      location: (currentUser as any)?.location ?? 'Unknown location',
      lastActive: 'Active now',
      isCurrent: true,
    },
  ]);

  const handleEndAllOthers = () => {
    Alert.alert(
      'End all other sessions?',
      'This will sign you out everywhere except this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End all others',
          style: 'destructive',
          onPress: () => {
            show('Session management requires backend support. Only this device is tracked locally.', 'info');
          },
        },
      ]
    );
  };

  return (
    <FlagshipScreen header={<FlagshipHeader title="Active Sessions" subtitle="Device security overview" onBack={() => navigation.goBack()} />}>
      {/* Security overview */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}>
        <View style={[styles.trustSurface, { backgroundColor: Colors.surface, borderColor: Colors.border }]}>
          <View style={styles.trustHeader}>
            <Ionicons name="shield-checkmark-outline" size={20} color={Colors.success} />
            <Text style={styles.trustTitle}>Your account is secure</Text>
          </View>
          <Text style={[styles.trustBody, { color: Colors.textSecondary }]}>
            Only this device is currently signed in. When you sign in on other devices, they will appear here.
          </Text>
        </View>
      </Reanimated.View>

      {/* This device */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}>
        <SettingsSection title="This device" noCard>
          {sessions.filter((s) => s.isCurrent).map((session) => (
            <View key={session.id} style={styles.sessionRow}>
              <View style={styles.deviceIcon}>
                <Ionicons name="phone-portrait-outline" size={22} color={Colors.brand} />
              </View>
              <View style={styles.sessionText}>
                <Text style={styles.sessionName}>{session.deviceName}</Text>
                <Text style={styles.sessionMeta}>{session.location} · {session.lastActive}</Text>
              </View>
              <View style={styles.currentBadge}>
                <Text style={styles.currentBadgeText}>Current</Text>
              </View>
            </View>
          ))}
        </SettingsSection>
      </Reanimated.View>

      {/* Other devices */}
      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)}>
        <SettingsSection title="Other devices" noCard>
          <View style={styles.emptyGroup}>
            <Ionicons name="desktop-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No other active sessions</Text>
            <Text style={styles.emptyBody}>
              When you sign in on another device, it will appear here so you can review it.
            </Text>
          </View>
        </SettingsSection>
      </Reanimated.View>

      <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)} style={{ paddingHorizontal: 16, marginTop: 16 }}>
        <AppButton
          title="End all other sessions"
          onPress={handleEndAllOthers}
          variant="secondary"
          size="md"
          style={{ borderRadius: Radius.xl }}
        />
        <Text style={styles.honestNote}>
          Full session tracking requires backend support. This screen shows your current device only.
        </Text>
      </Reanimated.View>
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 4,
    padding: Space.md,
  },
  deviceIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sessionText: {
    flex: 1,
  },
  sessionName: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
  },
  sessionMeta: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 2,
    letterSpacing: Type.caption.letterSpacing,
  },
  currentBadge: {
    backgroundColor: Colors.success + '20',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.md,
  },
  currentBadgeText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
    color: Colors.success,
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
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
  },
  emptyBody: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: Type.caption.lineHeight,
    paddingHorizontal: Space.md,
  },
  honestNote: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Space.sm,
    paddingHorizontal: Space.lg,
    lineHeight: Type.meta.lineHeight,
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
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
  },
  trustBody: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.caption.lineHeight,
    letterSpacing: Type.caption.letterSpacing,
  },
});