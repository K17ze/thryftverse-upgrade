import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  StatusBar,
} from 'react-native';
import { StackScreenProps } from '@react-navigation/stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme } from '../theme/ThemeContext';
import { Colors } from '../constants/colors';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { ScreenHeader } from '../components/ui/ScreenHeader';
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

  const backendSupportsEdit = false; // Honest product truth

  if (!conversation || conversation.type !== 'group') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <ScreenHeader title="Edit Group" onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <Caption color={Colors.textMuted}>Group not found</Caption>
        </View>
      </SafeAreaView>
    );
  }

  const handleSave = () => {
    if (!name.trim()) {
      show('Group name is required', 'error');
      return;
    }
    haptic.success();
    setIsSaving(true);

    // Local-only update — no backend
    upsertConversation({
      ...conversation,
      title: name.trim(),
    });

    show('Group name updated locally', 'success');
    setTimeout(() => {
      setIsSaving(false);
      navigation.goBack();
    }, 300);
  };

  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScreenHeader title="Edit Group" onBack={() => navigation.goBack()} />

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

        {/* Backend limitation notice */}
        {!backendSupportsEdit && (
          <View style={styles.limitationBanner}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.textMuted} />
            <Caption color={Colors.textMuted} style={styles.limitationText}>
              Group editing is local-only. Changes are saved on this device but may not sync to other members until backend group management is available.
            </Caption>
          </View>
        )}

        <AppButton
          title={isSaving ? 'Saving...' : 'Save changes'}
          variant="primary"
          size="md"
          align="center"
          onPress={handleSave}
          disabled={isSaving || !name.trim()}
        />
      </ScrollView>
    </SafeAreaView>
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
