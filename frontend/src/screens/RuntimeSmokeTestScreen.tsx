import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DevSettings } from 'react-native';
import { BodyEmphasis, Caption, Meta } from '../components/ui/Text';
import { ConfirmationSheet } from '../components/ConfirmationSheet';

import { Typography, Space, Radius, Type } from '../theme/designTokens';
type Props = NativeStackScreenProps<RootStackParamList, 'RuntimeSmokeTest'>;

/**
 * Lightweight runtime error logger for diagnostic navigation.
 * Does NOT swallow errors — it logs them clearly then re-throws
 * so the red screen still appears when something is genuinely broken.
 */
function logDiagnosticError(screen: string, params: unknown, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  // eslint-disable-next-line no-console
  console.error(`[DIAGNOSTIC CRASH] Screen: ${screen}`);
  // eslint-disable-next-line no-console
  console.error(`[DIAGNOSTIC CRASH] Params:`, JSON.stringify(params));
  // eslint-disable-next-line no-console
  console.error(`[DIAGNOSTIC CRASH] Message:`, message);
  if (stack) {
    // eslint-disable-next-line no-console
    console.error(`[DIAGNOSTIC CRASH] Stack:\n`, stack);
  }
  throw err;
}

function safeNavigate(
  navigation: Props['navigation'],
  screen: string,
  params?: unknown
) {
  try {
    // @ts-expect-error — dynamic diagnostic navigation
    navigation.navigate(screen, params);
  } catch (err) {
    logDiagnosticError(screen, params ?? {}, err);
  }
}

interface TestButton {
  label: string;
  screen: string;
  params?: Record<string, unknown>;
  needsData?: 'conversation' | 'listing' | 'user';
}

