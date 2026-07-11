import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Space, Radius } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppInput } from '../ui/AppInput';
import { AppButton } from '../ui/AppButton';
import { useHaptic } from '../../hooks/useHaptic';
import { useStore, Collection } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';
import { Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { useBackendData } from '../../context/BackendDataContext';
import { KeyboardStickyView } from '../../platform/keyboard/KeyboardProvider';

interface Props {
  visible: boolean;
  itemId: string;
  onClose: () => void;
}

export function SaveToCollectionModal({ visible, itemId, onClose }: Props) {
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
    show(currentlySaved ? 'Removed from saved' : 'Saved to items', 'success');
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
      show('Action failed. Please try again.', 'error');
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
        show('Collection created. Adding item failed.', 'info');
      }
      setNewCollectionName('');
      setShowCreateInput(false);
      Keyboard.dismiss();
      show('Created and added to collection', 'success');
    } catch {
      show('Unable to create collection. Please try again.', 'error');
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
      <AnimatedPressable
        style={[styles.collectionRow, selected && styles.collectionRowSelected]}
        onPress={() => handleToggleCollection(collection)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${selected ? 'Remove from' : 'Add to'} ${collection.name} collection`}
        accessibilityHint={selected ? 'Tap to remove from this collection' : 'Tap to add to this collection'}
      >
        <View style={styles.collectionLeft}>
          {cover ? (
            <CachedImage uri={cover} style={styles.collectionThumb} contentFit="cover" />
          ) : (
            <View style={styles.collectionThumbEmpty}>
              <Ionicons name="folder-open-outline" size={18} color={Colors.textMuted} />
            </View>
          )}
          <View style={styles.collectionInfo}>
            <Text style={styles.collectionName}>{collection.name}</Text>
            <Text style={styles.collectionCount}>{count} {count === 1 ? 'item' : 'items'}</Text>
          </View>
        </View>
        {selected ? (
          <View style={styles.checkWrap}>
            <Ionicons name="checkmark-circle" size={24} color={Colors.brand} />
          </View>
        ) : (
          <View style={styles.uncheckedWrap} />
        )}
      </AnimatedPressable>
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
        <View style={[styles.card, { paddingBottom: Space.md + insets.bottom }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Save</Text>
            <AnimatedPressable onPress={handleClose} accessibilityLabel="Close save modal">
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </AnimatedPressable>
          </View>

          {/* Item context */}
          {item && (
            <View style={styles.itemContext}>
              {item.images?.[0] ? (
                <CachedImage uri={item.images[0]} style={styles.itemThumb} contentFit="cover" />
              ) : (
                <View style={styles.itemThumbEmpty}>
                  <Ionicons name="image-outline" size={20} color={Colors.textMuted} />
                </View>
              )}
              <View style={styles.itemInfo}>
                <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.itemBrand}>{item.brand}</Text>
              </View>
            </View>
          )}

          {/* Saved Toggle */}
          <AnimatedPressable
            style={[styles.savedRow, saved && styles.savedRowActive]}
            onPress={handleToggleSaved}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ selected: saved }}
            accessibilityLabel={saved ? 'Saved to items' : 'Save for later'}
          >
            <View style={styles.savedRowLeft}>
              <View style={[styles.savedIconWrap, { backgroundColor: saved ? `${Colors.success}20` : Colors.surfaceAlt }]}>
                <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={20} color={saved ? Colors.success : Colors.textPrimary} />
              </View>
              <View>
                <Text style={styles.savedRowTitle}>{saved ? 'Saved' : 'Save for later'}</Text>
                <Text style={styles.savedRowSub}>{saved ? 'In your saved items' : 'Add to your saved items'}</Text>
              </View>
            </View>
            <Ionicons
              name={saved ? 'checkmark-circle' : 'ellipse-outline'}
              size={26}
              color={saved ? Colors.success : Colors.border}
            />
          </AnimatedPressable>

          {/* Collections List */}
          <Text style={styles.sectionLabel}>Collections</Text>
          <FlatList
            data={collections}
            keyExtractor={(col) => col.id}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={(
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No collections yet. Create one below.</Text>
              </View>
            )}
            renderItem={renderCollectionItem}
            contentContainerStyle={styles.listContent}
          />

          {/* Create Collection */}
          {showCreateInput ? (
            <View style={styles.createWrap}>
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
            <AnimatedPressable
              style={styles.createTrigger}
              onPress={() => setShowCreateInput(true)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Create new collection"
            >
              <Ionicons name="add-circle-outline" size={20} color={Colors.brand} />
              <Text style={styles.createTriggerText}>Create New Collection</Text>
            </AnimatedPressable>
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
  card: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Space.md,
    maxHeight: '80%',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Space.md,
  },
  title: {
    fontSize: 20,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Space.sm + 2,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Space.md,
  },
  savedRowActive: {
    borderColor: Colors.success,
  },
  savedRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  savedIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedRowTitle: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  savedRowSub: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: Typography.family.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: Space.sm,
  },
  listContent: {
    paddingBottom: Space.sm,
  },
  collectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Space.sm + 4,
    borderRadius: Radius.lg,
    marginBottom: Space.xs,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  collectionRowSelected: {
    borderColor: Colors.brand,
    backgroundColor: Colors.surfaceAlt,
  },
  collectionInfo: {
    flex: 1,
  },
  collectionName: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  collectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    flex: 1,
  },
  collectionThumb: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
    overflow: 'hidden',
  },
  collectionThumbEmpty: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  collectionCount: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  checkWrap: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uncheckedWrap: {
    width: 28,
  },
  itemContext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    padding: Space.sm + 4,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceAlt,
    marginBottom: Space.md,
  },
  itemThumb: {
    width: 48,
    height: 48,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  itemThumbEmpty: {
    width: 48,
    height: 48,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  itemBrand: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: Space.xl,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  createWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Space.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Space.sm,
  },
  createTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.md,
    marginTop: Space.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  createTriggerText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
  },
});