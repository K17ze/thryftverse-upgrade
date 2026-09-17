/**
 * DragOrganizeContent — drag-mode content for the generic
 * FolderOrganizeSheet surface: drag-and-drop items into folder drop
 * zones. Includes the memoized DraggableItemRow. Extracted verbatim
 * from FolderOrganizeSheet.tsx.
 */
import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { runOnJS } from 'react-native-reanimated';
import { IconGrammar } from '../../../theme/designTokens';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { PressScale } from '../../shared/CreatorAnimations';
import { useHaptic } from '../../../hooks/useHaptic';
import type { OrganizeFolder, OrganizeItem } from '../FolderOrganizeSheet';
import type { createStyles } from './folderOrganizeStyles';

interface DragOrganizeContentProps {
  folders: OrganizeFolder[];
  items: OrganizeItem[];
  unfiledItems: OrganizeItem[];
  itemNoun: { singular: string; plural: string };
  draggingItemId: string | null;
  dropTargetFolderId: string | null;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  panGesture: ReturnType<typeof Gesture.Pan>;
  onSetDraggingItem: (id: string) => void;
  onStartRename: (folder: OrganizeFolder) => void;
  onStartDelete: (folder: OrganizeFolder) => void;
  onStartCreate: () => void;
  rootDropLayout: React.MutableRefObject<{ x: number; y: number; width: number; height: number } | null>;
  folderLayouts: React.MutableRefObject<Map<string, { x: number; y: number; width: number; height: number }>>;
  buildItemAccessibilityActions: (item: OrganizeItem) => { name: string; label: string }[];
  onAccessibilityAction: (item: OrganizeItem, actionName: string) => void;
}

