import React, { useMemo, useState } from 'react';
import { updateConversationOnApi } from '../services/chatApi';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme } from '../theme/ThemeContext';
import { Colors } from '../constants/colors';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useHaptic } from '../hooks/useHaptic';
import { AppButton } from '../components/ui/AppButton';
import { Caption, BodyEmphasis, Meta } from '../components/ui/Text';

type Props = StackScreenProps<RootStackParamList, 'EditGroup'>;

export default function EditGroupScreen({ navigation, route }: Props) {
  const { conversationId } = route.params;
  const { isDark } = useAppTheme();
  const { show } = useToast();
  const haptic = useHaptic();

  const conversations = useStore((state) => state.conversations);
  const upsertConversation = useStore((state) => state.upsertConversation);

  const conversation = useMemo(
    () => conversations.find((c) => c.id === conversationId),
    [conversations, conversationId]
  );

  const [name, setName] = useState(conversation?.title ?? '');
  const [isSaving, setIsSaving] = useState(false);

  if (!conversation || conversation.type !== 'group') {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Edit Group" onBack={() => navigation.goBack()} />} scrollEnabled={false}>
        <View style={styles.center}>
          <Caption color={Colors.textMuted}>Group not found</Caption>
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
      });
      show('Group name updated', 'success');
      navigation.goBack();
    } catch {
      show('Failed to update group name', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <FlagshipScreen header={<FlagshipHeader title="Edit Group" onBack={() => navigation.goBack()} />} scrollEnabled={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Avatar preview */}
        <View style={styles.identity}>
          <View style={[styles.avatar, { backgroundColor: Colors.surfaceAlt }]}>
            <Text style={styles.avatarText}>{initials || 'G'}</Text>
          </View>
          <Caption color={Colors.textMuted}>
            Avatar editing requires backend support.
          </Caption>
        </View>

        {/* Group name */}
        <Section title="GROUP NAME">
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Group name"
            placeholderTextColor={Colors.textMuted}
            maxLength={50}
            accessibilityLabel="Group name"
          />
        </Section>

        <AppButton
          title={isSaving ? 'Saving...' : 'Save changes'}
          variant="primary"
          size="md"
          align="center"
          onPress={handleSave}
          disabled={isSaving || !name.trim()}
        />
      </ScrollView>
    </FlagshipScreen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Meta color={Colors.textMuted} style={styles.sectionLabel}>
        {title}
      </Meta>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 28,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
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
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    paddingHorizontal: Space.md,
    paddingVertical: 14,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
  },
  limitationBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    padding: Space.md,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.lg,
  },
  limitationText: {
    flex: 1,
    lineHeight: 18,
  },
});
