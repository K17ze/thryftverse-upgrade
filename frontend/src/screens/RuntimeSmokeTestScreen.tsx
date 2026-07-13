import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { Typography } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DevSettings } from 'react-native';
import { Space, Radius, Type } from '../theme/designTokens';
import { BodyEmphasis, Caption, Meta } from '../components/ui/Text';

type Props = StackScreenProps<RootStackParamList, 'RuntimeSmokeTest'>;

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
  const { colors, isDark } = useAppTheme();
  const conversations = useStore((s) => s.conversations);
  const currentUser = useStore((s) => s.currentUser);
  const { listings } = useBackendData();

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
    { label: 'CreatePoster', screen: 'CreatePoster' },
    { label: 'CreateLook', screen: 'CreateLook' },
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
      Alert.alert(
        'Local State Cleared',
        `Removed ${appKeys.length} persisted keys. Reload the app to apply.`,
        [
          {
            text: 'Reload Now',
            onPress: () => {
              try { DevSettings.reload(); } catch {
                Alert.alert('Please manually reload the app (shake + Reload)');
              }
            },
          },
          { text: 'Later', style: 'cancel' },
        ]
      );
    } catch (e) {
      Alert.alert('Reset Failed', String(e));
    }
  };

  const handlePress = (btn: TestButton) => {
    const params = buildParams(btn);
    if (btn.needsData && !params) {
      Alert.alert(
        'No Data Available',
        `Cannot open ${btn.label}: no ${btn.needsData} found in current store/backend state.`
      );
      return;
    }
    safeNavigate(navigation, btn.screen, params);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
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

        <View style={[styles.statsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
          style={[styles.resetTile, { backgroundColor: colors.danger + '18', borderColor: colors.danger + '40' }]}
          onPress={handleResetLocalState}
          activeOpacity={0.8}
          scaleValue={0.96}
          hapticFeedback="heavy"
          accessibilityRole="button"
          accessibilityLabel="Reset local app state"
        >
          <Text style={[styles.resetTileLabel, { color: colors.danger }]}>Reset local app state</Text>
          <Caption style={[styles.resetTileCaption, { color: colors.textMuted }]}>Clears persisted stores + AsyncStorage</Caption>
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
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  !hasData && { backgroundColor: colors.surfaceAlt, borderColor: `${colors.border}60` },
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
                    { color: colors.textPrimary },
                    !hasData && { color: colors.textMuted },
                  ]}
                  numberOfLines={1}
                >
                  {btn.label}
                </Text>
                {!hasData && (
                  <Caption style={[styles.tileMissing, { color: colors.danger }]}>
                    No data
                  </Caption>
                )}
              </AnimatedPressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.statRow}>
      <Caption color={colors.textSecondary}>{label}</Caption>
      <Caption color={colors.textPrimary} style={styles.statValue}>
        {value}
      </Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: Space.md,
    paddingBottom: Space.xxl + 24,
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
    borderRadius: Radius.lg,
    padding: Space.md,
    marginBottom: Space.md,
    borderWidth: StyleSheet.hairlineWidth,
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
    borderRadius: Radius.lg,
    paddingVertical: Space.md,
    paddingHorizontal: Space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 72,
    gap: Space.xs,
  },
  tileLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    textAlign: 'center',
  },
  tileMissing: {
    fontSize: 10,
  },
  resetTile: {
    width: '100%',
    borderRadius: Radius.lg,
    paddingVertical: Space.md,
    paddingHorizontal: Space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Space.md,
    gap: Space.xs,
  },
  resetTileLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    textAlign: 'center',
  },
  resetTileCaption: {
    fontSize: 10,
    textAlign: 'center',
  },
});