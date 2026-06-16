import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Type, Space, Radius } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppInput } from '../ui/AppInput';
import { AppButton } from '../ui/AppButton';
import { useHaptic } from '../../hooks/useHaptic';
import { useStore, Collection } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';
import { Typography } from '../../theme/designTokens';

interface Props {
  visible: boolean;
  itemId: string;
  onClose: () => void;
}

export function SaveToCollectionModal({ visible, itemId, onClose }: Props) {
  const [newCollectionName, setNewCollectionName] = useState('');
  const [showCreateInput, setShowCreateInput] = useState(false);
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const { show } = useToast();

  const collections = useStore((state) => state.collections);
  const addToCollection = useStore((state) => state.addToCollection);
  const removeFromCollection = useStore((state) => state.removeFromCollection);
  const isInCollection = useStore((state) => state.isInCollection);
  const createCollection = useStore((state) => state.createCollection);
  const isSavedProduct = useStore((state) => state.isSavedProduct);
  const toggleSavedProduct = useStore((state) => state.toggleSavedProduct);

  // Always read fresh state when toggling to avoid stale closure
  const handleToggleSaved = useCallback(() => {
    haptic.light();
    const currentlySaved = isSavedProduct(itemId);
    toggleSavedProduct(itemId);
    show(currentlySaved ? 'Removed from saved' : 'Saved to items', 'success');
  }, [haptic, isSavedProduct, itemId, show, toggleSavedProduct]);

  const handleToggleCollection = useCallback((collection: Collection) => {
    haptic.light();
    const currentlyIn = isInCollection(collection.id, itemId);
    if (currentlyIn) {
      removeFromCollection(collection.id, itemId);
      show(`Removed from ${collection.name}`, 'info');
    } else {
      addToCollection(collection.id, itemId);
      haptic.success();
      show(`Added to ${collection.name}`, 'success');
    }
  }, [addToCollection, haptic, isInCollection, itemId, removeFromCollection, show]);

  const handleCreateCollection = useCallback(() => {
    const trimmed = newCollectionName.trim();
    if (!trimmed) return;
    haptic.success();
    const newId = createCollection(trimmed);
    addToCollection(newId, itemId);
    setNewCollectionName('');
    setShowCreateInput(false);
    Keyboard.dismiss();
    show('Created and added to collection', 'success');
  }, [addToCollection, createCollection, haptic, itemId, newCollectionName, show]);

  const handleClose = useCallback(() => {
    setNewCollectionName('');
    setShowCreateInput(false);
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const renderCollectionItem = ({ item: collection }: { item: Collection }) => {
    const selected = isInCollection(collection.id, itemId);
    const count = collection.itemIds?.length ?? 0;
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
        <View style={styles.collectionInfo}>
          <Text style={styles.collectionName}>{collection.name}</Text>
          <Text style={styles.collectionCount}>{count} {count === 1 ? 'item' : 'items'}</Text>
        </View>
        {selected && <Ionicons name="checkmark-circle" size={24} color={Colors.brand} />}
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
              <View style={[styles.savedIconWrap, { backgroundColor: saved ? `${Colors.success}20` : 'rgba(255,255,255,0.03)' }]}>
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
                disabled={!newCollectionName.trim()}
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
      </KeyboardAvoidingView>
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
  collectionCount: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
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