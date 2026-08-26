/**
 * AgentLedgerScreen — viewable record of material agent actions.
 *
 * Displays the agent activity ledger (spec 05: "activity ledger records
 * material actions"). Each entry shows what happened, which agent was
 * involved, the runtime, the capability, and the result — in plain
 * language the user can understand.
 *
 * Per AGENTS.md §11 (Truthful UI):
 *  - Entries are real records from the ledger service — never fabricated.
 *  - The empty state is truthful: "No agent activity yet" when the ledger
 *    is empty, not a placeholder with fake data.
 *  - The clear action genuinely removes persisted entries.
 *
 * Design (per AGENTS.md §4):
 *  - Flat canvas, hairline separators, no card-on-card composition.
 *  - One dominant surface (the activity list).
 *  - Clear visual hierarchy: action label > agent > timestamp > summary.
 *  - All colors via useAppTheme(), all geometry via design tokens.
 *
 * State coverage (per AGENTS.md §14):
 *  - Loading: while reading the ledger on mount.
 *  - Populated: list of activity entries.
 *  - Empty: "No agent activity yet" with explanation.
 *  - Error: ledger read failure (non-fatal — shows empty state).
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { FlagshipScreen, FlagshipHeader, FlagshipState } from '../components/flagship';
import { Space, Radius, Type, Typography, Stroke, Control } from '../theme/designTokens';
import {
  getAgentActivity,
  clearAgentActivity,
  ACTIVITY_LABELS,
  ACTIVITY_ICONS,
  type AgentActivityEntry,
  type AgentActivityType,
} from '../services/agentActivityLedger';

type Props = NativeStackScreenProps<RootStackParamList, 'AgentLedger'>;

export default function AgentLedgerScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [loading, setLoading] = React.useState(true);
  const [entries, setEntries] = React.useState<AgentActivityEntry[]>([]);

  // Load ledger on mount.
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      const activity = await getAgentActivity();
      if (!mounted) return;
      setEntries(activity);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleClear = () => {
    Alert.alert(
      'Clear activity ledger',
      'This permanently removes all recorded agent activity from this device. This does not affect running agents.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            haptic.medium();
            await clearAgentActivity();
            setEntries([]);
            haptic.selection();
          },
        },
      ],
    );
  };

  const formatDate = (iso: string): string => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffHr = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHr / 24);
      if (diffMin < 1) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHr < 24) return `${diffHr}h ago`;
      if (diffDay < 7) return `${diffDay}d ago`;
      return d.toLocaleDateString();
    } catch {
      return iso;
    }
  };

  const resultColor = (status: AgentActivityEntry['resultStatus']): string => {
    switch (status) {
      case 'success':
        return colors.success;
      case 'failed':
        return colors.danger;
      case 'paused':
        return colors.warning;
      case 'denied':
        return colors.danger;
      default:
        return colors.textMuted;
    }
  };

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Agent activity"
          subtitle="Record of agent actions and approvals"
          onBack={() => navigation.goBack()}
          rightAction={
            entries.length > 0 ? (
              <Pressable
                onPress={handleClear}
                accessibilityRole="button"
                accessibilityLabel="Clear activity ledger"
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <Text style={[styles.clearBtn, { color: colors.danger }]}>Clear</Text>
              </Pressable>
            ) : undefined
          }
        />
      }
    >
      {loading ? (
        <FlagshipState variant="loading" style={styles.loadingWrap} />
      ) : entries.length === 0 ? (
        <View>
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="list-outline" size={28} color={colors.textMuted} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              No agent activity yet
            </Text>
            <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
              When you deploy agents, call tools, or approve actions, they will appear here as a transparent record.
            </Text>
          </View>
        </View>
      ) : (
        <View>
          <View style={styles.sectionLabelWrap}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
              {entries.length} ENTR{entries.length === 1 ? 'Y' : 'IES'}
            </Text>
          </View>
          <ScrollView
            scrollEnabled={false}
            style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            {entries.map((entry, index) => {
              const isLast = index === entries.length - 1;
              return (
                <View
                  key={entry.id}
                  style={[
                    styles.entryRow,
                    !isLast && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                  ]}
                >
                  <View style={[styles.entryIcon, { backgroundColor: colors.surfaceAlt }]}>
                    <Ionicons
                      name={ACTIVITY_ICONS[entry.type] as any}
                      size={16}
                      color={colors.textPrimary}
                    />
                  </View>
                  <View style={styles.entryBody}>
                    <View style={styles.entryHeader}>
                      <Text style={[styles.entryLabel, { color: colors.textPrimary }]} numberOfLines={1}>
                        {ACTIVITY_LABELS[entry.type]}
                      </Text>
                      <Text style={[styles.entryTime, { color: colors.textMuted }]}>
                        {formatDate(entry.timestamp)}
                      </Text>
                    </View>
                    {entry.agent ? (
                      <Text style={[styles.entryAgent, { color: colors.textSecondary }]} numberOfLines={1}>
                        {entry.agent}
                        {entry.runtime ? ` · ${entry.runtime}` : ''}
                      </Text>
                    ) : null}
                    <Text style={[styles.entrySummary, { color: colors.textSecondary }]} numberOfLines={3}>
                      {entry.summary}
                    </Text>
                    <View style={styles.entryMeta}>
                      <View style={[styles.resultBadge, { backgroundColor: withAlpha(resultColor(entry.resultStatus), 0.14) }]}>
                        <View style={[styles.resultDot, { backgroundColor: resultColor(entry.resultStatus) }]} />
                        <Text style={[styles.resultText, { color: resultColor(entry.resultStatus) }]}>
                          {entry.resultStatus}
                        </Text>
                      </View>
                      {entry.capability ? (
                        <Text style={[styles.capabilityText, { color: colors.textMuted }]} numberOfLines={1}>
                          {entry.capability}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}
    </FlagshipScreen>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Approximate alpha blend for badge backgrounds (hex + alpha percentage). */
function withAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    loadingWrap: {
      paddingVertical: Space.xl,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyWrap: {
      alignItems: 'center',
      paddingVertical: Space.xxl,
      paddingHorizontal: Space.lg,
    },
    emptyIcon: {
      width: Space.xxl,
      height: Space.xxl,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: Space.md,
    },
    emptyTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.subtitle.letterSpacing,
      marginBottom: Space.xs,
    },
    emptyBody: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.caption.lineHeight + 2,
      letterSpacing: Type.caption.letterSpacing,
      textAlign: 'center',
    },
    sectionLabelWrap: {
      paddingBottom: Space.sm,
    },
    sectionLabel: {
      fontSize: Type.label.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.label.letterSpacing,
      textTransform: 'uppercase',
    },
    listCard: {
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
    },
    entryRow: {
      flexDirection: 'row',
      gap: Space.sm,
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
    },
    entryIcon: {
      width: Control.chrome,
      height: Control.chrome,
      borderRadius: Radius.md,
      justifyContent: 'center',
      alignItems: 'center',
      flexShrink: 0,
    },
    entryBody: {
      flex: 1,
      minWidth: 0,
      gap: Space.xs / 2,
    },
    entryHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: Space.sm,
    },
    entryLabel: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
      flex: 1,
      minWidth: 0,
    },
    entryTime: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.meta.letterSpacing,
      flexShrink: 0,
    },
    entryAgent: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
      letterSpacing: Type.caption.letterSpacing,
    },
    entrySummary: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.regular,
      lineHeight: Type.caption.lineHeight,
      letterSpacing: Type.caption.letterSpacing,
    },
    entryMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginTop: Space.xs / 2,
    },
    resultBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs / 2,
      borderRadius: Radius.full,
      flexShrink: 0,
    },
    resultDot: {
      width: Space.xs,
      height: Space.xs,
      borderRadius: Radius.full,
    },
    resultText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.meta.letterSpacing,
      textTransform: 'capitalize',
    },
    capabilityText: {
      fontSize: Type.meta.size,
      fontFamily: Typography.family.regular,
      letterSpacing: Type.meta.letterSpacing,
      flex: 1,
      minWidth: 0,
    },
    clearBtn: {
      fontSize: Type.bodyStrong.size,
      fontFamily: Typography.family.semibold,
      letterSpacing: Type.body.letterSpacing,
      paddingHorizontal: Space.xs,
    },
  });
}
