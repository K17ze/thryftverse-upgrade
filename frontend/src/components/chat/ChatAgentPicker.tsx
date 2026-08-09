/**
 * ChatAgentPicker — bottom sheet for selecting an AI agent to deploy into a
 * conversation. Mirrors the ChatActionSheet presentation pattern (Modal,
 * fade, bottom-anchored sheet) so the chat surface stays consistent.
 *
 * All agents are demo-mode (AGENTS.md §11) — a subtle indicator at the
 * bottom makes that truthful to the user.
 */
import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, TypeStyles } from '../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import {
  getAvailableAgents,
  type ChatAgent,
} from '../../services/chatAgentsApi';

interface ChatAgentPickerProps {
  visible: boolean;
  onClose: () => void;
  onDeploy: (agent: ChatAgent) => void;
  /** Ids already deployed — rendered as "Added" (disabled) state. */
  deployedAgentIds?: string[];
}

export function ChatAgentPicker({
  visible,
  onClose,
  onDeploy,
  deployedAgentIds = [],
}: ChatAgentPickerProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const agents = useMemo(() => getAvailableAgents(), []);
  const deployedSet = useMemo(
    () => new Set(deployedAgentIds),
    [deployedAgentIds],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface }]}
          onPress={(e) => e.stopPropagation()}
          accessibilityLabel="Add AI Agent sheet"
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Add AI Agent
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Connect an assistant to help in this chat
            </Text>
          </View>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {agents.map((agent) => {
              const isDeployed = deployedSet.has(agent.id);
              return (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  deployed={isDeployed}
                  onAdd={() => onDeploy(agent)}
                />
              );
            })}
          </ScrollView>

          <View style={[styles.demoFooter, { borderColor: colors.borderSubtle }]}>
            <Ionicons name="flask-outline" size={13} color={colors.textMuted} />
            <Text style={[styles.demoText, { color: colors.textMuted }]}>
              Demo mode — agents suggest mock replies
            </Text>
          </View>

          <Pressable
            style={[styles.cancelBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={[styles.cancelText, { color: colors.textPrimary }]}>
              Cancel
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function AgentRow({
  agent,
  deployed,
  onAdd,
}: {
  agent: ChatAgent;
  deployed: boolean;
  onAdd: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.row, { backgroundColor: colors.surfaceAlt }]}>
      <View style={[styles.iconCircle, { backgroundColor: `${colors.brand}14` }]}>
        <Ionicons name={agent.avatar as keyof typeof Ionicons.glyphMap} size={22} color={colors.brand} />
      </View>

      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: colors.textPrimary }]} numberOfLines={1}>
          {agent.name}
        </Text>
        <Text style={[styles.rowDescription, { color: colors.textMuted }]} numberOfLines={2}>
          {agent.description}
        </Text>

        <View style={styles.capabilities}>
          {agent.capabilities.map((capability) => (
            <View
              key={capability}
              style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
            >
              <Text style={[styles.chipText, { color: colors.textSecondary }]} numberOfLines={1}>
                {capability}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <AnimatedPressable
        style={[
          styles.addBtn,
          { backgroundColor: deployed ? colors.surface : colors.brand },
        ]}
        onPress={onAdd}
        disabled={deployed}
        activeOpacity={0.7}
        scaleValue={deployed ? 1 : 0.94}
        hapticFeedback={deployed ? undefined : 'light'}
        accessibilityRole="button"
        accessibilityLabel={deployed ? `${agent.name} already added` : `Add ${agent.name} agent`}
        accessibilityHint={agent.description}
        accessibilityState={deployed ? { disabled: true } : undefined}
      >
        <Text
          style={[
            styles.addBtnText,
            { color: deployed ? colors.textMuted : colors.textInverse },
          ]}
        >
          {deployed ? 'Added' : 'Add'}
        </Text>
      </AnimatedPressable>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    sheet: {
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.xxl,
      gap: Space.md,
      maxHeight: '85%',
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: Radius.full,
      alignSelf: 'center',
      marginBottom: Space.sm,
    },
    header: {
      marginBottom: Space.xs,
    },
    title: {
      fontSize: Type.subtitle.size,
      lineHeight: Type.subtitle.lineHeight,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      letterSpacing: Type.subtitle.letterSpacing,
    },
    subtitle: {
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight,
      fontFamily: TypeStyles.body.fontFamily,
      marginTop: 2,
    },
    list: {
      flexGrow: 0,
    },
    listContent: {
      gap: Space.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.smMd,
      paddingVertical: Space.sm + 2,
      paddingHorizontal: Space.sm + 2,
      borderRadius: Radius.lg,
    },
    iconCircle: {
      width: 44,
      height: 44,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    rowText: {
      flex: 1,
      gap: 2,
    },
    rowLabel: {
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    },
    rowDescription: {
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight,
      fontFamily: TypeStyles.body.fontFamily,
    },
    capabilities: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.xs,
      marginTop: Space.xs,
    },
    chip: {
      paddingHorizontal: Space.sm,
      paddingVertical: 3,
      borderRadius: Radius.full,
      borderWidth: StyleSheet.hairlineWidth,
    },
    chipText: {
      fontSize: Type.meta.size,
      lineHeight: Type.meta.lineHeight,
      fontFamily: TypeStyles.body.fontFamily,
    },
    addBtn: {
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      minWidth: 56,
      minHeight: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    addBtnText: {
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    },
    demoFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingTop: Space.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    demoText: {
      fontSize: Type.meta.size,
      lineHeight: Type.meta.lineHeight,
      fontFamily: TypeStyles.body.fontFamily,
    },
    cancelBtn: {
      borderRadius: Radius.lg,
      paddingVertical: Space.md + 2,
      alignItems: 'center',
      marginTop: Space.sm,
      borderWidth: StyleSheet.hairlineWidth,
      minHeight: 44,
      justifyContent: 'center',
    },
    cancelText: {
      fontSize: Type.body.size,
      lineHeight: Type.body.lineHeight,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    },
  });
