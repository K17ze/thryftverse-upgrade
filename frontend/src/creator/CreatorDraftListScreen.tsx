import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { Colors } from '../constants/colors';
import { CreatorDraftService, type DraftMeta } from './drafts';
import { createStableId } from '../utils/createStableId';

export function CreatorDraftListScreen() {
  const navigation = useNavigation<any>();
  const [drafts, setDrafts] = useState<DraftMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDrafts = useCallback(async () => {
    const items = await CreatorDraftService.listDrafts();
    setDrafts(items);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  const handleOpenDraft = useCallback((draft: DraftMeta) => {
    navigation.navigate('CreatorStudio', {
      type: draft.type,
      draftId: draft.id,
    });
  }, [navigation]);

  const handleDeleteDraft = useCallback((draft: DraftMeta) => {
    Alert.alert(
      'Delete draft?',
      `"${draft.title}" will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await CreatorDraftService.deleteDraft(draft.id);
            setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
          },
        },
      ],
    );
  }, []);

  const handleDuplicateDraft = useCallback(async (draft: DraftMeta) => {
    const doc = await CreatorDraftService.loadDraft(draft.id);
    if (!doc) return;
    const newId = createStableId('doc');
    const duplicatedDoc = {
      ...doc,
      id: newId,
      metadata: {
        ...doc.metadata,
        title: `${draft.title} (copy)`,
      },
      pages: doc.pages.map((p) => ({
        ...p,
        id: `page_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        layers: p.layers.map((l) => ({
          ...l,
          id: `${l.id}_dup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        })),
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await CreatorDraftService.saveDraft(duplicatedDoc);
    loadDrafts();
  }, [loadDrafts]);

  const renderItem = useCallback(({ item }: { item: DraftMeta }) => (
    <Pressable
      onPress={() => handleOpenDraft(item)}
      style={styles.draftRow}
      accessibilityLabel={`Open draft ${item.title}`}
      accessibilityRole="button"
    >
      <View style={[styles.draftIcon, { backgroundColor: item.type === 'look' ? '#5856d620' : '#ff950020' }]}>
        <Ionicons
          name={item.type === 'look' ? 'shirt-outline' : 'film-outline'}
          size={20}
          color={item.type === 'look' ? '#5856d6' : '#ff9500'}
        />
      </View>
      <View style={styles.draftInfo}>
        <Text style={styles.draftTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.draftMeta}>
          {item.type === 'look' ? 'Look' : 'Poster'} · {new Date(item.updatedAt).toLocaleDateString()}
        </Text>
        <View style={styles.statusRow}>
          <View style={styles.statusBadge}>
            <Ionicons name="phone-portrait-outline" size={10} color={Colors.textMuted} />
            <Text style={styles.statusText}>Local</Text>
          </View>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          onPress={() => handleDuplicateDraft(item)}
          style={styles.actionBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={`Duplicate draft ${item.title}`}
          accessibilityRole="button"
        >
          <Ionicons name="copy-outline" size={16} color={Colors.textSecondary} />
        </Pressable>
        <Pressable
          onPress={() => handleDeleteDraft(item)}
          style={styles.actionBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={`Delete draft ${item.title}`}
          accessibilityRole="button"
        >
          <Ionicons name="trash-outline" size={16} color="#ff6b6b" />
        </Pressable>
      </View>
    </Pressable>
  ), [handleOpenDraft, handleDeleteDraft, handleDuplicateDraft]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.brand} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityLabel="Back"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Drafts</Text>
        <View style={styles.backBtn} />
      </View>

      <FlatList
        data={drafts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadDrafts(); }} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="document-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No drafts</Text>
            <Text style={styles.emptySubtext}>Drafts are saved automatically as you create</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.title.size,
    color: Colors.textPrimary,
  },
  listContent: {
    padding: Space.md,
    gap: Space.sm,
  },
  draftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  draftIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  draftInfo: {
    flex: 1,
    gap: 2,
  },
  statusRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
  },
  statusText: {
    fontFamily: Typography.family.regular,
    fontSize: 10,
    color: Colors.textMuted,
  },
  actions: {
    flexDirection: 'row',
    gap: Space.xs,
  },
  actionBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  draftTitle: {
    fontFamily: Typography.family.medium,
    fontSize: Type.body.size,
    color: Colors.textPrimary,
  },
  draftMeta: {
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    color: Colors.textMuted,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Space.xl * 2,
    gap: Space.sm,
  },
  emptyTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    color: Colors.textSecondary,
  },
  emptySubtext: {
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
