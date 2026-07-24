import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AgentIcon } from '../components/agents/AgentIcon';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { Space, Type, Typography } from '../theme/designTokens';
import { useAppTheme } from '../theme/ThemeContext';

type Props = StackScreenProps<RootStackParamList, 'BotDirectory'>;
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
  const { isDark } = useAppTheme();
  const [selectedCategory, setSelectedCategory] = useState<AgentCategory>('all');
  const systemAgents = useStore((state) => state.availableChatBots);
  const customAgents = useStore((state) => state.customBots);
  const loadBotsFromApi = useStore((state) => state.loadBotsFromApi);

  useEffect(() => {
    void loadBotsFromApi();
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={Colors.background}
      />
      <ScreenHeader
        title="Agents"
        subtitle="Specialists for your group conversations"
        onBack={() => navigation.goBack()}
        rightAction={
          <AnimatedPressable
            onPress={() => navigation.navigate('BotBuilder', {})}
            style={styles.headerAction}
            scaleValue={0.92}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Create an AI agent"
          >
            <Ionicons name="add" size={23} color={Colors.textPrimary} />
          </AnimatedPressable>
        }
      />

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
            <Ionicons name="person-outline" size={21} color={Colors.textPrimary} />
          </View>
          <View style={styles.yourAgentsCopy}>
            <Text style={styles.yourAgentsTitle}>Your agents</Text>
            <Text style={styles.yourAgentsDetail} numberOfLines={2}>
              {publishedCount > 0
                ? `${publishedCount} published · create, tune, and review access`
                : 'Create a private agent with its own instructions and voice'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={19} color={Colors.textMuted} />
        </AnimatedPressable>

        <View style={styles.sectionIntro}>
          <Text style={styles.sectionTitle}>ThryftVerse agents</Text>
          <Text style={styles.sectionDetail}>Built-in help for common chat workflows.</Text>
        </View>

        <View style={styles.filterBackground}>
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
                  style={[styles.filter, selected && styles.filterSelected]}
                  scaleValue={0.98}
                  hapticFeedback="selection"
                  accessibilityRole="tab"
                  accessibilityLabel={category.label}
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.filterText, selected && styles.filterTextSelected]}>
                    {category.label}
                  </Text>
                </AnimatedPressable>
              );
            })}
          </ScrollView>
        </View>

        {filteredAgents.length === 0 ? (
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
                      size={21}
                      color={Colors.textPrimary}
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
                  <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                </AnimatedPressable>
                {index < filteredAgents.length - 1 ? <View style={styles.divider} /> : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingBottom: Space.xxl,
  },
  headerAction: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yourAgents: {
    minHeight: 82,
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  leadingIcon: {
    width: 32,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yourAgentsCopy: {
    flex: 1,
    gap: 3,
  },
  yourAgentsTitle: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.subtitle.size,
  },
  yourAgentsDetail: {
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    lineHeight: 17,
  },
  sectionIntro: {
    paddingHorizontal: Space.md,
    paddingTop: Space.xl,
    paddingBottom: Space.sm,
  },
  sectionTitle: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.subtitle.size,
  },
  sectionDetail: {
    marginTop: 2,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
  },
  filterBackground: {
    backgroundColor: Colors.background,
  },
  filters: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    gap: 9,
  },
  filter: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  filterSelected: {
    borderBottomColor: Colors.textPrimary,
  },
  filterText: {
    color: Colors.textMuted,
    fontFamily: Typography.family.medium,
    fontSize: Type.captionElevated.size,
  },
  filterTextSelected: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
  },
  list: {
    paddingHorizontal: Space.md,
  },
  agentRow: {
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  agentCopy: {
    flex: 1,
    gap: 4,
  },
  agentName: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyEmphasis.size,
  },
  agentDescription: {
    color: Colors.textSecondary,
    fontFamily: Typography.family.regular,
    fontSize: Type.captionElevated.size,
    lineHeight: 18,
  },
  agentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    overflow: 'hidden',
  },
  categoryText: {
    color: Colors.textMuted,
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
    textTransform: 'capitalize',
  },
  agentMetaText: {
    flexShrink: 1,
    color: Colors.textMuted,
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
  },
  statusText: {
    flexShrink: 0,
    color: Colors.textMuted,
    fontFamily: Typography.family.medium,
    fontSize: Type.caption.size,
  },
  metaDot: {
    color: Colors.textMuted,
    fontSize: Type.caption.size,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginLeft: 44,
  },
});
