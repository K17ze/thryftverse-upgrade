/**
 * TapOrganizeContent — tap-mode content for the generic
 * FolderOrganizeSheet surface: select a folder, then pick items to
 * assign. Extracted verbatim from FolderOrganizeSheet.tsx.
 */
import React from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { IconGrammar } from '../../../theme/designTokens';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { PressScale } from '../../shared/CreatorAnimations';
import type { OrganizeFolder, OrganizeItem } from '../FolderOrganizeSheet';
import type { createStyles } from './folderOrganizeStyles';

interface TapOrganizeContentProps {
  folders: OrganizeFolder[];
  items: OrganizeItem[];
  unfiledItems: OrganizeItem[];
  targetFolder: OrganizeFolder | null;
  selectedFolderId: string | null;
  selectedItemIds: Set<string>;
  itemNoun: { singular: string; plural: string };
  busy: boolean;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  onSelectFolder: (id: string) => void;
  onToggleItem: (id: string) => void;
  onAssignSelected: () => void;
  onMoveToFolder: (itemId: string, folderId: string) => void;
  onUnfile: (itemId: string) => void;
  onStartRename: (folder: OrganizeFolder) => void;
  onStartDelete: (folder: OrganizeFolder) => void;
  onStartCreate: () => void;
  buildItemAccessibilityActions: (item: OrganizeItem) => { name: string; label: string }[];
  onAccessibilityAction: (item: OrganizeItem, actionName: string) => void;
}