export default function RuntimeSmokeTestScreen({ navigation }: Props) {
  const conversations = useStore((s) => s.conversations);
  const currentUser = useStore((s) => s.currentUser);
  const { listings } = useBackendData();
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'default' | 'danger';
    onConfirm: () => void;
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  const firstConversation = conversations[0] ?? null;
  const firstGroupConversation =
    conversations.find((c) => c.type === 'group') ?? null;
  const firstListing = listings[0] ?? null;
  const knownUserId =
    firstConversation?.participantIds?.find(
      (id) => id !== 'me' && id !== currentUser?.id
    ) ?? null;

  const buildParams = (btn: TestButton): Record<string, unknown> | undefined => {
    if (btn.needsData === 'conversation') {
      const target =
        btn.screen === 'Chat' && btn.params?.isGroup
          ? firstGroupConversation
          : firstConversation;
      if (!target) return undefined;
      return { conversationId: target.id };
    }
    if (btn.needsData === 'listing') {
      if (!firstListing) return undefined;
      return { itemId: firstListing.id };
    }
    if (btn.needsData === 'user') {
      if (!knownUserId) return undefined;
      return { userId: knownUserId };
    }
    return btn.params;
  };

  const buttons: TestButton[] = [
    { label: 'Home', screen: 'MainTabs', params: { screen: 'Home' } },
    { label: 'Browse', screen: 'Browse', params: { categoryId: 'all', title: 'Browse' } },
    { label: 'Explore', screen: 'MainTabs', params: { screen: 'Explore' } },
    { label: 'VisualSearch', screen: 'VisualSearch' },
    { label: 'Sell', screen: 'Sell' },
    { label: 'Inbox', screen: 'MainTabs', params: { screen: 'Inbox' } },
    { label: 'Chat DM', screen: 'Chat', needsData: 'conversation' },
    { label: 'Chat Group', screen: 'Chat', params: { isGroup: true }, needsData: 'conversation' },
    { label: 'ChatSettings', screen: 'ChatSettings' },
    { label: 'BotDirectory', screen: 'BotDirectory' },
    { label: 'Settings', screen: 'Settings' },
    { label: 'AccountSettings', screen: 'AccountSettings' },
    { label: 'PushNotifications', screen: 'PushNotifications' },
    { label: 'PrivacySettings', screen: 'PrivacySettings' },
    { label: 'BlockedUsers', screen: 'BlockedUsers' },
    { label: 'ActiveSessions', screen: 'ActiveSessions' },
    { label: 'ChangePassword', screen: 'ChangePassword' },
    { label: 'HelpSupport', screen: 'HelpSupport' },
    { label: 'EditProfile', screen: 'EditProfile' },
    { label: 'TwoFactorSetup', screen: 'TwoFactorSetup' },
    { label: 'MyProfile', screen: 'MainTabs', params: { screen: 'Profile' } },
    { label: 'UserProfile', screen: 'UserProfile', needsData: 'user' },
    { label: 'Closet', screen: 'Closet' },
    { label: 'MyOrders', screen: 'MyOrders' },
    { label: 'CreatorStudio (poster)', screen: 'CreatorStudio', params: { type: 'poster' } },
    { label: 'CreatorStudio (look)', screen: 'CreatorStudio', params: { type: 'look' } },
    { label: 'ItemDetail', screen: 'ItemDetail', needsData: 'listing' },
  ];

  const handleResetLocalState = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const appKeys = keys.filter((k) =>
        k.startsWith('thryftverse') || k.startsWith('persist:') || k.startsWith('zustand')
      );
      if (appKeys.length > 0) {
        await AsyncStorage.multiRemove(appKeys);
      }
      setConfirmSheet({
        visible: true,
        title: 'Local State Cleared',
        message: `Removed ${appKeys.length} persisted keys. Reload the app to apply.`,
        confirmLabel: 'Reload Now',
        variant: 'default',
        onConfirm: () => {
          try { DevSettings.reload(); } catch {
            setConfirmSheet({
              visible: true,
              title: 'Please manually reload the app',
              message: 'Shake the device and select Reload.',
              confirmLabel: 'OK',
              variant: 'default',
              onConfirm: () => {},
            });
          }
        },
      });
    } catch (e) {
      setConfirmSheet({
        visible: true,
        title: 'Reset Failed',
        message: String(e),
        confirmLabel: 'OK',
        variant: 'default',
        onConfirm: () => {},
      });
    }
  };

  const handlePress = (btn: TestButton) => {
    const params = buildParams(btn);
    if (btn.needsData && !params) {
      setConfirmSheet({
        visible: true,
        title: 'No Data Available',
        message: `Cannot open ${btn.label}: no ${btn.needsData} found in current store/backend state.`,
        confirmLabel: 'OK',
        variant: 'default',
        onConfirm: () => {},
      });
      return;
    }
    safeNavigate(navigation, btn.screen, params);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={!isDark ? 'dark-content' : 'light-content'}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <BodyEmphasis style={styles.headerTitle}>
            Runtime Smoke Test
          </BodyEmphasis>
          <Caption color={colors.textMuted}>Dev-only</Caption>
        </View>

        <Meta color={colors.textMuted} style={styles.subtitle}>
          Tap a route to open it. Red screens are NOT swallowed — copy the
          terminal logs starting with [DIAGNOSTIC CRASH].
        </Meta>

        <View style={styles.statsCard}>
          <StatRow label="Conversations" value={String(conversations.length)} />
          <StatRow label="Listings" value={String(listings.length)} />
          <StatRow label="Current User" value={currentUser?.username ?? 'null'} />
          <StatRow
            label="First DM"
            value={firstConversation ? firstConversation.id.slice(0, 12) : 'none'}
          />
          <StatRow
            label="First Group"
            value={firstGroupConversation ? firstGroupConversation.id.slice(0, 12) : 'none'}
          />
          <StatRow
            label="First Listing"
            value={firstListing ? firstListing.id.slice(0, 12) : 'none'}
          />
          <StatRow
            label="Known User"
            value={knownUserId ? knownUserId.slice(0, 12) : 'none'}
          />
        </View>

        <AnimatedPressable
          style={styles.resetTile}
          onPress={handleResetLocalState}
          activeOpacity={0.8}
          scaleValue={0.96}
          hapticFeedback="heavy"
          accessibilityRole="button"
          accessibilityLabel="Reset local app state"
        >
          <Text style={styles.resetTileLabel}>Reset local app state</Text>
          <Caption style={styles.resetTileCaption}>Clears persisted stores + AsyncStorage</Caption>
        </AnimatedPressable>

        <View style={styles.grid}>
          {buttons.map((btn) => {
            const hasData =
              !btn.needsData || !!buildParams(btn);
            return (
              <AnimatedPressable
                key={btn.label}
                style={[
                  styles.tile,
                  !hasData && styles.tileDisabled,
                ]}
                onPress={() => handlePress(btn)}
                activeOpacity={0.8}
                scaleValue={0.96}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel={`Open ${btn.label}`}
              >
                <Text
                  style={[
                    styles.tileLabel,
                    !hasData && styles.tileLabelDisabled,
                  ]}
                  numberOfLines={1}
                >
                  {btn.label}
                </Text>
                {!hasData && (
                  <Caption style={styles.tileMissing}>
                    No data
                  </Caption>
                )}
              </AnimatedPressable>
            );
          })}
        </View>
      </ScrollView>
      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'default'}
        onConfirm={() => { confirmSheet.onConfirm(); setConfirmSheet((s) => ({ ...s, visible: false })); }}
      />
    </SafeAreaView>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.statRow}>
      <Caption color={colors.textSecondary}>{label}</Caption>
      <Caption color={colors.textPrimary} style={styles.statValue}>
        {value}
      </Caption>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: Space.md,
    paddingBottom: Space.xxl + Space.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
  },
  headerTitle: {
    fontSize: Type.title.size,
    letterSpacing: Type.title.letterSpacing,
    lineHeight: Type.title.lineHeight,
  },
  subtitle: {
    marginBottom: Space.md,
    lineHeight: Type.body.lineHeight,
  },
  statsCard: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    marginBottom: Space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: Space.xs + 2,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statValue: {
    fontFamily: Typography.family.medium,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  tile: {
    width: '30%',
    flexGrow: 1,
    minWidth: 100,
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    paddingVertical: Space.md,
    paddingHorizontal: Space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    minHeight: Space.xxl + Space.lg,
    gap: Space.xs,
  },
  tileDisabled: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderSubtle,
  },
  tileLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  tileLabelDisabled: {
    color: colors.textMuted,
  },
  tileMissing: {
    fontSize: Type.meta.size,
    color: colors.danger,
  },
  resetTile: {
    width: '100%',
    backgroundColor: colors.dangerSubtle,
    borderRadius: Radius.lg,
    paddingVertical: Space.md,
    paddingHorizontal: Space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.dangerBorder,
    marginBottom: Space.md,
    gap: Space.xs,
  },
  resetTileLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.danger,
    textAlign: 'center',
  },
  resetTileCaption: {
    fontSize: Type.meta.size,
    color: colors.textMuted,
    textAlign: 'center',
  },
  });
}