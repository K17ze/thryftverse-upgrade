import React, { useMemo, useState } from 'react';
import { updateConversationOnApi } from '../services/chatApi';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useHaptic } from '../hooks/useHaptic';
import { AppButton } from '../components/ui/AppButton';
import { Caption, BodyEmphasis, Meta } from '../components/ui/Text';

type Props = NativeStackScreenProps<RootStackParamList, 'EditGroup'>;

export default function EditGroupScreen({ navigation, route }: Props) {
  const { conversationId } = route.params;
  const { colors, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();

  const conversations = useStore((state) => state.conversations);
  const upsertConversation = useStore((state) => state.upsertConversation);
  const deleteConversation = useStore((state) => state.deleteConversation);

  const conversation = useMemo(
    () => conversations.find((c) => c.id === conversationId),
    [conversations, conversationId]
  );

  const [name, setName] = useState(conversation?.title ?? '');
  const [description, setDescription] = useState(conversation?.description ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const hasChanges = name.trim() !== (conversation?.title ?? '').trim() || description.trim() !== (conversation?.description ?? '').trim();

  if (!conversation || conversation.type !== 'group') {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Edit Group" onBack={() => navigation.goBack()} />} scrollEnabled={false}>
        <View style={styles.center}>
          <Caption color={colors.textMuted}>Group not found</Caption>
        </View>
      </FlagshipScreen>
    );
  }

  const handleSave = async () => {
    if (!name.trim()) {
      show('Group name is required', 'error');
      return;
    }
    haptic.success();
    setIsSaving(true);

    try {
      await updateConversationOnApi(conversationId, { title: name.trim() });
      upsertConversation({
        ...conversation,
        title: name.trim(),
        description: description.trim(),
      });
      show('Group updated', 'success');
      navigation.goBack();
    } catch {
      show('Failed to update group', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    if (hasChanges) {
      Alert.alert(
        'Unsaved changes',
        'Discard your edits?',
        [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  const handleLeaveGroup = () => {
    Alert.alert(
      'Leave group?',
      'This removes the group from your inbox on this device. Rejoin if you receive a new invite.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave group',
          style: 'destructive',
          onPress: () => {
            haptic.heavy();
            deleteConversation(conversationId);
            show('You left the group', 'info');
            navigation.navigate('MainTabs', { screen: 'Inbox' });
          },
        },
      ]
    );
  };

  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <FlagshipScreen header={<FlagshipHeader title="Edit Group" onBack={handleBack} />} scrollEnabled={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Group preview */}
        <View style={styles.identity}>
          <View style={[styles.avatar, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={styles.avatarText}>{initials || 'G'}</Text>
          </View>
          <BodyEmphasis numberOfLines={1}>{name.trim() || 'Untitled group'}</BodyEmphasis>
          <Caption color={colors.textMuted}>
            {conversation.participantIds?.length ?? 0} member{(conversation.participantIds?.length ?? 0) === 1 ? '' : 's'}
          </Caption>
        </View>

        {/* Group name */}
        <Section title="GROUP NAME">
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Group name"
            placeholderTextColor={colors.textMuted}
            maxLength={50}
            accessibilityLabel="Group name"
          />
        </Section>

        {/* Group description */}
        <Section title="DESCRIPTION">
          <TextInput
            style={[styles.input, styles.textarea]}
            value={description}
            onChangeText={setDescription}
            placeholder="What is this group about?"
            placeholderTextColor={colors.textMuted}
            maxLength={120}
            multiline
            numberOfLines={3}
            accessibilityLabel="Group description"
          />
          <Caption color={colors.textMuted} style={styles.charCount}>{description.length}/120</Caption>
        </Section>

        <AppButton
          title={isSaving ? 'Saving...' : 'Save changes'}
          variant="primary"
          size="md"
          align="center"
          onPress={handleSave}
          disabled={isSaving || !name.trim() || !hasChanges}
        />

        {/* Danger zone */}
        <View style={styles.dangerZone}>
          <Meta color={colors.danger} style={styles.dangerLabel}>DANGER ZONE</Meta>
          <AnimatedPressable
            style={styles.dangerRow}
            onPress={handleLeaveGroup}
            activeOpacity={0.7}
            scaleValue={0.98}
            hapticFeedback="medium"
          >
            <Ionicons name="log-out-outline" size={20} color={colors.danger} />
            <Text style={styles.dangerText}>Leave group</Text>
          </AnimatedPressable>
        </View>
      </ScrollView>
    </FlagshipScreen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.section}>
      <Meta color={colors.textMuted} style={styles.sectionLabel}>
        {title}
      </Meta>
      {children}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.xxl,
    gap: Space.lg,
  },
  identity: {
    alignItems: 'center',
    paddingVertical: Space.xl,
    gap: Space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: Radius.xl,
    marginHorizontal: Space.xs,
    backgroundColor: colors.surface,
  },
  avatar: {
    width: Space.xxl + Space.xl,
    height: Space.xxl + Space.xl,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: Type.priceLarge.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
  },
  section: {
    gap: Space.sm,
  },
  sectionLabel: {
    fontSize: Type.meta.size,
    letterSpacing: Type.meta.letterSpacing,
    marginLeft: Space.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md - 2,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: colors.textPrimary,
  },
  textarea: {
    minHeight: Space.xxl + Space.xl,
    textAlignVertical: 'top',
    paddingTop: Space.md - 2,
  },
  charCount: {
    textAlign: 'right',
    marginTop: Space.xs / 2,
  },
  dangerZone: {
    marginTop: Space.lg,
    gap: Space.sm,
  },
  dangerLabel: {
    marginLeft: Space.xs,
  },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md - 2,
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${colors.danger}30`,
  },
  dangerText: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: colors.danger,
  },
  limitationBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    padding: Space.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.lg,
  },
  limitationText: {
    flex: 1,
    lineHeight: Type.captionElevated.lineHeight,
  },
  });
}