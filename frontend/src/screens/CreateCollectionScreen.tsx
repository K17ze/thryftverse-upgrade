import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme } from '../theme/ThemeContext';
import { Colors } from '../constants/colors';
import { Space, Radius, Type, Typography, Elevation } from '../theme/designTokens';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { useHaptic } from '../hooks/useHaptic';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { useReducedMotion } from '../hooks/useReducedMotion';

type NavT = StackNavigationProp<RootStackParamList>;

export default function CreateCollectionScreen() {
  const navigation = useNavigation<NavT>();
  const { isDark } = useAppTheme();
  const { show } = useToast();
  const haptic = useHaptic();
  const createCollectionOnApi = useStore((state) => state.createCollectionOnApi);
  const reducedMotionEnabled = useReducedMotion();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = name.trim().length > 0 && !isSubmitting;

  const handleCreate = useCallback(async () => {
    if (!canSubmit) return;
    haptic.medium();
    setIsSubmitting(true);

    try {
      const trimmed = name.trim();
      const newId = await createCollectionOnApi(trimmed, description.trim() || undefined, isPrivate);
      show('Collection created', 'success');
      setIsSubmitting(false);
      navigation.replace('CollectionDetail', { collectionId: newId });
    } catch {
      setIsSubmitting(false);
      show('Unable to create collection. Please check your connection and try again.', 'error');
    }
  }, [canSubmit, haptic, name, description, isPrivate, createCollectionOnApi, show, navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScreenHeader
        title="New Collection"
        onBack={() => navigation.goBack()}
        rightAction={
          <AnimatedPressable
            onPress={handleCreate}
            disabled={!canSubmit}
            activeOpacity={0.7}
            scaleValue={0.95}
            hapticFeedback="light"
            accessibilityLabel="Create collection"
            accessibilityRole="button"
          >
            <Text style={[styles.headerAction, !canSubmit && styles.headerActionDisabled]}>
              Create
            </Text>
          </AnimatedPressable>
        }
      />

      <KeyboardAwareScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(40)} style={styles.card}>
          <Text style={styles.label}>Name</Text>
          <AppInput
            value={name}
            onChangeText={setName}
            placeholder="Collection name"
            autoFocus
            maxLength={40}
            accessibilityLabel="Collection name input"
          />
          <Text style={styles.charCount}>{name.length}/40</Text>
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(80)} style={styles.card}>
          <Text style={styles.label}>Description</Text>
          <AppInput
            value={description}
            onChangeText={setDescription}
            placeholder="Describe your collection"
            multiline
            maxLength={200}
            inputContainerStyle={styles.textArea}
            accessibilityLabel="Collection description input"
          />
          <Text style={styles.charCount}>{description.length}/200</Text>
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(120)} style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleIconWrap}>
              <Ionicons name={isPrivate ? 'lock-closed-outline' : 'lock-open-outline'} size={20} color={Colors.textSecondary} />
            </View>
            <View style={styles.toggleText}>
              <Text style={styles.toggleLabel}>Private collection</Text>
              <Text style={styles.toggleSub}>Only you can see this collection</Text>
            </View>
            <AnimatedPressable
              onPress={() => {
                haptic.light();
                setIsPrivate((v) => !v);
              }}
              activeOpacity={0.7}
              scaleValue={0.92}
              accessibilityLabel="Toggle private collection"
              accessibilityRole="switch"
              accessibilityState={{ checked: isPrivate }}
            >
              <View style={[styles.togglePill, isPrivate && styles.togglePillActive]}>
                <View style={[styles.toggleKnob, isPrivate && styles.toggleKnobActive]} />
              </View>
            </AnimatedPressable>
          </View>
        </Reanimated.View>

        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(160)} style={styles.footer}>
          <AppButton
            title={isSubmitting ? 'Creating...' : 'Create Collection'}
            onPress={handleCreate}
            disabled={!canSubmit}
            variant="primary"
            size="lg"
            style={[!canSubmit && styles.btnDisabled]}
            hapticFeedback="medium"
            accessibilityLabel="Create collection"
          />
        </Reanimated.View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: Space.md,
  },
  contentContainer: {
    paddingTop: Space.md,
    paddingBottom: Space.xl,
    gap: Space.md,
  },
  headerAction: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
  },
  headerActionDisabled: {
    color: Colors.textMuted,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    ...Elevation.subtle,
  },
  label: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: Space.sm,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'right',
    marginTop: Space.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm + 4,
  },
  toggleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleText: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    letterSpacing: Type.body.letterSpacing,
  },
  toggleSub: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 2,
    letterSpacing: Type.caption.letterSpacing,
  },
  togglePill: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  togglePillActive: {
    backgroundColor: Colors.textPrimary,
    borderColor: Colors.textPrimary,
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.background,
    ...Elevation.card,
  },
  toggleKnobActive: {
    alignSelf: 'flex-end',
  },
  footer: {
    marginTop: 'auto',
  },
  btnDisabled: {
    opacity: 0.45,
  },
});