export function TapOrganizeContent({
  folders,
  items,
  unfiledItems,
  targetFolder,
  selectedFolderId,
  selectedItemIds,
  itemNoun,
  busy,
  styles,
  colors,
  onSelectFolder,
  onToggleItem,
  onAssignSelected,
  onMoveToFolder,
  onUnfile,
  onStartRename,
  onStartDelete,
  onStartCreate,
  buildItemAccessibilityActions,
  onAccessibilityAction,
}: TapOrganizeContentProps) {
  return (
    <>
      {/* New folder button */}
      <PressScale
        onPress={onStartCreate}
        style={styles.newFolderBtn}
        accessibilityLabel="Create new folder"
        accessibilityHint="Shows the new-folder form"
        accessibilityRole="button"
        scale={0.97}
      >
        <Ionicons name="add" size={20} color={colors.brand} />
        <Text style={styles.newFolderText}>New Folder</Text>
      </PressScale>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {folders.length === 0 ? (
          <Text style={styles.emptyHint}>No folders yet</Text>
        ) : (
          folders.map((folder) => {
            const isSelected = selectedFolderId === folder.id;
            return (
              <Pressable
                key={folder.id}
                onPress={() => onSelectFolder(folder.id)}
                onLongPress={() => onStartRename(folder)}
                delayLongPress={350}
                style={({ pressed }) => [
                  styles.folderRow,
                  isSelected && styles.folderRowSelected,
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityLabel={`Folder ${folder.name}, ${folder.itemCount} ${folder.itemCount === 1 ? itemNoun.singular : itemNoun.plural}`}
                accessibilityHint="Select to assign. Long-press to manage."
                accessibilityRole="button"
              >
                <View style={styles.folderInfo}>
                  <Text
                    style={[styles.folderName, isSelected && styles.folderNameSelected]}
                    numberOfLines={1}
                  >
                    {folder.name}
                  </Text>
                  <Text style={styles.folderCount}>
                    {folder.itemCount} {folder.itemCount === 1 ? itemNoun.singular : itemNoun.plural}
                  </Text>
                </View>
                {isSelected && (
                  <View style={styles.folderActions}>
                    <Pressable
                      onPress={() => onStartRename(folder)}
                      style={styles.folderActionBtn}
                      accessibilityLabel={`Rename folder ${folder.name}`}
                      accessibilityHint="Shows the rename form"
                      accessibilityRole="button"
                      hitSlop={8}
                    >
                      <Ionicons name="create-outline" size={18} color={colors.textSecondary} />
                    </Pressable>
                    <Pressable
                      onPress={() => onStartDelete(folder)}
                      style={styles.folderActionBtn}
                      accessibilityLabel={`Delete folder ${folder.name}`}
                      accessibilityHint="Shows the delete confirmation"
                      accessibilityRole="button"
                      hitSlop={8}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </Pressable>
                  </View>
                )}
              </Pressable>
            );
          })
        )}

        {/* Item assignment section */}
        {targetFolder && (
          <View style={styles.assignSection}>
            <View style={styles.assignHeader}>
              <Text style={styles.assignTitle} numberOfLines={1}>
                Move to &ldquo;{targetFolder.name}&rdquo;
              </Text>
              {selectedItemIds.size > 0 && (
                <Pressable
                  onPress={onAssignSelected}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.assignConfirmBtn,
                    pressed && { opacity: 0.8 },
                    busy && { opacity: 0.5 },
                  ]}
                  accessibilityLabel={`Move ${selectedItemIds.size} ${selectedItemIds.size === 1 ? itemNoun.singular : itemNoun.plural} to ${targetFolder.name}`}
                  accessibilityHint="Moves the selected items into this folder"
                  accessibilityRole="button"
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={colors.textInverse} />
                  ) : (
                    <Text style={styles.assignConfirmText}>
                      Move {selectedItemIds.size}
                    </Text>
                  )}
                </Pressable>
              )}
            </View>
            {items.map((item) => {
              const isSelected = selectedItemIds.has(item.id);
              const inThisFolder = item.folderId === targetFolder.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => onToggleItem(item.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={({ pressed }) => [
                    styles.itemPickRow,
                    isSelected && styles.itemPickRowSelected,
                    pressed && { opacity: 0.7 },
                  ]}
                  accessibilityLabel={`Item ${item.title}${inThisFolder ? ', already in this folder' : ''}`}
                  accessibilityHint="Toggles this item for the move"
                  accessibilityRole="button"
                  accessibilityActions={buildItemAccessibilityActions(item)}
                  onAccessibilityAction={(e) => onAccessibilityAction(item, e.nativeEvent.actionName)}
                >
                  <Ionicons
                    name={
                      isSelected
                        ? 'checkmark-circle'
                        : inThisFolder
                          ? 'folder'
                          : 'ellipse-outline'
                    }
                    size={IconGrammar.standard}
                    color={
                      isSelected
                        ? colors.brand
                        : inThisFolder
                          ? colors.textMuted
                          : colors.border
                    }
                  />
                  <View style={styles.itemPickInfo}>
                    <Text style={styles.itemPickTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.itemPickMeta} numberOfLines={1}>
                      {item.type === 'look' ? 'Look' : 'Poster'}
                      {item.updatedAt
                        ? ` · ${new Date(item.updatedAt).toLocaleDateString()}`
                        : ''}
                    </Text>
                  </View>
                  {inThisFolder && (
                    <Pressable
                      onPress={() => onUnfile(item.id)}
                      style={styles.itemPickRemove}
                      accessibilityLabel={`Remove ${item.title} from folder`}
                      accessibilityHint="Moves the item back to unfiled"
                      accessibilityRole="button"
                      hitSlop={8}
                    >
                      <Ionicons name="remove-circle-outline" size={IconGrammar.metadata} color={colors.danger} />
                    </Pressable>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Quick-move section when no folder is selected */}
        {!targetFolder && items.length > 0 && (
          <View style={styles.quickMoveSection}>
            {items.map((item) => (
              <View key={item.id} style={styles.quickMoveRow}>
                <View style={styles.quickMoveInfo}>
                  <Text style={styles.quickMoveTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.quickMoveFolder} numberOfLines={1}>
                    {item.folderId
                      ? folders.find((f) => f.id === item.folderId)?.name ?? 'Folder'
                      : 'Unfiled'}
                  </Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {folders.map((folder) => {
                    const isCurrent = item.folderId === folder.id;
                    return (
                      <Pressable
                        key={folder.id}
                        onPress={() => !isCurrent && onMoveToFolder(item.id, folder.id)}
                        disabled={isCurrent || busy}
                        style={({ pressed }) => [
                          styles.quickChip,
                          isCurrent ? styles.quickChipActive : styles.quickChipInactive,
                          pressed && { opacity: 0.7 },
                        ]}
                        accessibilityLabel={`Move ${item.title} to ${folder.name}`}
                        accessibilityHint="Moves the item to this folder"
                        accessibilityRole="button"
                      >
                        <Text
                          style={[
                            styles.quickChipText,
                            isCurrent
                              ? styles.quickChipTextActive
                              : styles.quickChipTextInactive,
                          ]}
                          numberOfLines={1}
                        >
                          {folder.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                  {item.folderId && (
                    <Pressable
                      onPress={() => onUnfile(item.id)}
                      disabled={busy}
                      style={({ pressed }) => [
                        styles.quickChip,
                        styles.quickChipUnfile,
                        pressed && { opacity: 0.7 },
                      ]}
                      accessibilityLabel={`Remove ${item.title} from any folder`}
                      accessibilityHint="Moves the item back to unfiled"
                      accessibilityRole="button"
                    >
                      <Text style={styles.quickChipTextUnfile}>Unfile</Text>
                    </Pressable>
                  )}
                </ScrollView>
              </View>
            ))}
          </View>
        )}

        {unfiledItems.length > 0 && !targetFolder && folders.length > 0 && (
          <Text style={styles.footerHint}>
            {unfiledItems.length} unfiled {unfiledItems.length === 1 ? itemNoun.singular : itemNoun.plural}
          </Text>
        )}
      </ScrollView>
    </>
  );
}
