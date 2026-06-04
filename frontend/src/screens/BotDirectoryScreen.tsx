import React, { useMemo, useState } from 'react';
import { AnimatedPressable } from '../components/AnimatedPressable';
import {
  StatusBar,
  StyleSheet,
  Text,
  View,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { ActiveTheme, Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { EmptyState } from '../components/EmptyState';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AppButton } from '../components/ui/AppButton';
import { ChatCard } from '../components/chat/ChatCard';
import { Space, Radius, Type } from '../theme/designTokens';
import { Meta, Caption, BodyEmphasis } from '../components/ui/Text';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptic } from '../hooks/useHaptic';
import { Typography } from '../constants/typography';
import { Motion } from '../constants/motion';

type Props = StackScreenProps<RootStackParamList, 'BotDirectory'>;

type BotCategory = 'all' | 'assistant' | 'safety' | 'commerce' | 'moderation' | 'automation' | 'styling';

const CATEGORY_OPTIONS: Array<{ value: BotCategory; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'assistant', label: 'Assistants' },
  { value: 'safety', label: 'Safety' },
  { value: 'commerce', label: 'Commerce' },
  { value: 'moderation', label: 'Moderation' },
  { value: 'automation', label: 'Automation' },
  { value: 'styling', label: 'Styling' },
];

const STATUS_LABEL: Record<string, string> = {
  available: 'Available',
  'local-only': 'Local-only',
  'backend-required': 'Backend required',
};

const STATUS_COLOR: Record<string, string> = {
  available: Colors.brand,
  'local-only': '#F59E0B',
  'backend-required': Colors.textMuted,
};

