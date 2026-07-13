import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useHaptic } from '../hooks/useHaptic';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { Caption, BodyEmphasis, Meta } from '../components/ui/Text';

type Props = StackScreenProps<RootStackParamList, 'BotBuilder'>;

type BotCategory = 'assistant' | 'moderation' | 'commerce' | 'safety' | 'automation';

const CATEGORIES: { value: BotCategory; label: string; icon: string }[] = [
  { value: 'assistant', label: 'Assistant', icon: 'chatbubble-ellipses-outline' },
  { value: 'moderation', label: 'Moderation', icon: 'shield-checkmark-outline' },
  { value: 'commerce', label: 'Commerce', icon: 'trending-up-outline' },
  { value: 'safety', label: 'Safety', icon: 'warning-outline' },
  { value: 'automation', label: 'Automation', icon: 'flash-outline' },
];

const PERMISSION_OPTIONS = [
  { key: 'read_messages', label: 'Read messages' },
  { key: 'reply_in_chat', label: 'Reply in chat' },
  { key: 'moderate_messages', label: 'Moderate messages' },
  { key: 'access_listing_context', label: 'Access listing context' },
  { key: 'access_order_context', label: 'Access order context' },
];

export default function BotBuilderScreen({ navigation, route }: Props) {
  const { botId } = route.params ?? {};
  const { colors, isDark } = useAppTheme();
  const { show } = useToast();
  const haptic = useHaptic();

  const customBots = useStore((state) => state.customBots);
  const createCustomBot = useStore((state) => state.createCustomBot);
  const updateCustomBot = useStore((state) => state.updateCustomBot);

  const existingBot = useMemo(
    () => customBots.find((b) => b.id === botId && b.type === 'custom'),
    [customBots, botId]
  );

  const isEditing = !!existingBot;

  const [name, setName] = useState(existingBot?.name ?? '');
  const [description, setDescription] = useState(existingBot?.description ?? '');
  const [commandHint, setCommandHint] = useState(existingBot?.commandHint ?? '/');
  const [category, setCategory] = useState<BotCategory>(
    (existingBot?.category as BotCategory) ?? 'assistant'
  );
  const [permissions, setPermissions] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    PERMISSION_OPTIONS.forEach((p) => {
      initial[p.key] = existingBot?.permissions.includes(p.key) ?? false;
    });
    return initial;
  });
  const [isDraft, setIsDraft] = useState(existingBot?.isDraft ?? false);
  const [isSaving, setIsSaving] = useState(false);

  const selectedPermissions = PERMISSION_OPTIONS.filter((p) => permissions[p.key]).map((p) => p.key);

  const canSave = name.trim().length > 0 && description.trim().length > 0 && !isSaving;

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    haptic.success();

    const botData = {
      slug: name.toLowerCase().replace(/\s+/g, '-'),
      name: name.trim(),
      description: description.trim(),
      commandHint: commandHint.trim() || '/',
      category: category as any,
      status: 'local-only' as const,
      permissions: selectedPermissions,
      isDraft,
    };

    try {
      if (isEditing && existingBot) {
        await updateCustomBot(existingBot.id, botData);
        show(`${name.trim()} updated`, 'success');
      } else {
        await createCustomBot(botData);
        show(`${name.trim()} created`, 'success');
      }
      navigation.goBack();
    } catch (error) {
      show('Failed to save bot. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const togglePermission = (key: string) => {
    haptic.light();
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScreenHeader
        title={isEditing ? 'Edit Bot' : 'Create Bot'}
        onBack={() => navigation.goBack()}
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Safety notice */}
        <View style={[styles.safetyBanner, { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="warning-outline" size={18} color={colors.textMuted} />
          <Caption color={colors.textMuted} style={styles.safetyText}>
            Custom bots are saved to your account. They become active once deployed to a group chat.
          </Caption>
        </View>

        {/* Bot name */}
        <Section title="BOT NAME">
          <AppInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. My Deal Assistant"
            placeholderTextColor={colors.textMuted}
            maxLength={40}
            accessibilityLabel="Bot name"
          />
        </Section>

        {/* Category */}
        <Section title="CATEGORY">
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((cat) => {
              const active = category === cat.value;
              return (
                <AnimatedPressable
                  key={cat.value}
                  onPress={() => {
                    haptic.light();
                    setCategory(cat.value);
                  }}
                  activeOpacity={0.7}
                  scaleValue={0.96}
                  hapticFeedback="light"
                >
                  <View
                    style={[
                      styles.categoryItem,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                      active && { backgroundColor: colors.brand + '18', borderColor: colors.brand },
                    ]}
                  >
                    <Ionicons
                      name={cat.icon as any}
                      size={18}
                      color={active ? colors.brand : colors.textSecondary}
                    />
                    <Caption color={active ? colors.brand : colors.textSecondary}>
                      {cat.label}
                    </Caption>
                  </View>
                </AnimatedPressable>
              );
            })}
          </View>
        </Section>

        {/* Description */}
        <Section title="DESCRIPTION">
          <AppInput
            value={description}
            onChangeText={setDescription}
            placeholder="What does this bot do?"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            maxLength={200}
            accessibilityLabel="Bot description"
            inputContainerStyle={{ minHeight: 80, alignItems: 'flex-start' }}
          />
          <Caption color={colors.textMuted} style={styles.charCount}>
            {description.length}/200
          </Caption>
        </Section>

        {/* Command hint */}
        <Section title="COMMAND PREFIX">
          <AppInput
            value={commandHint}
            onChangeText={setCommandHint}
            placeholder="e.g. /deal or !help"
            placeholderTextColor={colors.textMuted}
            maxLength={20}
            accessibilityLabel="Command prefix"
          />
        </Section>

        {/* Permissions */}
        <Section title="PERMISSIONS">
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {PERMISSION_OPTIONS.map((perm, index) => (
              <View key={perm.key}>
                <AnimatedPressable
                  onPress={() => togglePermission(perm.key)}
                  activeOpacity={0.7}
                  scaleValue={0.98}
                  hapticFeedback="light"
                  accessibilityRole="checkbox"
                  accessibilityLabel={perm.label}
                  accessibilityState={{ checked: permissions[perm.key] }}
                >
                  <View style={styles.permissionRow}>
                    <BodyEmphasis style={styles.permissionLabel}>{perm.label}</BodyEmphasis>
                    <Ionicons
                      name={permissions[perm.key] ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={permissions[perm.key] ? colors.brand : colors.textMuted}
                    />
                  </View>
                </AnimatedPressable>
                {index < PERMISSION_OPTIONS.length - 1 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
              </View>
            ))}
          </View>
        </Section>

        {/* Draft toggle */}
        <AnimatedPressable
          onPress={() => {
            haptic.light();
            setIsDraft((v) => !v);
          }}
          activeOpacity={0.7}
          scaleValue={0.98}
          hapticFeedback="light"
          accessibilityRole="switch"
          accessibilityLabel="Save as draft"
          accessibilityState={{ checked: isDraft }}
        >
          <View style={[styles.draftRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <BodyEmphasis>Save as draft</BodyEmphasis>
            <Ionicons
              name={isDraft ? 'toggle' : 'toggle-outline'}
              size={28}
              color={isDraft ? colors.brand : colors.textMuted}
            />
          </View>
        </AnimatedPressable>

        {isDraft && (
          <Caption color={colors.textMuted} style={styles.draftHint}>
            Draft bots are not visible to group chat deployments until published.
          </Caption>
        )}

        {/* Save */}
        <AppButton
          title={isEditing ? 'Save changes' : 'Create bot'}
          variant="primary"
          size="md"
          align="center"
          onPress={handleSave}
          disabled={!canSave}
          loading={isSaving}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.section}>
      <Meta color={colors.textMuted} style={styles.sectionLabel}>
        {title}
      </Meta>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xxl,
    gap: Space.lg,
  },
  safetyBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    padding: Space.md,
    borderRadius: Radius.lg,
  },
  safetyText: {
    flex: 1,
    lineHeight: 18,
  },
  section: {
    gap: Space.sm,
  },
  sectionLabel: {
    fontSize: Type.meta.size,
    letterSpacing: Type.meta.letterSpacing,
    marginLeft: Space.xs,
  },
  charCount: {
    textAlign: 'right',
    marginTop: 2,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: 10,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  card: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: 14,
  },
  permissionLabel: {
    fontSize: Type.body.size,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Space.md,
  },
  draftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Space.md,
    paddingVertical: 12,
  },
  draftHint: {
    marginTop: -Space.sm,
    marginLeft: Space.xs,
    lineHeight: 18,
  },
});