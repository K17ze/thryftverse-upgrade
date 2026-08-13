/**
 * SuggestedRepliesBar — horizontal scroll of pill-shaped AI-suggested replies
 * shown above the chat input. Each pill has an icon based on the reply type.
 * The bar uses a neutral visual identity (no sparkles) per AGENTS.md §4.
 *
 * Demo mode is indicated subtly (AGENTS.md §11).
 */
import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius, Type, TypeStyles, Typography } from '../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import type { SuggestedReply, SuggestedReplyType } from '../../services/chatAgentsApi';

interface SuggestedRepliesBarProps {
  suggestions: SuggestedReply[];
  onSelect: (reply: SuggestedReply) => void;
  /** Name of the deployed agent currently suggesting replies. */
  agentName?: string;
  /** Ionicon name for the agent avatar glyph. */
  agentAvatar?: string;
}

const ICON_BY_TYPE: Record<SuggestedReplyType, keyof typeof Ionicons.glyphMap> = {
  question: 'help-circle-outline',
  answer: 'chatbubble-ellipses-outline',
  offer: 'pricetags-outline',
  info: 'information-circle-outline',
};

export function SuggestedRepliesBar({
  suggestions,
  onSelect,
  agentName,
  agentAvatar,
}: SuggestedRepliesBarProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (suggestions.length === 0) return null;

  return (
    <View style={[styles.root, { backgroundColor: colors.background, borderBottomColor: colors.borderSubtle }]}>
      <View style={styles.headerRow}>
        <View style={[styles.agentIcon, { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons
            name={(agentAvatar ?? 'cube-outline') as keyof typeof Ionicons.glyphMap}
            size={12}
            color={colors.textSecondary}
          />
        </View>
        <Text style={[styles.headerLabel, { color: colors.textSecondary }]} numberOfLines={1}>
          {agentName ? `${agentName} suggests` : 'Suggested replies'}
        </Text>
        <View style={[styles.demoBadge, { backgroundColor: colors.surfaceAlt }]}>
          <Text style={[styles.demoBadgeText, { color: colors.textMuted }]}>demo</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        accessibilityLabel="AI suggested replies"
      >
        {suggestions.map((reply, index) => {
          const iconName = ICON_BY_TYPE[reply.type] ?? 'chatbubble-ellipses-outline';
          return (
            <Pressable
              key={`${reply.text}-${index}`}
              style={({ pressed }) => [
                styles.pill,
                { backgroundColor: colors.surface, borderColor: colors.border },
                pressed && { opacity: 0.6 },
              ]}
              onPress={() => onSelect(reply)}
              accessibilityRole="button"
              accessibilityLabel={`Use suggested reply: ${reply.text}`}
              accessibilityHint="Fills the message input with this reply"
            >
              <Ionicons name={iconName} size={13} color={colors.textMuted} />
              <Text style={[styles.pillText, { color: colors.textPrimary }]} numberOfLines={1}>
                {reply.text}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      paddingTop: Space.sm - 1,
      paddingBottom: Space.xs + 1,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs + 1,
      paddingHorizontal: Space.md,
      marginBottom: Space.xs,
    },
    agentIcon: {
      width: 22,
      height: 22,
      borderRadius: Radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    demoBadge: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: Radius.full,
      marginLeft: 'auto',
    },
    demoBadgeText: {
      fontSize: Type.meta.size,
      lineHeight: Type.meta.lineHeight,
      fontFamily: Typography.family.regular,
      letterSpacing: 0.3,
      textTransform: 'lowercase',
    },
    headerLabel: {
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight,
      fontFamily: Typography.family.regular,
      flexShrink: 1,
    },
    scrollContent: {
      paddingHorizontal: Space.md,
      gap: Space.sm - 1,
      paddingVertical: 2,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.sm - 1,
      borderRadius: Radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      minHeight: 34,
    },
    pillText: {
      fontSize: Type.caption.size,
      lineHeight: Type.caption.lineHeight,
      fontFamily: Typography.family.regular,
      maxWidth: 220,
    },
  });
