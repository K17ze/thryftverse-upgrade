import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { useHaptic } from '../../hooks/useHaptic';
import { useAppTranslation } from '../../i18n/useAppTranslation';
import type { ChatBot } from '../../domain';
import { AgentIcon } from './AgentIcon';
import { SecondaryButton } from './AgentStudioButtons';
import type { AgentStudioStyles } from './agentStudioStyles';

/** Minimal structural view of the store's botVersions map — the list only
 *  reads `versionNumber` to render the last published version. */
type BotVersionsMap = Record<string, Array<{ versionNumber: number }>>;

/**
 * "Your agents" tab — flat list of custom bots, tap to open detail, plus the
 * create-agent action and agent-management quick actions (pause all,
 * activity ledger).
 */
export function AgentStudioAgentsSection({
  loading,
  customBots,
  botVersions,
  activeAgentSessions,
  onPauseAll,
  loadError,
  stale,
  onRetry,
  navigation,
  styles }: {
  loading: boolean;
  customBots: ChatBot[];
  botVersions: BotVersionsMap;
  activeAgentSessions: number;
  onPauseAll: () => void;
  /** Non-null when the bots fetch failed before any data loaded — the
   *  section must show this instead of a confirmed-empty state. */
  loadError?: string | null;
  /** True when the list shows previously loaded data whose last refresh
   *  failed — renders a quiet "may be out of date" marker in place. */
  stale?: boolean;
  /** Retries only the bots resource. */
  onRetry?: () => void;
  navigation: NativeStackScreenProps<RootStackParamList, 'AIAgentIntegration'>['navigation'];
  styles: AgentStudioStyles;
}) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const { t } = useAppTranslation('aiAgent');

  const getLastPublishedVersion = (botId: string): number | null => {
    const versions = botVersions[botId];
    if (!versions || versions.length === 0) return null;
    return versions[0].versionNumber;
  };

  return (
    <>
      <View style={styles.sectionLabelWrap}>
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{t('sections.yourAgents')}</Text>
      </View>

      {/* Stale marker — the overview issue row sits above the tab strip, so
          the list itself also labels last-refresh-failed data (audit F17). */}
      {stale && !loading ? (
        <View style={styles.staleMarker}>
          <Text style={[styles.flatRowCaveat, { color: colors.warningText, marginTop: 0 }]}>
            {t('status.resourceStale', { resource: t('status.resources.agents') })}
          </Text>
          {onRetry ? (
            <Pressable
              style={({ pressed }) => [styles.pendingAction, { marginTop: 0, opacity: pressed ? 0.6 : 1 }]}
              onPress={onRetry}
              accessibilityRole="button"
              accessibilityLabel={t('status.retryResource', { resource: t('status.resources.agents') })}
            >
              <Text style={[styles.pendingActionText, { color: colors.warningText }]}>
                {t('status.retryResource', { resource: t('status.resources.agents') })}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Agents flat list */}
      {loading ? (
        <View style={styles.agentListSkeleton}>
          {[0, 1].map((i) => (
            <View key={i} style={styles.skeletonRow}>
              <View style={[styles.skeletonIcon, { backgroundColor: colors.surfaceAlt }]} />
              <View style={styles.skeletonCopy}>
                <View style={[styles.skeletonLine, { width: '45%', backgroundColor: colors.surfaceAlt }]} />
                <View style={[styles.skeletonLine, { width: '65%', marginTop: Space.xs, backgroundColor: colors.surfaceAlt }]} />
              </View>
            </View>
          ))}
        </View>
      ) : customBots.length === 0 && loadError ? (
        <View style={styles.emptyAgents}>
          <Text style={[styles.emptyText, { color: colors.warningText }]}>
            {t('agents.loadFailed')}
          </Text>
          <Text style={[styles.flatRowCaveat, { color: colors.textSecondary }]}>
            {loadError}
          </Text>
          {onRetry ? (
            <View style={styles.actionRow}>
              <SecondaryButton
                label={t('agents.retry')}
                onPress={onRetry}
                colors={colors}
                styles={styles}
              />
            </View>
          ) : null}
        </View>
      ) : customBots.length === 0 ? (
        <View style={styles.emptyAgents}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {t('agents.empty')}
          </Text>
        </View>
      ) : (
        <View>
          {customBots.map((bot, index) => {
            const isLast = index === customBots.length - 1;
            const statusColor = bot.isDraft
              ? colors.textMuted
              : bot.isDisabled
                ? colors.dangerText
                : bot.runtimeReady === false
                  ? colors.warningText
                  : colors.successText;
            const statusLabel = bot.isDraft
              ? t('agentStatus.draft')
              : bot.isDisabled
                ? t('agentStatus.disabled')
                : bot.runtimeReady === false
                  ? t('agentStatus.setupNeeded')
                  : t('agentStatus.published');
            const runtimeLabel = bot.runtimeMode === 'ai' ? 'AI' : (bot.runtimeMode ?? 'AI');
            const lastVersion = getLastPublishedVersion(bot.id);
            // Purpose first (audit F16): the row answers what the agent does
            // or what it needs before how it is implemented. An unresolved
            // runtime reports its actionable readiness reason; otherwise the
            // contract's own description/command hint carries the purpose.
            const purposeLine = bot.runtimeReady === false && bot.runtimeReadinessReason
              ? bot.runtimeReadinessReason
              : bot.description || bot.commandHint;
            return (
              <React.Fragment key={bot.id}>
                <Pressable
                  style={({ pressed }) => [styles.flatRow, { opacity: pressed ? 0.6 : 1 }]}
                  onPress={() => navigation.navigate('BotDetail', { botId: bot.id })}
                  accessibilityRole="button"
                  accessibilityLabel={t('agents.viewLabel', { name: bot.name, status: statusLabel })}
                >
                  <AgentIcon category={bot.category} name={bot.name} size={20} color={colors.textPrimary} />
                  <View style={styles.flatRowText}>
                    {/* Name and status reflow together: at large text the
                        status wraps beneath a long name instead of pinning
                        it to a single unshrinkable line. */}
                    <View style={styles.agentTitleRow}>
                      <Text style={[styles.agentTitleText, { color: colors.textPrimary }]}>
                        {bot.name}
                      </Text>
                      <Text style={[styles.agentStatusInline, { color: statusColor }]}>
                        {statusLabel}
                      </Text>
                    </View>
                    {purposeLine ? (
                      <Text
                        style={[
                          styles.flatRowSubtitle,
                          { color: bot.runtimeReady === false ? colors.warningText : colors.textSecondary },
                        ]}
                        numberOfLines={2}
                      >
                        {purposeLine}
                      </Text>
                    ) : null}
                    <Text style={[styles.flatRowCaveat, { color: colors.textMuted }]} numberOfLines={1}>
                      {runtimeLabel}
                      {lastVersion !== null ? ` · v${lastVersion}` : ''}
                    </Text>
                  </View>
                  <AppIcon name="forward" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
                </Pressable>
                {!isLast ? (
                  <View style={[styles.flatRowSeparator, { backgroundColor: colors.border }]} />
                ) : null}
              </React.Fragment>
            );
          })}
        </View>
      )}

      {/* Create agent — flat text button */}
      <Pressable
        style={({ pressed }) => [styles.createAgentBtn, { opacity: pressed ? 0.6 : 1 }]}
        onPress={() => {
          haptic.light();
          navigation.navigate('BotBuilder', {});
        }}
        accessibilityRole="button"
        accessibilityLabel="Create agent"
      >
        <AppIcon name="plus" size={IconSize.sm} color="brand" opticalCenter accessible={false} />
        <Text style={[styles.createAgentText, { color: colors.brand }]}>{t('agents.create')}</Text>
      </Pressable>

      {/* Agent management quick actions — flat rows */}
      <Pressable
        style={({ pressed }) => [styles.flatRow, { opacity: pressed ? 0.6 : 1 }]}
        onPress={onPauseAll}
        disabled={activeAgentSessions === 0}
        accessibilityState={{ disabled: activeAgentSessions === 0 }}
        accessibilityRole="button"
        accessibilityLabel={
          activeAgentSessions === 0
            ? 'Pause all agents — none running'
            : `Pause all agents — ${activeAgentSessions} running`
        }
      >
        <AppIcon
          name="pause"
          size={IconSize.md}
          color={activeAgentSessions > 0 ? 'dangerText' : 'textMuted'}
          opticalCenter
          accessible={false}
        />
        <View style={styles.flatRowText}>
          <Text
            style={[
              styles.flatRowTitle,
              { color: activeAgentSessions > 0 ? colors.textPrimary : colors.textMuted },
            ]}
          >
            {t('agents.pauseAll')}
          </Text>
          <Text style={[styles.flatRowSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {activeAgentSessions > 0
              ? t('agents.sessionsRunning', { count: activeAgentSessions })
              : t('agents.noSessionsRunning')}
          </Text>
        </View>
        <AppIcon name="forward" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
      </Pressable>
      <View style={[styles.flatRowSeparator, { backgroundColor: colors.border }]} />
      <Pressable
        style={({ pressed }) => [styles.flatRow, { opacity: pressed ? 0.6 : 1 }]}
        onPress={() => navigation.navigate('AgentLedger')}
        accessibilityRole="button"
        accessibilityLabel="View agent activity ledger"
      >
        <AppIcon name="document" size={IconSize.md} color="textPrimary" opticalCenter accessible={false} />
        <View style={styles.flatRowText}>
          <Text style={[styles.flatRowTitle, { color: colors.textPrimary }]}>
            {t('agents.activity')}
          </Text>
          <Text style={[styles.flatRowSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {t('agents.activitySub')}
          </Text>
        </View>
        <AppIcon name="forward" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
      </Pressable>
    </>
  );
}
