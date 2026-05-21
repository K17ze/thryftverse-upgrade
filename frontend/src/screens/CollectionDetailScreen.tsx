import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Reanimated, { FadeInDown, useSharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { ActiveTheme, Colors } from '../constants/colors';
import { Type, Space, Radius } from '../theme/designTokens';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { EmptyState } from '../components/EmptyState';
import { RefreshIndicator } from '../components/RefreshIndicator';
import { MasonryGrid } from '../components/ProductCardV2';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useHaptic } from '../hooks/useHaptic';
import { useToast } from '../context/ToastContext';

type NavT = StackNavigationProp<RootStackParamList>;

export default function CollectionDetailScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<any>();
  const haptic = useHaptic();
  const { show } = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const scrollY = useSharedValue(0);

  const collectionId = route.params?.collectionId;

  const collections = useStore((state) => state.collections);
  const deleteCollection = useStore((state) => state.deleteCollection);
  const renameCollection = useStore((state) => state.renameCollection);
  const { listings, refreshListings } = useBackendData();

  const collection = useMemo(
    () => collections.find((c) => c.id === collectionId),
    [collections, collectionId]
  );

  const collectionItems = useMemo(
    () => listings.filter((l) => collection?.itemIds?.includes(l.id) ?? false),
    [listings, collection]
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshListings();
    setTimeout(() => setRefreshing(false), 350);
  };

  const handleDelete = useCallback(() => {
    haptic.heavy();
    Alert.alert(
      'Delete Collection',
      `Are you sure you want to delete "${collection?.name}"? Items will remain in your Saved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (collectionId) {
              deleteCollection(collectionId);
              show('Collection deleted', 'info');
              navigation.goBack();
            }
          },
        },
      ]
    );
  }, [collection, collectionId, deleteCollection, haptic, navigation, show]);

  const handleRename = useCallback(() => {
    haptic.medium();
    // Simple prompt rename; could be upgraded to inline bottom sheet
    Alert.prompt(
      'Rename Collection',
      'Enter a new name for this collection.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rename',
          onPress: (newName?: string) => {
            if (newName?.trim() && collectionId) {
              renameCollection(collectionId, newName.trim());
              show('Collection renamed', 'success');
            }
          },
        },
      ],
      'plain-text',
      collection?.name ?? ''
    );
  }, [collection, collectionId, haptic, renameCollection, show]);

  if (!collection) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <EmptyState
          icon="alert-circle-outline"
          title="Collection not found"
          subtitle="This collection may have been deleted."
          ctaLabel="Go Back"
          onCtaPress={() => navigation.goBack()}
        />
      </SafeAreaView>
    );
  }

  const count = collectionItems.length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={Colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <AnimatedPressable style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </AnimatedPressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{collection.name}</Text>
          <Text style={styles.headerMeta}>{count} {count === 1 ? 'item' : 'items'}</Text>
        </View>
        <AnimatedPressable style={styles.actionBtn} onPress={handleRename} activeOpacity={0.85} accessibilityLabel="Rename collection">
          <Ionicons name="pencil-outline" size={20} color={Colors.textPrimary} />
        </AnimatedPressable>
        <AnimatedPressable style={styles.actionBtn} onPress={handleDelete} activeOpacity={0.85} accessibilityLabel="Delete collection">
          <Ionicons name="trash-outline" size={20} color={Colors.danger} />
        </AnimatedPressable>
      </View>

      <RefreshIndicator scrollY={scrollY} isRefreshing={refreshing} topInset={20} />

      {count > 0 ? (
        <Reanimated.ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onScroll={(event) => {
            scrollY.value = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="transparent"
              colors={['transparent']}
              progressBackgroundColor="transparent"
            />
          }
        >
          <Reanimated.View entering={FadeInDown.duration(300)}>
            <MasonryGrid
              items={collectionItems}
              onPressItem={(item) => navigation.push('ItemDetail', { itemId: item.id })}
              numColumns={2}
              showSeller
              showSaveButton
            />
          </Reanimated.View>
          <View style={{ height: 120 }} />
        </Reanimated.ScrollView>
      ) : (
        <EmptyState
          icon="folder-open-outline"
          title="Empty collection"
          subtitle="Browse items and add them to this collection."
          ctaLabel="Browse"
          onCtaPress={() => navigation.navigate('Browse', { categoryId: 'all', title: 'Browse' })}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.md - Space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...Type.subtitle,
    color: Colors.textPrimary,
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
  },
  headerMeta: {
    ...Type.caption,
    color: Colors.textMuted,
    marginTop: 2,
  },
  listContent: {
    paddingHorizontal: Space.sm,
    paddingBottom: 120,
  },
});
