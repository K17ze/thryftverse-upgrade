/**
 * SuggestedRepliesBar — horizontal scroll of pill-shaped AI-suggested replies
 * shown above the chat input. Each pill has an icon based on the reply type.
 * The bar uses a neutral visual identity (no decorative glyphs) per AGENTS.md §4.
 */
import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import type { SuggestedReply, SuggestedReplyType } from '../../services/chatAgentsApi';
import { useAppTranslation } from '../../i18n/useAppTranslation';

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
  offer: 'cash-outline',
  info: 'information-circle-outline' };

export function SuggestedRepliesBar({
  suggestions,
  onSelect,
  agentName }: SuggestedRepliesBarProps) {
  const { colors } = useAppTheme();
  const { t } = useAppTranslation('messaging');
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (suggestions.length === 0) return null;

  return (
    <View style={[styles.root, { backgroundColor: colors.background, borderBottomColor: colors.borderSubtle }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        accessibilityLabel={
          agentName ? t('suggestedReplies.titleFrom', { agentName }) : t('suggestedReplies.title')
        }
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
              hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel={t('suggestedReplies.use', { reply: reply.text })}
              accessibilityHint={t('suggestedReplies.fill')}
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
      borderBottomWidth: StyleSheet.hairlineWidth },
    scrollContent: {
      paddingHorizontal: Space.md,
      gap: Space.sm - 1,
      paddingVertical: 2 },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      borderRadius: Radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      minHeight: 24 },
    pillText: {
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: TypographyV2.meta.fontFamily,
      maxWidth: 220 } });
