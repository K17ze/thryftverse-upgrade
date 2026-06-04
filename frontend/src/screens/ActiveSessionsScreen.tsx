import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { ActiveTheme, Colors } from '../constants/colors';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { Space, Radius, Type } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Typography } from '../constants/typography';
import { AppButton } from '../components/ui/AppButton';

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
  const logout = useStore((s) => s.logout);

  const [sessions] = useState<SessionItem[]>([
    {
      id: 'current',
      deviceName: `${Platform.OS === 'ios' ? 'iPhone' : 'Android'} (${Platform.Version ?? 'Unknown'})`,
      location: currentUser?.location ?? 'Unknown location',
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={Colors.background}
      />

      <View style={styles.header}>
        <AnimatedPressable
          onPress={() => navigation.goBack()}
          style={styles.headerBack}
          scaleValue={0.92}
          hapticFeedback="light"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Active Sessions</Text>
        <View style={styles.headerBack} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Reanimated.View entering={FadeInDown.duration(300).delay(0)}>
          <Text style={styles.sectionLabel}>This device</Text>
          <View style={styles.rowGroup}>
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
          </View>
        </Reanimated.View>

        <Reanimated.View entering={FadeInDown.duration(300).delay(60)}>
          <Text style={styles.sectionLabel}>Other devices</Text>
          <View style={[styles.rowGroup, styles.emptyGroup]}>
            <Ionicons name="desktop-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No other active sessions</Text>
            <Text style={styles.emptyBody}>
              When you sign in on another device, it will appear here so you can review or end it.
            </Text>
          </View>
        </Reanimated.View>

        <Reanimated.View entering={FadeInDown.duration(300).delay(120)} style={{ marginTop: Space.lg }}>
          <AppButton
            title="End all other sessions"
            onPress={handleEndAllOthers}
            variant="secondary"
            size="md"
            style={styles.actionBtn}
          />
          <Text style={styles.honestNote}>
            Full session tracking requires backend support. This screen shows your current device only.
          </Text>
        </Reanimated.View>

        <View style={{ height: Space.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 4,
  },
  headerBack: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: Type.subtitle.letterSpacing,
    lineHeight: Type.subtitle.lineHeight,
  },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
  },
  sectionLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginBottom: Space.sm + 4,
    marginTop: Space.lg,
    letterSpacing: Type.body.letterSpacing,
  },
  rowGroup: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: Space.sm,
    padding: Space.md,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 4,
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
  actionBtn: {
    borderRadius: Radius.xl,
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
});