export default function BotDirectoryScreen({ navigation }: Props) {
  const { show } = useToast();
  const haptic = useHaptic();
  const reducedMotionEnabled = useReducedMotion();
  const [selectedCategory, setSelectedCategory] = useState<BotCategory>('all');
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);

  const bots = useStore((state) => state.availableChatBots);
  const enabledBotIds = useStore((state) => state.enabledBotIds);
  const toggleEnabledBot = useStore((state) => state.toggleEnabledBot);
  const isBotEnabled = useStore((state) => state.isBotEnabled);

  const filteredBots = useMemo(() => {
    if (selectedCategory === 'all') return bots;
    return bots.filter((b) => b.category === selectedCategory);
  }, [bots, selectedCategory]);

  const selectedBot = useMemo(
    () => bots.find((b) => b.id === selectedBotId) ?? null,
    [bots, selectedBotId]
  );

  const handleToggle = (botId: string) => {
    haptic.medium();
    toggleEnabledBot(botId);
    const nowEnabled = !isBotEnabled(botId);
    show(
      nowEnabled ? 'Bot enabled in your account' : 'Bot disabled',
      nowEnabled ? 'success' : 'info'
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar
        barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={Colors.background}
      />

      <ScreenHeader
        title="Bot Directory"
        subtitle="Marketplace bots & assistants"
        onBack={() => navigation.goBack()}
      />

      {/* Category filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryStrip}
        keyboardShouldPersistTaps="handled"
      >
        {CATEGORY_OPTIONS.map((cat) => {
          const active = selectedCategory === cat.value;
          return (
            <AnimatedPressable
              key={cat.value}
              onPress={() => setSelectedCategory(cat.value)}
              activeOpacity={0.8}
              scaleValue={0.96}
              hapticFeedback="light"
            >
              <View
                style={[
                  styles.categoryPill,
                  active && styles.categoryPillActive,
                ]}
              >
                <Text
                  style={[
                    styles.categoryText,
                    active && styles.categoryTextActive,
                  ]}
                >
                  {cat.label}
                </Text>
              </View>
            </AnimatedPressable>
          );
        })}
      </ScrollView>

      {filteredBots.length === 0 ? (
        <EmptyState
          icon="hardware-chip-outline"
          title="No bots in this category"
          subtitle="Try another filter or check back later."
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          {filteredBots.map((bot, index) => {
            const enabled = isBotEnabled(bot.id);
            return (
              <Reanimated.View
                key={bot.id}
                entering={
                  reducedMotionEnabled
                    ? undefined
                    : FadeInDown
                      .delay(Math.min(index, Motion.list.maxStaggerItems) * Motion.list.staggerStep)
                      .duration(Motion.list.enterDuration)
                }
              >
                <ChatCard variant="surface" style={styles.botCard}>
                  <View style={styles.botHeadRow}>
                    <View style={styles.botIconWrap}>
                      <Ionicons
                        name={
                          bot.category === 'moderation'
                            ? 'shield-checkmark-outline'
                            : bot.category === 'commerce'
                              ? 'trending-up-outline'
                              : bot.category === 'safety'
                                ? 'warning-outline'
                                : bot.category === 'styling'
                                  ? 'color-wand-outline'
                                  : 'flash-outline'
                        }
                        size={20}
                        color={Colors.textPrimary}
                      />
                    </View>

                    <View style={styles.botTextWrap}>
                      <BodyEmphasis>{bot.name}</BodyEmphasis>
                      <View style={styles.metaRow}>
                        <Caption
                          color={STATUS_COLOR[bot.status] ?? Colors.textMuted}
                          style={styles.statusLabel}
                        >
                          {STATUS_LABEL[bot.status] ?? bot.status}
                        </Caption>
                        <Caption color={Colors.textMuted}>
                          {bot.category.toUpperCase()}
                        </Caption>
                      </View>
                    </View>

                    <AppButton
                      style={[styles.enableBtn, enabled && styles.enableBtnActive]}
                      variant={enabled ? 'primary' : 'secondary'}
                      size="sm"
                      title={enabled ? 'On' : 'Off'}
                      onPress={() => handleToggle(bot.id)}
                      accessibilityLabel={enabled ? 'Disable bot' : 'Enable bot'}
                    />
                  </View>

                  <Caption color={Colors.textSecondary} style={styles.botDescription}>
                    {bot.description}
                  </Caption>

                  <AnimatedPressable
                    onPress={() => setSelectedBotId(selectedBotId === bot.id ? null : bot.id)}
                    activeOpacity={0.8}
                    scaleValue={0.98}
                  >
                    <View style={styles.detailToggle}>
                      <Caption color={Colors.brand} style={styles.detailToggleText}>
                        {selectedBotId === bot.id ? 'Hide details' : 'View details'}
                      </Caption>
                      <Ionicons
                        name={selectedBotId === bot.id ? 'chevron-up' : 'chevron-down'}
                        size={14}
                        color={Colors.brand}
                      />
                    </View>
                  </AnimatedPressable>

                  {selectedBotId === bot.id && selectedBot && (
                    <View style={styles.detailPanel}>
                      <DetailRow icon="key-outline" label="Permissions" value={bot.permissions.join(', ')} />
                      <DetailRow icon="terminal-outline" label="Command" value={bot.commandHint} />
                      <DetailRow
                        icon="server-outline"
                        label="Backend"
                        value={
                          bot.status === 'available'
                            ? 'Connected'
                            : bot.status === 'local-only'
                              ? 'Local-only (no backend)'
                              : 'Requires backend connection'
                        }
                      />
                      <View style={styles.safetyNote}>
                        <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
                        <Caption color={Colors.textMuted} style={styles.safetyNoteText}>
                          Bots can be disabled at any time in Chat Settings.
                        </Caption>
                      </View>
                    </View>
                  )}
                </ChatCard>
              </Reanimated.View>
            );
          })}
          <View style={{ height: Space.xl }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function DetailRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={14} color={Colors.textMuted} style={styles.detailIcon} />
      <Caption color={Colors.textSecondary} style={styles.detailLabel}>{label}</Caption>
      <Caption color={Colors.textPrimary} style={styles.detailValue} numberOfLines={2}>{value}</Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  categoryStrip: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: Space.sm,
  },
  categoryPill: {
    paddingVertical: Space.sm - 2,
    paddingHorizontal: Space.md,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
  },
  categoryPillActive: {
    backgroundColor: Colors.brand,
  },
  categoryText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },
  categoryTextActive: {
    color: Colors.textInverse,
    fontFamily: Typography.family.semibold,
  },
  listContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    gap: Space.sm + 2,
  },
  botCard: {
    padding: Space.md,
  },
  botHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 2,
  },
  botIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  botTextWrap: { flex: 1 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: 2,
  },
  statusLabel: {
    fontFamily: Typography.family.semibold,
  },
  enableBtn: {
    minWidth: 56,
    height: 32,
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm + 4,
  },
  enableBtnActive: {
    borderColor: Colors.brand,
    backgroundColor: Colors.brand,
  },
  botDescription: {
    marginTop: Space.sm + 4,
    lineHeight: 19,
  },
  detailToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.sm,
    alignSelf: 'flex-start',
  },
  detailToggleText: {
    fontFamily: Typography.family.medium,
  },
  detailPanel: {
    marginTop: Space.md,
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    gap: Space.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  detailIcon: {
    width: 18,
  },
  detailLabel: {
    width: 80,
  },
  detailValue: {
    flex: 1,
    textAlign: 'right',
  },
  safetyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.sm,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  safetyNoteText: {
    flex: 1,
    lineHeight: 16,
  },
});
