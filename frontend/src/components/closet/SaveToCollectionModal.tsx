import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  Keyboard,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Space, Radius, Typography, Type } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppInput } from '../ui/AppInput';
import { AppButton } from '../ui/AppButton';
import { useHaptic } from '../../hooks/useHaptic';
import { useStore, Collection } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';
import { CachedImage } from '../CachedImage';
import { useBackendData } from '../../context/BackendDataContext';
import { KeyboardStickyView } from '../../platform/keyboard/KeyboardProvider';

interface Props {
  visible: boolean;
  itemId: string;
  onClose: () => void;
}

export function SaveToCollectionModal({ visible, itemId, onClose }: Props) {
  const { colors } = useAppTheme();
  const [newCollectionName, setNewCollectionName] = useState('');
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const { show } = useToast();

  const { listings } = useBackendData();
  const collections = useStore((state) => state.collections);
  const addToCollectionOnApi = useStore((state) => state.addToCollectionOnApi);
  const removeFromCollectionOnApi = useStore((state) => state.removeFromCollectionOnApi);
  const addToCollection = useStore((state) => state.addToCollection);
  const removeFromCollection = useStore((state) => state.removeFromCollection);
  const isInCollection = useStore((state) => state.isInCollection);
  const createCollectionOnApi = useStore((state) => state.createCollectionOnApi);
  const isSavedProduct = useStore((state) => state.isSavedProduct);
  const toggleSavedProduct = useStore((state) => state.toggleSavedProduct);

  const item = useMemo(() => listings.find((l) => l.id === itemId), [listings, itemId]);

  // Always read fresh state when toggling to avoid stale closure
  const handleToggleSaved = useCallback(() => {
    haptic.light();
    const currentlySaved = isSavedProduct(itemId);
    toggleSavedProduct(itemId);
    show(currentlySaved ? 'Removed from Saved' : 'Saved', 'success');
  }, [haptic, isSavedProduct, itemId, show, toggleSavedProduct]);

  const handleToggleCollection = useCallback(async (collection: Collection) => {
    haptic.light();
    const currentlyIn = isInCollection(collection.id, itemId);

    // Optimistic local update
    if (currentlyIn) {
      removeFromCollection(collection.id, itemId);
    } else {
      addToCollection(collection.id, itemId);
    }

    try {
      if (currentlyIn) {
        await removeFromCollectionOnApi(collection.id, itemId);
        show(`Removed from ${collection.name}`, 'info');
      } else {
        await addToCollectionOnApi(collection.id, itemId);
        haptic.success();
        show(`Added to ${collection.name}`, 'success');
      }
    } catch {
      // Rollback optimistic change
      if (currentlyIn) {
        addToCollection(collection.id, itemId);
      } else {
        removeFromCollection(collection.id, itemId);
      }
      show('Failed — try again.', 'error');
    }
  }, [addToCollection, addToCollectionOnApi, haptic, isInCollection, itemId, removeFromCollection, removeFromCollectionOnApi, show]);

  const handleCreateCollection = useCallback(async () => {
    const trimmed = newCollectionName.trim();
    if (!trimmed || isSubmitting) return;
    haptic.success();
    setIsSubmitting(true);

    try {
      const newId = await createCollectionOnApi(trimmed);
      // Also add the current item to the new collection via API
      try {
        await addToCollectionOnApi(newId, itemId);
        addToCollection(newId, itemId);
      } catch {
        // Collection created but item add failed; user can retry manually
        show('Collection created. Couldn\'t add item.', 'info');
      }
      setNewCollectionName('');
      setShowCreateInput(false);
      Keyboard.dismiss();
      show('Added to new collection', 'success');
    } catch {
      show('Couldn\'t create collection.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }, [addToCollection, addToCollectionOnApi, createCollectionOnApi, haptic, isSubmitting, itemId, newCollectionName, show]);

  const handleClose = useCallback(() => {
    setNewCollectionName('');
    setShowCreateInput(false);
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const getCollectionCover = useCallback((collection: Collection) => {
    const coverItem = collection.itemIds
      .map((id) => listings.find((l) => l.id === id))
      .filter((l): l is NonNullable<typeof l> => !!l && Array.isArray(l.images) && l.images.length > 0)[0];
    return coverItem?.images?.[0] ?? null;
  }, [listings]);

  const renderCollectionItem = ({ item: collection }: { item: Collection }) => {
    const selected = isInCollection(collection.id, itemId);
    const count = collection.itemIds?.length ?? 0;
    const cover = getCollectionCover(collection);
    return (
      <Pressable
        style={({ pressed }) => [styles.collectionRow, pressed && { opacity: 0.6 }]}
        onPress={() => handleToggleCollection(collection)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${selected ? 'Remove from' : 'Add to'} ${collection.name} collection`}
        accessibilityHint={selected ? 'Tap to remove from this collection' : 'Tap to add to this collection'}
      >
        <View style={styles.collectionLeft}>
          {cover ? (
            <CachedImage uri={cover} style={styles.collectionThumb} contentFit="cover" />
          ) : (
            <View style={[styles.collectionThumbEmpty, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="folder-open-outline" size={18} color={colors.textMuted} />
            </View>
          )}
          <View style={styles.collectionInfo}>
            <Text style={[styles.collectionName, { color: colors.textPrimary }]}>{collection.name}</Text>
            <Text style={[styles.collectionCount, { color: colors.textMuted }]}>
              {count} {count === 1 ? 'item' : 'items'}
            </Text>
          </View>
        </View>
        {selected ? (
          <Ionicons name="checkmark-circle" size={24} color={colors.brand} />
        ) : (
          <Ionicons name="ellipse-outline" size={24} color={colors.border} />
        )}
      </Pressable>
    );
  };

  const saved = isSavedProduct(itemId);

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={handleClose}
    >
      <KeyboardStickyView
        style={styles.overlay}
      >
        <View style={[styles.card, { backgroundColor: colors.background, paddingBottom: Space.md + insets.bottom }]}>
          {/* Header — flat, no border. Title + close. */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Save</Text>
            <Pressable
              onPress={handleClose}
              hitSlop={12}
              accessibilityLabel="Close save modal"
              accessibilityRole="button"
              style={({ pressed }) => pressed && { opacity: 0.5 }}
            >
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>

          {/* Item context — flat, no card border. Per AGENTS.md surface budget. */}
          {item && (
            <View style={styles.itemContext}>
              {item.images?.[0] ? (
                <CachedImage uri={item.images[0]} style={styles.itemThumb} contentFit="cover" />
              ) : (
                <View style={[styles.itemThumbEmpty, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name="image-outline" size={20} color={colors.textMuted} />
                </View>
              )}
              <View style={styles.itemInfo}>
                <Text style={[styles.itemTitle, { color: colors.textPrimary }]} numberOfLines={2}>{item.title}</Text>
                <Text style={[styles.itemBrand, { color: colors.textSecondary }]}>{item.brand}</Text>
              </View>
            </View>
          )}

          {/* Saved Toggle — flat row with hairline separator, not a bordered card.
              Selection state communicated by icon fill, not border color. */}
          <Pressable
            style={({ pressed }) => [styles.savedRow, { borderBottomColor: colors.borderSubtle }, pressed && { opacity: 0.6 }]}
            onPress={handleToggleSaved}
            accessibilityRole="button"
            accessibilityState={{ selected: saved }}
            accessibilityLabel={saved ? 'Remove from saved items' : 'Save for later'}
          >
            <View style={styles.savedRowLeft}>
              <Ionicons
                name={saved ? 'bookmark' : 'bookmark-outline'}
                size={20}
                color={saved ? colors.success : colors.textPrimary}
              />
              <View>
                <Text style={[styles.savedRowTitle, { color: colors.textPrimary }]}>
                  {saved ? 'Saved' : 'Save for later'}
                </Text>
                <Text style={[styles.savedRowSub, { color: colors.textMuted }]}>
                  {saved ? 'In your saved items' : 'Add to your saved items'}
                </Text>
              </View>
            </View>
            <Ionicons
              name={saved ? 'checkmark-circle' : 'ellipse-outline'}
              size={24}
              color={saved ? colors.success : colors.border}
            />
          </Pressable>

          {/* Collections section label */}
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            Collections
          </Text>

          {/* Collections List — flat rows, no bordered cards.
              Per AGENTS.md: flat canvas, spacing and hairlines are the
              default utility structure. */}
          <FlatList
            data={collections}
            keyExtractor={(col) => col.id}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={(
              <View style={styles.emptyWrap}>
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  No collections yet.
                </Text>
              </View>
            )}
            renderItem={renderCollectionItem}
            contentContainerStyle={styles.listContent}
          />

          {/* Create Collection — flat action with hairline separator */}
          {showCreateInput ? (
            <View style={[styles.createWrap, { borderTopColor: colors.borderSubtle }]}>
              <AppInput
                value={newCollectionName}
                onChangeText={setNewCollectionName}
                placeholder="Collection name"
                containerStyle={{ flex: 1 }}
                returnKeyType="done"
                onSubmitEditing={handleCreateCollection}
                autoFocus
              />
              <AppButton
                title="Create"
                size="sm"
                onPress={handleCreateCollection}
                disabled={!newCollectionName.trim() || isSubmitting}
                loading={isSubmitting}
                style={{ marginLeft: Space.sm }}
              />
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.createTrigger, { borderTopColor: colors.borderSubtle }, pressed && { opacity: 0.6 }]}
              onPress={() => setShowCreateInput(true)}
              accessibilityRole="button"
              accessibilityLabel="Create new collection"
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.brand} />
              <Text style={[styles.createTriggerText, { color: colors.brand }]}>
                Create New Collection
              </Text>
            </Pressable>
          )}
        </View>
      </KeyboardStickyView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  // ── Card (sheet container) — the one dominant panel ──
  card: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Space.md,
    maxHeight: '80%',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  // ── Header ──
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Space.md,
    minHeight: 44,
  },
  title: {
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.subtitle.letterSpacing,
  },
  // ── Item context — flat, no card ──
  itemContext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.sm,
    marginBottom: Space.sm,
  },
  itemThumb: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  itemThumbEmpty: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  itemBrand: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
  },
  // ── Saved toggle — flat row with hairline separator ──
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  savedRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    flex: 1,
  },
  savedRowTitle: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  savedRowSub: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    marginTop: 2,
  },
  // ── Section label ──
  sectionLabel: {
    fontSize: Type.label.size,
    lineHeight: Type.label.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.label.letterSpacing,
    textTransform: 'uppercase',
    marginTop: Space.lg,
    marginBottom: Space.sm,
  },
  // ── Collections list ──
  listContent: {
    paddingBottom: Space.sm,
  },
  collectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm + 2,
    minHeight: 44,
  },
  collectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    flex: 1,
  },
  collectionThumb: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  collectionThumbEmpty: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  collectionInfo: {
    flex: 1,
    gap: 2,
  },
  collectionName: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  collectionCount: {
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
  },
  // ── Empty state ──
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: Space.xl,
  },
  emptyText: {
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    fontFamily: Typography.family.regular,
  },
  // ── Create collection ──
  createWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Space.md,
  },
  createTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs + 2,
    paddingVertical: Space.md,
    marginTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  createTriggerText: {
    fontSize: Type.bodyStrong.size,
    lineHeight: Type.bodyStrong.lineHeight,
    fontFamily: Typography.family.semibold,
  },
});
