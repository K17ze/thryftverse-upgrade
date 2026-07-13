import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { StackScreenProps } from '@react-navigation/stack';
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

type Props = StackScreenProps<RootStackParamList, 'EditCollection'>;

export default function EditCollectionScreen({ navigation, route }: Props) {
  const { collectionId } = route.params;
  const { isDark } = useAppTheme();
  const { show } = useToast();
  const haptic = useHaptic();

  const collections = useStore((state) => state.collections);
  const renameCollection = useStore((state) => state.renameCollection);
  const deleteCollection = useStore((state) => state.deleteCollection);
  const updateCollectionOnApi = useStore((state) => state.updateCollectionOnApi);
  const deleteCollectionOnApi = useStore((state) => state.deleteCollectionOnApi);

  const collection = useMemo(
    () => collections.find((c) => c.id === collectionId),
    [collections, collectionId]
  );

  const [name, setName] = useState(collection?.name ?? '');
  const [description, setDescription] = useState(collection?.description ?? '');
  const [isPrivate, setIsPrivate] = useState(collection?.isPrivate ?? false);
  const [isSaving, setIsSaving] = useState(false);

  const hasChanges =
    name.trim() !== (collection?.name ?? '').trim() ||
    description.trim() !== (collection?.description ?? '').trim() ||
    isPrivate !== (collection?.isPrivate ?? false);

  const canSave = name.trim().length > 0 && hasChanges && !isSaving;

  const handleSave = useCallback(async () => {
    if (!canSave || !collectionId) return;
    haptic.medium();
    setIsSaving(true);

    try {
      await updateCollectionOnApi(collectionId, {
        name: name.trim(),
        description: description.trim() || null,
        isPrivate,
      });
      show('Collection updated', 'success');
      setIsSaving(false);
      navigation.goBack();
    } catch {
      setIsSaving(false);
      show('Unable to update collection. Please check your connection.', 'error');
    }
  }, [canSave, collectionId, haptic, name, description, isPrivate, updateCollectionOnApi, show, navigation]);

  const handleDelete = useCallback(() => {
    haptic.heavy();
    Alert.alert(
      'Delete Collection?',
      `This will permanently delete "${collection?.name}". Items in your Saved will not be affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (collectionId) {
              try {
                await deleteCollectionOnApi(collectionId);
                show('Collection deleted', 'info');
                navigation.navigate('Closet');
              } catch {
                show('Unable to delete collection. Please try again.', 'error');
              }
            }
          },
        },
      ]
    );
  }, [collection, collectionId, deleteCollectionOnApi, haptic, show, navigation]);

  if (!collection) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <ScreenHeader title="Edit Collection" onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <Text style={styles.emptyText}>Collection not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScreenHeader
        title="Edit Collection"
        onBack={() => navigation.goBack()}
        rightAction={
          <AnimatedPressable
            onPress={handleSave}
            disabled={!canSave}
            activeOpacity={0.7}
            scaleValue={0.95}
            hapticFeedback="light"
            accessibilityLabel="Save changes"
            accessibilityRole="button"
          >
            <Text style={[styles.headerAction, !canSave && styles.headerActionDisabled]}>
              Save
            </Text>
          </AnimatedPressable>
        }
      />

      <KeyboardAwareScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
          <Reanimated.View entering={FadeInDown.duration(300).delay(40)} style={styles.card}>
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

          <Reanimated.View entering={FadeInDown.duration(300).delay(80)} style={styles.card}>
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

          <Reanimated.View entering={FadeInDown.duration(300).delay(120)} style={styles.card}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleIconWrap}>
                <Ionicons
                  name={isPrivate ? 'lock-closed-outline' : 'lock-open-outline'}
                  size={20}
                  color={Colors.textSecondary}
                />
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

          <Reanimated.View entering={FadeInDown.duration(300).delay(160)} style={styles.dangerCard}>
            <Text style={styles.dangerLabel}>Danger Zone</Text>
            <AppButton
              title="Delete Collection"
              variant="secondary"
              size="lg"
              icon={<Ionicons name="trash-outline" size={18} color={Colors.danger} />}
              titleStyle={{ color: Colors.danger }}
              style={styles.deleteBtn}
              onPress={handleDelete}
              hapticFeedback="heavy"
              accessibilityLabel="Delete collection"
            />
            <Text style={styles.dangerSub}>
              This action cannot be undone. Your saved items will remain in Saved.
            </Text>
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
  },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.xl,
    gap: Space.md,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
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
    transform: [{ translateX: 20 }],
  },
  dangerCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    ...Elevation.subtle,
    marginTop: Space.md,
  },
  dangerLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: Colors.danger,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: Space.sm,
  },
  deleteBtn: {
    borderColor: Colors.danger,
  },
  dangerSub: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: Space.sm,
    textAlign: 'center',
  },
});