export function DragOrganizeContent({
  folders,
  items,
  unfiledItems,
  itemNoun,
  draggingItemId,
  dropTargetFolderId,
  styles,
  colors,
  panGesture,
  onSetDraggingItem,
  onStartRename,
  onStartDelete,
  onStartCreate,
  rootDropLayout,
  folderLayouts,
  buildItemAccessibilityActions,
  onAccessibilityAction,
}: DragOrganizeContentProps) {
  const getItemsInFolder = useCallback(
    (folderId: string) => items.filter((i) => i.folderId === folderId),
    [items],
  );

  return (
    <ScrollView
      style={styles.scrollArea}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {/* New folder button */}
      <PressScale
        onPress={onStartCreate}
        style={styles.newFolderBtn}
        accessibilityLabel="Create new folder"
        accessibilityHint="Shows the new-folder form"
        accessibilityRole="button"
        scale={0.97}
      >
        <Ionicons name="folder-open-outline" size={IconGrammar.standard} color={colors.brand} />
        <Text style={styles.newFolderText}>New Folder</Text>
        <Ionicons name="add" size={IconGrammar.standard} color={colors.brand} />
      </PressScale>

      {/* Root (unfiled) drop zone */}
      <View
        onLayout={(e) => {
          rootDropLayout.current = {
            x: e.nativeEvent.layout.x,
            y: e.nativeEvent.layout.y,
            width: e.nativeEvent.layout.width,
            height: e.nativeEvent.layout.height,
          };
        }}
        style={[
          styles.dropZone,
          dropTargetFolderId === null && draggingItemId && styles.dropZoneActive,
        ]}
      >
        <View style={styles.dropZoneHeader}>
          <Ionicons
            name={dropTargetFolderId === null && draggingItemId ? 'folder-open' : 'folder-outline'}
            size={IconGrammar.metadata}
            color={dropTargetFolderId === null && draggingItemId ? colors.brand : colors.textSecondary}
          />
          <Text style={styles.dropZoneTitle}>All {itemNoun.plural}</Text>
          <Text style={styles.dropZoneCount}>{unfiledItems.length}</Text>
        </View>
        {unfiledItems.length === 0 ? (
          <Text style={styles.emptyHint}>No unfiled {itemNoun.plural.toLowerCase()}</Text>
        ) : (
          unfiledItems.map((item) => (
            <DraggableItemRow
              key={item.id}
              item={item}
              folderName={`All ${itemNoun.plural}`}
              colors={colors}
              styles={styles}
              panGesture={panGesture}
              onDragStart={() => onSetDraggingItem(item.id)}
              isDragging={draggingItemId === item.id}
              accessibilityActions={buildItemAccessibilityActions(item)}
              onAccessibilityAction={(actionName) => onAccessibilityAction(item, actionName)}
            />
          ))
        )}
      </View>

      {/* Folders */}
      {folders.length === 0 && unfiledItems.length === 0 && (
        <Text style={styles.emptyHint}>No folders yet. Create one above.</Text>
      )}
      {folders.map((folder) => {
        const folderItems = getItemsInFolder(folder.id);
        const isDropTarget = dropTargetFolderId === folder.id && draggingItemId;
        return (
          <View
            key={folder.id}
            onLayout={(e) => {
              folderLayouts.current.set(folder.id, {
                x: e.nativeEvent.layout.x,
                y: e.nativeEvent.layout.y,
                width: e.nativeEvent.layout.width,
                height: e.nativeEvent.layout.height,
              });
            }}
            style={[
              styles.dropZone,
              isDropTarget && styles.dropZoneActive,
            ]}
          >
            <View style={styles.dropZoneHeader}>
              <Ionicons
                name={isDropTarget ? 'folder' : 'folder-outline'}
                size={IconGrammar.metadata}
                color={isDropTarget ? colors.brand : colors.textSecondary}
              />
              <Pressable
                onPress={() => onStartRename(folder)}
                onLongPress={() => onStartDelete(folder)}
                delayLongPress={500}
                style={styles.folderNameBtn}
                accessibilityLabel={`Folder ${folder.name}, ${folderItems.length} ${itemNoun.plural}. Tap to rename, long-press to delete.`}
                accessibilityHint="Shows the rename form; long-press shows delete options"
                accessibilityRole="button"
              >
                <Text style={styles.dropZoneTitle} numberOfLines={1}>
                  {folder.name}
                </Text>
              </Pressable>
              <Text style={styles.dropZoneCount}>{folderItems.length}</Text>
              <Pressable
                onPress={() => onStartDelete(folder)}
                style={styles.folderActionBtn}
                accessibilityLabel={`Delete folder ${folder.name}`}
                accessibilityHint="Shows the delete confirmation"
                accessibilityRole="button"
                hitSlop={8}
              >
                <Ionicons name="trash-outline" size={IconGrammar.metadata} color={colors.danger} />
              </Pressable>
            </View>
            {folderItems.length === 0 ? (
              <Text style={styles.emptyHint}>Empty folder — drag {itemNoun.plural.toLowerCase()} here</Text>
            ) : (
              folderItems.map((item) => (
                <DraggableItemRow
                  key={item.id}
                  item={item}
                  folderName={folder.name}
                  colors={colors}
                  styles={styles}
                  panGesture={panGesture}
                  onDragStart={() => onSetDraggingItem(item.id)}
                  isDragging={draggingItemId === item.id}
                  accessibilityActions={buildItemAccessibilityActions(item)}
                  onAccessibilityAction={(actionName) => onAccessibilityAction(item, actionName)}
                />
              ))
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

// ── Draggable item row ──────────────────────────────────────────────

interface DraggableItemRowProps {
  item: OrganizeItem;
  folderName: string;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  panGesture: ReturnType<typeof Gesture.Pan>;
  onDragStart: () => void;
  isDragging: boolean;
  accessibilityActions: { name: string; label: string }[];
  onAccessibilityAction: (actionName: string) => void;
}

const DraggableItemRow = React.memo(function DraggableItemRow({
  item,
  folderName,
  colors,
  styles,
  panGesture,
  onDragStart,
  isDragging,
  accessibilityActions,
  onAccessibilityAction,
}: DraggableItemRowProps) {
  const haptic = useHaptic();
  const longPress = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(350)
        .onStart(() => {
          runOnJS(() => haptic.medium())();
          runOnJS(onDragStart)();
        }),
    [haptic, onDragStart],
  );

  const composedGesture = useMemo(
    () => Gesture.Race(panGesture, longPress),
    [panGesture, longPress],
  );

  return (
    <GestureDetector gesture={composedGesture}>
      <Reanimated.View
        style={[
          styles.itemRow,
          isDragging && styles.itemRowDragging,
        ]}
        accessibilityLabel={`Item ${item.title} in ${folderName}. Long-press and drag to move.`}
        accessibilityHint="Long-press and drag to move; custom actions offer more options"
        accessibilityRole="button"
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={(e) => onAccessibilityAction(e.nativeEvent.actionName)}
      >
        <Ionicons
          name={item.type === 'look' ? 'shirt-outline' : 'film-outline'}
          size={IconGrammar.metadata}
          color={colors.textSecondary}
        />
        <Text style={styles.itemTitle} numberOfLines={1}>
          {item.title}
        </Text>
        {/* Explicit drag handle */}
        <View style={styles.dragHandle} accessibilityLabel="Drag handle" accessibilityRole="button" accessibilityHint="Long-press and drag to move this item">
          <Ionicons name="menu" size={IconGrammar.metadata} color={colors.textMuted} />
        </View>
      </Reanimated.View>
    </GestureDetector>
  );
});
