import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Elevation, Control, LetterSpacing, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { AppInput } from '../components/ui/AppInput';
import { EmptyState } from '../components/EmptyState';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { useHaptic } from '../hooks/useHaptic';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { useBackendData } from '../context/BackendDataContext';

type Props = NativeStackScreenProps<RootStackParamList, 'EditCollection'>;

export default function EditCollectionScreen({ navigation, route }: Props) {
  const { collectionId } = route.params ?? {};
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();

  const collections = useStore((state) => state.collections);
  const renameCollection = useStore((state) => state.renameCollection);
  const deleteCollection = useStore((state) => state.deleteCollection);
  const updateCollectionOnApi = useStore((state) => state.updateCollectionOnApi);
  const deleteCollectionOnApi = useStore((state) => state.deleteCollectionOnApi);
  const { listings } = useBackendData();

  const collection = useMemo(
    () => collections.find((c) => c.id === collectionId),
    [collections, collectionId]
  );

  const itemCount = useMemo(
    () => collection?.itemIds?.length ?? 0,
    [collection]
  );

  const [name, setName] = useState(collection?.name ?? '');
  const [description, setDescription] = useState(collection?.description ?? '');
  const [isPrivate, setIsPrivate] = useState(collection?.isPrivate ?? false);
  const [isSaving, setIsSaving] = useState(false);

  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    variant: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', onConfirm: () => {}, variant: 'default' });

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
        isPrivate });
      show('Collection updated', 'success');
      setIsSaving(false);
      navigation.goBack();
    } catch {
      setIsSaving(false);
      show('Unable to update collection. Check your connection.', 'error');
    }
  }, [canSave, collectionId, haptic, name, description, isPrivate, updateCollectionOnApi, show, navigation]);

  const handleDelete = useCallback(() => {
    haptic.heavy();
    setConfirmSheet({
      visible: true,
      title: 'Delete Collection?',
      message: `This will permanently delete "${collection?.name}". Items in your Saved will not be affected.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
      onConfirm: async () => {
        if (collectionId) {
          try {
            await deleteCollectionOnApi(collectionId);
            show('Collection deleted', 'info');
            navigation.navigate('Closet');
          } catch {
            show('Unable to delete collection. Try again.', 'error');
          }
        }
      } });
  }, [collection, collectionId, deleteCollectionOnApi, haptic, show, navigation]);

  if (!collection) {
    return (
      <FlagshipScreen
        header={
          <FlagshipHeader
            title="Edit Collection"
            onBack={() => navigation.goBack()}
          />
        }
      >
        <EmptyState
          icon="folder-open-outline"
          title="Collection not found"
          subtitle="This collection may have been deleted."
          ctaLabel="Go back"
          onCtaPress={() => navigation.goBack()}
        />
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
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
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <KeyboardAwareScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
          <View style={styles.card}>
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
          </View>

          <View style={styles.card}>
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
          </View>

          <View style={styles.card}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleIconWrap}>
                <Ionicons
                  name={isPrivate ? 'lock-closed-outline' : 'lock-open-outline'}
                  size={20}
                  color={colors.textSecondary}
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
          </View>

          {/* Manage items link — navigates to ManageCollectionItemsScreen */}
            <AnimatedPressable
              style={styles.manageItemsRow}
              onPress={() => { haptic.light(); navigation.navigate('ManageCollectionItems', { collectionId }); }}
              activeOpacity={0.85}
              hapticFeedback="light"
              accessibilityLabel={`Manage items, ${itemCount} item${itemCount !== 1 ? 's' : ''} in collection`}
              accessibilityRole="button"
            >
              <Ionicons name="list-outline" size={18} color={colors.textSecondary} />
              <View style={styles.manageItemsText}>
                <Text style={styles.manageItemsLabel}>Manage items</Text>
                <Text style={styles.manageItemsSub}>
                  {itemCount} {itemCount === 1 ? 'item' : 'items'} in this collection
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </AnimatedPressable>

          <View style={styles.dangerCard}>
            <Text style={styles.dangerLabel}>Danger Zone</Text>
            <AppButton
              title="Delete Collection"
              variant="secondary"
              size="lg"
              icon={<Ionicons name="trash-outline" size={18} color={colors.danger} />}
              titleStyle={{ color: colors.danger }}
              style={styles.deleteBtn}
              onPress={handleDelete}
              hapticFeedback="heavy"
              accessibilityLabel="Delete collection"
            />
            <Text style={styles.dangerSub}>
              This action cannot be undone. Your saved items will remain in Saved.
            </Text>
          </View>
      </KeyboardAwareScrollView>

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel}
        cancelLabel={confirmSheet.cancelLabel}
        onConfirm={() => { confirmSheet.onConfirm(); setConfirmSheet((s) => ({ ...s, visible: false })); }}
        variant={confirmSheet.variant}
      />
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  content: {
    flex: 1 },
  scrollContent: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    paddingBottom: Space.xl,
    gap: Space.md },
  headerAction: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.body.letterSpacing },
  headerActionDisabled: {
    color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    ...Elevation.subtle },
  label: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: LetterSpacing.caps + 0.38,
    marginBottom: Space.sm },
  textArea: {
    minHeight: Space.xl + Space.xxl,
    textAlignVertical: 'top' },
  charCount: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: Space.xs },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.smMd },
  toggleIconWrap: {
    width: Control.chrome,
    height: Control.chrome,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center' },
  toggleText: {
    flex: 1 },
  toggleLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.body.letterSpacing },
  toggleSub: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    marginTop: Space.xs / 2,
    letterSpacing: TypographyV2.meta.letterSpacing },
  togglePill: {
    width: Space.xxl,
    height: Space.lg + Space.xs,
    borderRadius: Radius.xl,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    justifyContent: 'center',
    paddingHorizontal: Space.xs - 1 },
  togglePillActive: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary },
  toggleKnob: {
    width: Control.iconCompact + 2,
    height: Control.iconCompact + 2,
    borderRadius: Radius.lg,
    backgroundColor: colors.background,
    ...Elevation.card },
  toggleKnobActive: {
    transform: [{ translateX: 20 }] },
  dangerCard: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md,
    ...Elevation.subtle,
    marginTop: Space.md },
  manageItemsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
    borderRadius: Radius.lg,
    backgroundColor: colors.surface,
    borderWidth: Stroke.hairline,
    borderColor: colors.border,
    minHeight: Control.hit,
    ...Elevation.subtle },
  manageItemsText: {
    flex: 1 },
  manageItemsLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.body.letterSpacing },
  manageItemsSub: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    marginTop: Space.xs / 2,
    letterSpacing: TypographyV2.meta.letterSpacing },
  dangerLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.danger,
    textTransform: 'uppercase',
    letterSpacing: LetterSpacing.caps + 0.38,
    marginBottom: Space.sm },
  deleteBtn: {
    borderColor: colors.danger },
  dangerSub: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    marginTop: Space.sm,
    textAlign: 'center' } });
}