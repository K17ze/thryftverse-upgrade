import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Dimensions,
  Pressable,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';

import { Colors } from '../constants/colors';
import { Typography } from '../constants/typography';
import { useStore, Collection } from '../store/useStore';
import { MOCK_LISTINGS } from '../data/mockData';
import { RootStackParamList } from '../navigation/types';
import { CachedImage } from '../components/CachedImage';
import { EmptyState } from '../components/EmptyState';

const { width } = Dimensions.get('window');
const COLLECTION_CARD_WIDTH = (width - 48) / 2;
const COLLECTION_CARD_HEIGHT = COLLECTION_CARD_WIDTH * 1.2;

type NavigationProp = StackNavigationProp<RootStackParamList>;

export default function CollectionsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const collections = useStore((state) => state.collections);
  const createCollection = useStore((state) => state.createCollection);
  const deleteCollection = useStore((state) => state.deleteCollection);
  const renameCollection = useStore((state) => state.renameCollection);
  const listings = MOCK_LISTINGS;

  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDesc, setNewCollectionDesc] = useState('');
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);

  const handleCreateCollection = useCallback(() => {
    if (!newCollectionName.trim()) {
      Alert.alert('Error', 'Please enter a collection name');
      return;
    }
    createCollection(newCollectionName.trim(), newCollectionDesc.trim() || undefined);
    setNewCollectionName('');
    setNewCollectionDesc('');
    setIsCreateModalVisible(false);
  }, [newCollectionName, newCollectionDesc, createCollection]);

  const handleDeleteCollection = useCallback((collection: Collection) => {
    Alert.alert(
      'Delete Collection?',
      `Are you sure you want to delete "${collection.name}"? This will remove ${collection.itemIds.length} items from this collection.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteCollection(collection.id),
        },
      ]
    );
  }, [deleteCollection]);

  const handleRenameCollection = useCallback((collection: Collection) => {
    setEditingCollection(collection);
    setNewCollectionName(collection.name);
    setNewCollectionDesc(collection.description || '');
    setIsCreateModalVisible(true);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (editingCollection && newCollectionName.trim()) {
      renameCollection(editingCollection.id, newCollectionName.trim());
    }
    setEditingCollection(null);
    setNewCollectionName('');
    setNewCollectionDesc('');
    setIsCreateModalVisible(false);
  }, [editingCollection, newCollectionName, renameCollection]);

  const getCollectionCoverImage = useCallback((collection: Collection): string | undefined => {
    if (collection.coverImage) return collection.coverImage;
    // Find first item in collection and use its first image
    for (const itemId of collection.itemIds) {
      const item = listings.find((l) => l.id === itemId);
      if (item?.images?.[0]) {
        return item.images[0];
      }
    }
    return undefined;
  }, [listings]);

  const renderCollectionCard = useCallback(({ item, index }: { item: Collection; index: number }) => {
    const coverImage = getCollectionCoverImage(item);
    const itemCount = item.itemIds.length;

    return (
      <Animated.View
        entering={FadeInDown.delay(index * 50).duration(400)}
        style={styles.collectionCard}
      >
        <Pressable
          onPress={() => navigation.navigate('CollectionDetail', { collectionId: item.id })}
          onLongPress={() => handleRenameCollection(item)}
          style={styles.collectionCardInner}
        >
          <View style={styles.collectionCover}>
            {coverImage ? (
              <CachedImage
                uri={coverImage}
                style={styles.coverImage}
                contentFit="cover"
              />
            ) : (
              <View style={styles.emptyCover}>
                <Ionicons name="images-outline" size={32} color={Colors.textMuted} />
                <Text style={styles.emptyCoverText}>No items yet</Text>
              </View>
            )}
            {/* Overlay gradient */}
            <View style={styles.coverOverlay} />
            {/* Item count badge */}
            <View style={styles.itemCountBadge}>
              <Ionicons name="bookmark" size={12} color={Colors.background} />
              <Text style={styles.itemCountText}>{itemCount}</Text>
            </View>
          </View>
          <View style={styles.collectionInfo}>
            <Text style={styles.collectionName} numberOfLines={1}>
              {item.name}
            </Text>
            {item.description ? (
              <Text style={styles.collectionDesc} numberOfLines={1}>
                {item.description}
              </Text>
            ) : null}
          </View>
        </Pressable>
        {/* Delete button */}
        <Pressable
          style={styles.deleteBtn}
          onPress={() => handleDeleteCollection(item)}
          hitSlop={8}
        >
          <Ionicons name="close-circle" size={20} color={Colors.danger} />
        </Pressable>
      </Animated.View>
    );
  }, [getCollectionCoverImage, handleDeleteCollection, handleRenameCollection, navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Collections</Text>
        <Pressable
          style={styles.newBtn}
          onPress={() => {
            setEditingCollection(null);
            setNewCollectionName('');
            setNewCollectionDesc('');
            setIsCreateModalVisible(true);
          }}
        >
          <Ionicons name="add" size={18} color={Colors.background} />
          <Text style={styles.newBtnText}>New</Text>
        </Pressable>
      </View>

      {/* Collections Grid */}
      {collections.length === 0 ? (
        <EmptyState
          icon="albums-outline"
          title="No collections yet"
          subtitle="Create collections to organize items you find on your feed. Try 'Shirts' or 'Summer Vibes!'"
          ctaLabel="Create Collection"
          onCtaPress={() => setIsCreateModalVisible(true)}
        />
      ) : (
        <FlashList
          data={collections}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.gridContent}
          renderItem={renderCollectionCard}
          ListFooterComponent={<View style={{ height: 32 }} />}
        />
      )}

      {/* Create/Edit Collection Modal */}
      <Modal
        visible={isCreateModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Animated.View entering={FadeIn.duration(200)} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingCollection ? 'Edit Collection' : 'New Collection'}
              </Text>
              <Pressable onPress={() => setIsCreateModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textPrimary} />
              </Pressable>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Collection name (e.g., Shirts)"
              placeholderTextColor={Colors.textMuted}
              value={newCollectionName}
              onChangeText={setNewCollectionName}
              maxLength={50}
              autoFocus
            />

            <TextInput
              style={[styles.input, styles.descInput]}
              placeholder="Description (optional)"
              placeholderTextColor={Colors.textMuted}
              value={newCollectionDesc}
              onChangeText={setNewCollectionDesc}
              maxLength={100}
              multiline
              numberOfLines={2}
            />

            <Pressable
              style={[styles.modalBtn, styles.modalBtnPrimary]}
              onPress={editingCollection ? handleSaveEdit : handleCreateCollection}
            >
              <Text style={styles.modalBtnPrimaryText}>
                {editingCollection ? 'Save Changes' : 'Create Collection'}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 28,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  gridContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  collectionCard: {
    width: COLLECTION_CARD_WIDTH,
    marginHorizontal: 4,
    marginBottom: 16,
  },
  collectionCardInner: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  collectionCover: {
    width: '100%',
    height: COLLECTION_CARD_WIDTH,
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  emptyCover: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCoverText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    marginTop: 8,
  },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  itemCountBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  itemCountText: {
    fontSize: 12,
    color: Colors.background,
    fontFamily: Typography.family.bold,
  },
  collectionInfo: {
    padding: 12,
  },
  collectionName: {
    fontSize: 16,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  collectionDesc: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  deleteBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: Colors.background,
    borderRadius: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  descInput: {
    height: 60,
    textAlignVertical: 'top',
  },
  createBtn: {
    marginTop: 8,
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.brand,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  newBtnText: {
    color: Colors.background,
    fontSize: 14,
    fontFamily: Typography.family.bold,
  },
  modalBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalBtnPrimary: {
    backgroundColor: Colors.brand,
  },
  modalBtnPrimaryText: {
    color: Colors.background,
    fontSize: 16,
    fontFamily: Typography.family.bold,
  },
});
