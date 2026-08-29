import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AgentIcon } from '../components/agents/AgentIcon';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { Space, Radius, Typography, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { fetchAiCapability, type AiCapabilitySummary } from '../services/aiTruthApi';

type Props = NativeStackScreenProps<RootStackParamList, 'BotDirectory'>;
type AgentCategory =
  | 'all'
  | 'assistant'
  | 'safety'
  | 'commerce'
  | 'moderation'
  | 'automation'
  | 'styling';

const CATEGORIES: Array<{ value: AgentCategory; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'assistant', label: 'Assist' },
  { value: 'styling', label: 'Style' },
  { value: 'commerce', label: 'Commerce' },
  { value: 'safety', label: 'Safety' },
  { value: 'moderation', label: 'Moderate' },
  { value: 'automation', label: 'Workflow' },
];

export default function BotDirectoryScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [selectedCategory, setSelectedCategory] = useState<AgentCategory>('all');
  const systemAgents = useStore((state) => state.availableChatBots);
  const customAgents = useStore((state) => state.customBots);
  const loadBotsFromApi = useStore((state) => state.loadBotsFromApi);

  // P0-9: Honest AI capability labeling. The header subtitle reflects
  // the actual capability level — "AI specialists" only when a real
  // provider is configured, "Heuristic specialists" on baselines, and
  // "Assistant unavailable" when nothing is wired. The product must
  // never market heuristic baselines as trained ML.
  const [aiCapability, setAiCapability] = useState<AiCapabilitySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    fetchAiCapability().then(setAiCapability).catch(() => undefined);
  }, []);

  useEffect(() => {
    void loadBotsFromApi().finally(() => setIsLoading(false));
  }, [loadBotsFromApi]);

  const publishedCount = customAgents.filter(
    (agent) => !agent.isDraft && !agent.isDisabled
  ).length;
  const filteredAgents = useMemo(
    () =>
      selectedCategory === 'all'
        ? systemAgents
        : systemAgents.filter((agent) => agent.category === selectedCategory),
    [selectedCategory, systemAgents]
  );

  const directorySubtitle = aiCapability
    ? aiCapability.capabilityLevel === 'provider_backed'
      ? 'AI specialists for your group conversations'
      : aiCapability.capabilityLevel === 'heuristic_baseline'
      ? 'Heuristic specialists for your group conversations'
      : 'Assistant unavailable on this deployment'
    : 'Specialists for your group conversations';

  return (
    <FlagshipScreen
      scrollEnabled={false}
      header={
        <FlagshipHeader
          title="Agents"
          subtitle={directorySubtitle}
          onBack={() => navigation.goBack()}
          rightAction={
            <AnimatedPressable
              onPress={() => navigation.navigate('BotBuilder', {})}
              style={styles.headerAction}
              scaleValue={0.92}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel={
                aiCapability?.capabilityLevel === 'provider_backed'
                  ? 'Create an AI agent'
                  : 'Create a specialist agent'
              }
            >
              <Ionicons name="add" size={22} color={colors.textPrimary} />
            </AnimatedPressable>
          }
        />
      }
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        stickyHeaderIndices={[2]}
      >
        <AnimatedPressable
          onPress={() => navigation.navigate('CustomBots')}
          style={styles.yourAgents}
          scaleValue={0.985}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="Open your agents"
        >
          <View style={styles.leadingIcon}>
            <Ionicons name="person-outline" size={24} color={colors.textPrimary} />
          </View>
          <View style={styles.yourAgentsCopy}>
            <Text style={styles.yourAgentsTitle}>Your agents</Text>
            <Text style={styles.yourAgentsDetail} numberOfLines={2}>
              {publishedCount > 0
                ? `${publishedCount} published · create, tune, and review access`
                : 'Create a private agent with its own instructions and voice'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={19} color={colors.textMuted} />
        </AnimatedPressable>

        <View style={styles.sectionIntro}>
          <Text style={styles.sectionTitle}>ThryftVerse agents</Text>
          <Text style={styles.sectionDetail}>Built-in help for common chat workflows.</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {CATEGORIES.map((category) => {
            const selected = selectedCategory === category.value;
            return (
              <AnimatedPressable
                key={category.value}
                onPress={() => setSelectedCategory(category.value)}
                style={[styles.filterChip, selected && styles.filterChipSelected]}
                scaleValue={0.96}
                hapticFeedback="selection"
                accessibilityRole="tab"
                accessibilityLabel={category.label}
                accessibilityState={{ selected }}
              >
                <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
                  {category.label}
                </Text>
              </AnimatedPressable>
            );
          })}
        </ScrollView>

        {isLoading && filteredAgents.length === 0 ? (
          <View style={styles.list}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={styles.skeletonRow}>
                <View style={styles.skeletonIcon} />
                <View style={styles.skeletonCopy}>
                  <View style={styles.skeletonLine} />
                  <View style={[styles.skeletonLine, { width: '70%' }]} />
                </View>
              </View>
            ))}
          </View>
        ) : filteredAgents.length === 0 ? (
          <EmptyState
            icon="chatbubble-ellipses-outline"
            title="No agents here yet"
            subtitle="Choose another specialty."
          />
        ) : (
          <View style={styles.list}>
            {filteredAgents.map((agent, index) => (
              <View key={agent.id}>
                <AnimatedPressable
                  onPress={() => navigation.navigate('BotDetail', { botId: agent.id })}
                  style={styles.agentRow}
                  scaleValue={0.99}
                  hapticFeedback="light"
                  accessibilityRole="button"
                  accessibilityLabel={`View ${agent.name}`}
                >
                  <View style={styles.leadingIcon}>
                    <AgentIcon
                      category={agent.category}
                      name={agent.name}
                      size={24}
                      color={colors.textPrimary}
                    />
                  </View>
                  <View style={styles.agentCopy}>
                    <Text style={styles.agentName} numberOfLines={1}>
                      {agent.name}
                    </Text>
                    <Text style={styles.agentDescription} numberOfLines={2}>
                      {agent.description}
                    </Text>
                    <View style={styles.agentMeta}>
                      <Text style={styles.categoryText}>{agent.category}</Text>
                      <Text style={styles.metaDot}>·</Text>
                      <Text style={styles.agentMetaText} numberOfLines={1}>
                        {agent.commandHint}
                      </Text>
                      <Text style={styles.metaDot}>·</Text>
                      <Text style={styles.statusText}>
                        {agent.status === 'available' ? 'Ready' : 'Setup required'}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </AnimatedPressable>
                {index < filteredAgents.length - 1 ? <View style={styles.divider} /> : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  content: {
    paddingBottom: Space.xxl },
  headerAction: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  yourAgents: {
    minHeight: Space.xxl + Space.xl + 2,
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border },
  leadingIcon: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  yourAgentsCopy: {
    flex: 1,
    gap: Space.xs - 1 },
  yourAgentsTitle: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.sectionTitle.size },
  yourAgentsDetail: {
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 1 },
  sectionIntro: {
    paddingHorizontal: Space.md,
    paddingTop: Space.xl,
    paddingBottom: Space.sm },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.sectionTitle.size },
  sectionDetail: {
    marginTop: Space.xs - 2,
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size },
  filters: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: Space.sm,
    backgroundColor: colors.background },
  filterChip: {
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    justifyContent: 'center',
    alignItems: 'center' },
  filterChipSelected: {
    backgroundColor: colors.brand,
    borderColor: colors.brand },
  filterChipText: {
    color: colors.textSecondary,
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size },
  filterChipTextSelected: {
    color: colors.background,
    fontFamily: Typography.family.semibold },
  list: {
    paddingHorizontal: Space.md },
  agentRow: {
    minHeight: Space.xxl + Space.xxl + Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.smMd },
  agentCopy: {
    flex: 1,
    gap: Space.xs },
  agentName: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size },
  agentDescription: {
    color: colors.textSecondary,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight },
  agentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    overflow: 'hidden' },
  categoryText: {
    color: colors.textMuted,
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size,
    textTransform: 'capitalize' },
  agentMetaText: {
    flexShrink: 1,
    color: colors.textMuted,
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size },
  statusText: {
    flexShrink: 0,
    color: colors.textMuted,
    fontFamily: Typography.family.medium,
    fontSize: TypographyV2.meta.size },
  metaDot: {
    color: colors.textMuted,
    fontSize: TypographyV2.meta.size },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: Control.hit },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.smMd,
    minHeight: Space.xxl + Space.xxl + Space.sm },
  skeletonIcon: {
    width: Control.chromeCompact,
    height: Control.hit,
    borderRadius: Radius.sm,
    backgroundColor: colors.surfaceAlt },
  skeletonCopy: {
    flex: 1,
    gap: Space.xs },
  skeletonLine: {
    height: 12,
    borderRadius: Radius.sm,
    backgroundColor: colors.surfaceAlt } });
}
