/**
 * AgentMemoryScreen — user-facing control surface for agent memory.
 *
 * Agents can remember durable facts about the user (sizes, preferences,
 * directives) across conversations. This screen is the ChatGPT-standard
 * control surface: inspect every stored memory, forget individual records,
 * clear everything, and turn memory or learning off entirely.
 *
 * Backed by the live /agent-memory endpoints — every row and toggle is a
 * real server record, not a device-local claim (AGENTS.md §11).
 *
 * Design (per AGENTS.md §4):
 * - Flat composition, hairline separators via SettingsSection/SettingsRow
 * - The memory text is the label — no decorative badges or chrome
 * - Tap a memory to read it in full and forget it
 * - Full state coverage: loading / error / empty / populated / syncing
 */

import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { FlagshipScreen, FlagshipHeader, FlagshipState, FlagshipDangerZone } from '../components/flagship';
import { SettingsSection } from '../components/settings/SettingsSection';
import { SettingsRow } from '../components/settings/SettingsRow';
import { Space } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import {
  clearAgentMemoriesFromApi,
  fetchAgentMemoryFromApi,
  retractAgentMemoryFromApi,
  updateAgentMemorySettingsFromApi,
  type AgentMemoryInfo,
  type AgentMemoryKind,
  type AgentMemorySettingsInfo,
} from '../services/botsApi';

type Props = NativeStackScreenProps<RootStackParamList, 'AgentMemory'>;

const KIND_LABELS: Record<AgentMemoryKind, string> = {
  preference: 'Preference',
  fact: 'Fact',
  directive: 'Rule',
  episodic_summary: 'Summary',
};

function memorySubtitle(m: AgentMemoryInfo): string {
  const scope = m.botId ? 'one agent' : 'all agents';
  const saved = m.createdAt.slice(0, 10);
  return `${KIND_LABELS[m.kind] ?? 'Memory'} · ${scope} · saved ${saved}`;
}

export default function AgentMemoryScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [settings, setSettings] = React.useState<AgentMemorySettingsInfo | null>(null);
  const [memories, setMemories] = React.useState<AgentMemoryInfo[]>([]);
  const [phase, setPhase] = React.useState<'loading' | 'error' | 'ready'>('loading');
  const [syncing, setSyncing] = React.useState<'memory' | 'extraction' | null>(null);

  const load = React.useCallback(async () => {
    setPhase('loading');
    try {
      const data = await fetchAgentMemoryFromApi();
      setSettings(data.settings);
      setMemories(data.memories);
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const toggleMemory = async (v: boolean) => {
    if (!settings || syncing) return;
    haptic.selection();
    setSyncing('memory');
    setSettings({ ...settings, memoryEnabled: v });
    try {
      setSettings(await updateAgentMemorySettingsFromApi({ memoryEnabled: v }));
    } catch {
      setSettings((s) => (s ? { ...s, memoryEnabled: !v } : s));
    } finally {
      setSyncing(null);
    }
  };

  const toggleExtraction = async (v: boolean) => {
    if (!settings || syncing) return;
    haptic.selection();
    setSyncing('extraction');
    setSettings({ ...settings, extractionEnabled: v });
    try {
      setSettings(await updateAgentMemorySettingsFromApi({ extractionEnabled: v }));
    } catch {
      setSettings((s) => (s ? { ...s, extractionEnabled: !v } : s));
    } finally {
      setSyncing(null);
    }
  };

  const forgetMemory = (memory: AgentMemoryInfo) => {
    haptic.light();
    Alert.alert(
      'Forget this?',
      memory.content,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Forget',
          style: 'destructive',
          onPress: async () => {
            haptic.medium();
            const prev = memories;
            setMemories(prev.filter((m) => m.id !== memory.id));
            try {
              await retractAgentMemoryFromApi(memory.id);
            } catch {
              setMemories(prev);
              Alert.alert('Could not forget', 'The memory could not be removed. Try again.');
            }
          },
        },
      ],
    );
  };

  const clearAll = () => {
    haptic.medium();
    Alert.alert(
      'Clear all memories?',
      `${memories.length} ${memories.length === 1 ? 'memory' : 'memories'} will be forgotten. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: async () => {
            haptic.heavy();
            try {
              await clearAgentMemoriesFromApi();
              setMemories([]);
            } catch {
              Alert.alert('Could not clear', 'Memories could not be cleared. Try again.');
            }
          },
        },
      ],
    );
  };

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Agent memory"
          onBack={() => navigation.goBack()}
        />
      }
    >
      {phase === 'loading' ? (
        <FlagshipState variant="loading" title="Loading memories" />
      ) : phase === 'error' ? (
        <FlagshipState
          variant="error"
          title="Could not load memories"
          subtitle="Your agent memory could not be reached. Try again."
          actionLabel="Try again"
          onAction={load}
        />
      ) : (
        <>
          {/* ── Controls ── */}
          <SettingsSection title="Controls" noCard>
            <SettingsRow
              icon="bookmark-outline"
              title="Remember me"
              subtitle="Agents can recall what they have learned about you"
              toggleValue={settings?.memoryEnabled ?? false}
              onToggle={toggleMemory}
              syncing={syncing === 'memory'}
              isFirst
            />
            <SettingsRow
              icon="sparkles-outline"
              title="Learn from chats"
              subtitle="Agents may save durable facts and preferences after a conversation"
              toggleValue={settings?.extractionEnabled ?? false}
              onToggle={toggleExtraction}
              syncing={syncing === 'extraction'}
              disabled={!settings?.memoryEnabled}
              isLast
            />
          </SettingsSection>

          {/* ── Memories ── */}
          <SettingsSection
            title={memories.length > 0 ? `Remembered (${memories.length})` : 'Remembered'}
            noCard
          >
            {memories.length === 0 ? (
              <View style={styles.emptyBlock}>
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                  Nothing remembered yet
                </Text>
                <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
                  {settings?.memoryEnabled
                    ? 'When an agent learns something durable about you — a size, a preference, a standing rule — it appears here for you to review or forget.'
                    : 'Memory is off. Turn on "Remember me" to let agents keep context across conversations.'}
                </Text>
              </View>
            ) : (
              memories.map((m, i) => (
                <SettingsRow
                  key={m.id}
                  title={m.content}
                  subtitle={memorySubtitle(m)}
                  onPress={() => forgetMemory(m)}
                  isFirst={i === 0}
                  isLast={i === memories.length - 1}
                  accessibilityLabel={`Memory: ${m.content}`}
                  accessibilityHint="Shows the full memory and lets you forget it"
                />
              ))
            )}
          </SettingsSection>

          {memories.length > 0 ? (
            <FlagshipDangerZone
              title="Clear all memories"
              description="Every remembered fact, preference and rule is forgotten. Agents will not use them again."
              actionLabel="Clear all memories"
              onAction={clearAll}
            />
          ) : null}
        </>
      )}
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    emptyBlock: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.lg,
    },
    emptyTitle: {
      fontSize: TypographyV2.bodyStrong.size,
      fontFamily: TypographyV2.bodyStrong.fontFamily,
      letterSpacing: TypographyV2.bodyStrong.letterSpacing,
      marginBottom: Space.xs,
    },
    emptyBody: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
      lineHeight: TypographyV2.meta.lineHeight,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },
  });
}
