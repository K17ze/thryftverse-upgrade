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
import { Colors } from '../constants/colors';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { EmptyState } from '../components/EmptyState';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AppButton } from '../components/ui/AppButton';
import { ChatCard } from '../components/chat/ChatCard';
import { Space, Radius, Type } from '../theme/designTokens';
import { Meta, Caption, BodyEmphasis } from '../components/ui/Text';
import { useAppTheme } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { Typography } from '../theme/designTokens';

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
  'local-only': Colors.textSecondary,
  'backend-required': Colors.textMuted,
};

export default function BotDirectoryScreen({ navigation }: Props) {
  const { isDark } = useAppTheme();
  const { show } = useToast();
  const haptic = useHaptic();
  const [selectedCategory, setSelectedCategory] = useState<BotCategory>('all');

  const bots = useStore((state) => state.availableChatBots);
  const enabledBotIds = useStore((state) => state.enabledBotIds);
  const toggleEnabledBot = useStore((state) => state.toggleEnabledBot);
  const isBotEnabled = useStore((state) => state.isBotEnabled);

  const filteredBots = useMemo(() => {
    if (selectedCategory === 'all') return bots;
    return bots.filter((b) => b.category === selectedCategory);
  }, [bots, selectedCategory]);

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
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={Colors.background}
      />

      <ScreenHeader
        title="Bot Directory"
        subtitle="Marketplace bots & assistants"
        onBack={() => navigation.goBack()}
      />

      {/* What are bots explanation */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle-outline" size={18} color={Colors.textMuted} />
        <Caption color={Colors.textMuted} style={styles.infoText}>
          Bots are automated assistants that can help moderate, sell, or style in your group chats.
          {' '}{STATUS_LABEL['local-only']} bots work on this device.
          {' '}{STATUS_LABEL['backend-required']} bots need a server connection.
        </Caption>
      </View>

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
              <View key={bot.id}>
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

                  {bot.permissions.length > 0 && (
                    <View style={styles.permissionsRow}>
                      {bot.permissions.slice(0, 2).map((perm) => (
                        <View key={perm} style={styles.permissionPill}>
                          <Caption color={Colors.textSecondary} style={styles.permissionPillText}>
                            {perm}
                          </Caption>
                        </View>
                      ))}
                      {bot.permissions.length > 2 && (
                        <Caption color={Colors.textMuted} style={styles.permissionPillText}>
                          +{bot.permissions.length - 2}
                        </Caption>
                      )}
                    </View>
                  )}

                  <View style={styles.cardActions}>
                    <AnimatedPressable
                      onPress={() => navigation.navigate('BotDetail', { botId: bot.id })}
                      activeOpacity={0.8}
                      scaleValue={0.98}
                      hapticFeedback="light"
                      accessibilityRole="button"
                      accessibilityLabel={`View ${bot.name} details`}
                    >
                      <View style={styles.viewDetailBtn}>
                        <Caption color={Colors.brand} style={styles.viewDetailText}>View details</Caption>
                        <Ionicons name="chevron-forward" size={14} color={Colors.brand} />
                      </View>
                    </AnimatedPressable>

                    <Caption color={Colors.textMuted} style={styles.toggleHint}>
                      {enabled ? 'Enabled in account' : 'Disabled in account'}
                    </Caption>
                  </View>
                </ChatCard>
              </View>
            );
          })}
          <View style={{ height: Space.xl }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: Colors.surfaceAlt,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    borderRadius: Radius.lg,
  },
  infoText: {
    flex: 1,
    lineHeight: 18,
  },
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
  permissionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs,
    marginTop: Space.sm,
  },
  permissionPill: {
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  permissionPillText: {
    fontSize: 11,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Space.sm,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  viewDetailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  viewDetailText: {
    fontFamily: Typography.family.medium,
  },
  toggleHint: {
    fontSize: 11,
  },
});
