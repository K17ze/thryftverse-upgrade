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
  navigation,
  styles }: {
  loading: boolean;
  customBots: ChatBot[];
  botVersions: BotVersionsMap;
  activeAgentSessions: number;
  onPauseAll: () => void;
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
                ? colors.danger
                : bot.runtimeReady === false
                  ? colors.warning
                  : colors.success;
            const statusLabel = bot.isDraft
              ? t('agentStatus.draft')
              : bot.isDisabled
                ? t('agentStatus.disabled')
                : bot.runtimeReady === false
                  ? t('agentStatus.setupNeeded')
                  : t('agentStatus.published');
            const runtimeLabel = bot.runtimeMode === 'ai' ? 'AI' : (bot.runtimeMode ?? 'AI');
            const lastVersion = getLastPublishedVersion(bot.id);
            return (
              <React.Fragment key={bot.id}>
                <Pressable
                  style={({ pressed }) => [styles.flatRow, { opacity: pressed ? 0.6 : 1 }]}
                  onPress={() => navigation.navigate('BotDetail', { botId: bot.id })}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${bot.name}`}
                >
                  <AgentIcon category={bot.category} name={bot.name} size={20} color={colors.textPrimary} />
                  <View style={styles.flatRowText}>
                    <Text style={[styles.flatRowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {bot.name}
                    </Text>
                    <Text style={[styles.flatRowSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                      {runtimeLabel}
                      {lastVersion !== null ? ` · v${lastVersion}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.providerStatus, { color: statusColor }]} numberOfLines={1}>
                    {statusLabel}
                  </Text>
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
          color={activeAgentSessions > 0 ? 'danger' : 'textMuted'}
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
