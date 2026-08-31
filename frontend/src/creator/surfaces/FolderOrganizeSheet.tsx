/**
 * FolderOrganizeSheet — generic, data-model-agnostic folder organize
 * surface used by both the draft organizer (bottom sheet) and the
 * project organizer (full-screen modal).
 *
 * The component is driven by a `FolderOrganizeAdapter` that supplies
 * folders, items, and mutation methods. Two interaction modes are
 * supported:
 *
 *  - `tap`   — select a folder, then pick items to assign (drafts).
 *  - `drag`  — drag-and-drop items into folder drop zones (projects).
 *
 * Accessibility:
 *  - `accessibilityActions` expose "Move to [Folder]" per item.
 *  - `AccessibilityInfo.announceForAccessibility` fires on every move.
 *  - Quick chips get a visible active fill (`colors.brandSubtle`).
 *  - Drag handles are explicit in drag mode.
 *  - All adapter calls are wrapped in try/catch with loading/error states.
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  AccessibilityInfo,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  useReducedMotion,
} from 'react-native-reanimated';
import { Space, Radius, Typography, FontFamily, Control, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { IconGrammar } from '../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { SheetContainer, PressScale } from '../CreatorAnimations';
import { useHaptic } from '../../hooks/useHaptic';
import { useMotionConfig } from '../../hooks/useMotionConfig';

// ── Adapter contract ────────────────────────────────────────────────

/** A folder in the generic organize surface. */
export interface OrganizeFolder {
  id: string;
  name: string;
  /** Number of items currently in this folder. */
  itemCount: number;
}

/** An item (draft or project) in the generic organize surface. */
export interface OrganizeItem {
  id: string;
  title: string;
  type: 'look' | 'poster';
  /** Current folder id, or null when unfiled. */
  folderId: string | null;
  /** Epoch ms or ISO string — used for display. */
  updatedAt?: number | string;
}

/**
 * Data adapter that bridges the generic surface to a concrete
 * data model (drafts or projects). Mutation methods may be sync
 * or async; the surface awaits them and handles errors.
 */
export interface FolderOrganizeAdapter {
  folders: OrganizeFolder[];
  items: OrganizeItem[];
  createFolder(name: string): Promise<void> | void;
  renameFolder(id: string, name: string): Promise<void> | void;
  deleteFolder(id: string): Promise<void> | void;
  moveItem(itemId: string, folderId: string | null): Promise<void> | void;
}

// ── Props ───────────────────────────────────────────────────────────

export interface FolderOrganizeSheetProps {
  visible: boolean;
  onClose: () => void;
  adapter: FolderOrganizeAdapter;
  /** "sheet" renders in a bottom SheetContainer; "modal" is full-screen. */
  container: 'sheet' | 'modal';
  /** Interaction model for assigning items to folders. */
  interaction: 'tap' | 'drag';
  /** Noun used in labels, hints, and counts. */
  itemNoun: { singular: string; plural: string };
  /** Title shown in the header. */
  title: string;
  /** Close-button accessibility label. */
  closeLabel: string;
  /** Optional hint shown below the header (drag mode). */
  hint?: string;
  /** Called after any mutation succeeds, so callers can refresh. */
  onChanged?: () => void;
}

// ── Manage mode ─────────────────────────────────────────────────────

type ManageMode =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'rename'; folder: OrganizeFolder }
  | { kind: 'delete'; folder: OrganizeFolder };

// ── Component ───────────────────────────────────────────────────────

export function FolderOrganizeSheet({
  visible,
  onClose,
  adapter,
  container,
  interaction,
  itemNoun,
  title,
  closeLabel,
  hint,
  onChanged,
}: FolderOrganizeSheetProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reduceMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const { folders, items } = adapter;

  const [manageMode, setManageMode] = useState<ManageMode>({ kind: 'none' });
  const [nameInput, setNameInput] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Drag state (drag mode only) ──
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(null);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const dragScale = useSharedValue(1);
  const folderLayouts = useRef<Map<string, { x: number; y: number; width: number; height: number }>>(new Map());
  const rootDropLayout = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  // Reset transient state whenever the surface closes
  useEffect(() => {
    if (!visible) {
      setManageMode({ kind: 'none' });
      setNameInput('');
      setSelectedFolderId(null);
      setSelectedItemIds(new Set());
      setDraggingItemId(null);
      setDropTargetFolderId(null);
      setError(null);
      setBusy(false);
    }
  }, [visible]);

  // ── Helpers ──

  const announceMove = useCallback((itemTitle: string, folderName: string | null) => {
    const msg = folderName
      ? `Moved ${itemTitle} to ${folderName}`
      : `Moved ${itemTitle} to unfiled`;
    AccessibilityInfo.announceForAccessibility(msg);
  }, []);

  const runMutation = useCallback(
    async (fn: () => Promise<void> | void, successHaptic: () => void) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        successHaptic();
        onChanged?.();
      } catch (e) {
        haptic.error();
        setError(e instanceof Error ? e.message : 'Something went wrong');
      } finally {
        setBusy(false);
      }
    },
    [haptic, onChanged],
  );

  // ── Folder management ──

  const handleStartCreate = useCallback(() => {
    haptic.light();
    setManageMode({ kind: 'create' });
    setNameInput('');
  }, [haptic]);

  const handleStartRename = useCallback(
    (folder: OrganizeFolder) => {
      haptic.heavy();
      setManageMode({ kind: 'rename', folder });
      setNameInput(folder.name);
    },
    [haptic],
  );

  const handleStartDelete = useCallback(
    (folder: OrganizeFolder) => {
      haptic.heavy();
      setManageMode({ kind: 'delete', folder });
    },
    [haptic],
  );

  const handleConfirmManage = useCallback(() => {
    if (manageMode.kind === 'create') {
      const trimmed = nameInput.trim();
      if (!trimmed) {
        haptic.error();
        return;
      }
      runMutation(() => adapter.createFolder(trimmed), () => haptic.success());
      setManageMode({ kind: 'none' });
      setNameInput('');
    } else if (manageMode.kind === 'rename') {
      const trimmed = nameInput.trim();
      if (!trimmed) {
        haptic.error();
        return;
      }
      runMutation(() => adapter.renameFolder(manageMode.folder.id, trimmed), () => haptic.success());
      setManageMode({ kind: 'none' });
      setNameInput('');
    } else if (manageMode.kind === 'delete') {
      runMutation(() => adapter.deleteFolder(manageMode.folder.id), () => haptic.warning());
      setManageMode({ kind: 'none' });
    }
  }, [manageMode, nameInput, adapter, haptic, runMutation]);

  const handleCancelManage = useCallback(() => {
    haptic.light();
    setManageMode({ kind: 'none' });
    setNameInput('');
  }, [haptic]);

  // ── Tap-mode: select folder & assign items ──

  const handleSelectFolder = useCallback(
    (folderId: string) => {
      haptic.selection();
      setSelectedFolderId((prev) => (prev === folderId ? null : folderId));
      setSelectedItemIds(new Set());
    },
    [haptic],
  );

  const handleToggleItem = useCallback(
    (itemId: string) => {
      haptic.light();
      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        if (next.has(itemId)) {
          next.delete(itemId);
        } else {
          next.add(itemId);
        }
        return next;
      });
    },
    [haptic],
  );

  const handleAssignSelected = useCallback(() => {
    if (!selectedFolderId || selectedItemIds.size === 0) return;
    const folderName = folders.find((f) => f.id === selectedFolderId)?.name ?? null;
    haptic.medium();
    runMutation(
      async () => {
        await Promise.all(
          Array.from(selectedItemIds).map((id) => adapter.moveItem(id, selectedFolderId)),
        );
      },
      () => {
        // Announce the batch move
        AccessibilityInfo.announceForAccessibility(
          `Moved ${selectedItemIds.size} ${selectedItemIds.size === 1 ? itemNoun.singular : itemNoun.plural} to ${folderName}`,
        );
      },
    );
    setSelectedItemIds(new Set());
    setSelectedFolderId(null);
  }, [selectedFolderId, selectedItemIds, folders, haptic, adapter, runMutation, itemNoun]);

  const handleMoveToFolder = useCallback(
    (itemId: string, folderId: string) => {
      const item = items.find((i) => i.id === itemId);
      const folderName = folders.find((f) => f.id === folderId)?.name ?? null;
      haptic.medium();
      runMutation(() => adapter.moveItem(itemId, folderId), () => {
        if (item) announceMove(item.title, folderName);
      });
    },
    [items, folders, haptic, adapter, runMutation, announceMove],
  );

  const handleUnfile = useCallback(
    (itemId: string) => {
      const item = items.find((i) => i.id === itemId);
      haptic.light();
      runMutation(() => adapter.moveItem(itemId, null), () => {
        if (item) announceMove(item.title, null);
      });
    },
    [items, haptic, adapter, runMutation, announceMove],
  );

  // ── Drag-mode: drop target detection ──

  const checkDropTarget = useCallback(
    (x: number, y: number) => {
      const root = rootDropLayout.current;
      if (root) {
        if (x >= root.x && x <= root.x + root.width && y >= root.y && y <= root.y + root.height) {
          if (dropTargetFolderId !== null) {
            setDropTargetFolderId(null);
            haptic.selection();
          }
          return;
        }
      }
      for (const [folderId, layout] of folderLayouts.current) {
        if (x >= layout.x && x <= layout.x + layout.width && y >= layout.y && y <= layout.y + layout.height) {
          if (dropTargetFolderId !== folderId) {
            setDropTargetFolderId(folderId);
            haptic.selection();
          }
          return;
        }
      }
      if (dropTargetFolderId !== null) {
        setDropTargetFolderId(null);
      }
    },
    [dropTargetFolderId, haptic],
  );

  const handleDragStart = useCallback(
    (itemId: string, startX: number, startY: number) => {
      haptic.medium();
      setDraggingItemId(itemId);
      dragX.value = startX;
      dragY.value = startY;
      dragScale.value = reduceMotion ? 1.1 : withSpring(1.1, spring.entrance);
    },
    [haptic, dragX, dragY, dragScale, reduceMotion, spring],
  );

  const handleDragEnd = useCallback(
    (finalX: number, finalY: number) => {
      const itemId = draggingItemId;
      if (!itemId) return;

      let targetFolderId: string | null = null;
      const root = rootDropLayout.current;
      if (root) {
        if (finalX >= root.x && finalX <= root.x + root.width && finalY >= root.y && finalY <= root.y + root.height) {
          targetFolderId = null;
        }
      }
      if (targetFolderId === null) {
        for (const [folderId, layout] of folderLayouts.current) {
          if (finalX >= layout.x && finalX <= layout.x + layout.width && finalY >= layout.y && finalY <= layout.y + layout.height) {
            targetFolderId = folderId;
            break;
          }
        }
      }

      const item = items.find((i) => i.id === itemId);
      const currentFolderId = item?.folderId ?? null;

      if (targetFolderId !== currentFolderId) {
        const folderName = targetFolderId ? folders.find((f) => f.id === targetFolderId)?.name ?? null : null;
        runMutation(() => adapter.moveItem(itemId, targetFolderId), () => {
          if (item) announceMove(item.title, folderName);
        });
      } else {
        haptic.light();
      }

      setDraggingItemId(null);
      setDropTargetFolderId(null);
      dragScale.value = reduceMotion ? 1 : withSpring(1, spring.settle);
    },
    [draggingItemId, items, folders, adapter, haptic, reduceMotion, spring, dragScale, runMutation, announceMove],
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(8)
        .onStart((e) => {
          runOnJS(handleDragStart)(draggingItemId ?? '', e.absoluteX, e.absoluteY);
        })
        .onUpdate((e) => {
          dragX.value = e.absoluteX;
          dragY.value = e.absoluteY;
          runOnJS(checkDropTarget)(e.absoluteX, e.absoluteY);
        })
        .onEnd((e) => {
          runOnJS(handleDragEnd)(e.absoluteX, e.absoluteY);
        }),
    [dragX, dragY, checkDropTarget, handleDragStart, handleDragEnd, draggingItemId],
  );

  // ── Derived data ──

  const unfiledItems = useMemo(
    () => items.filter((i) => !i.folderId),
    [items],
  );

  const targetFolder = useMemo(
    () => folders.find((f) => f.id === selectedFolderId) ?? null,
    [folders, selectedFolderId],
  );

  const draggingItem = draggingItemId ? items.find((i) => i.id === draggingItemId) : null;

  const dragItemStyle = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: dragX.value - 60,
    top: dragY.value - 30,
    transform: [{ scale: dragScale.value }],
    opacity: draggingItemId ? 0.9 : 0,
    zIndex: 1000,
  }));

  // ── Accessibility actions for items ──
  const buildItemAccessibilityActions = useCallback(
    (item: OrganizeItem) => {
      const actions = folders.map((f) => ({
        name: `moveTo_${f.id}`,
        label: `Move to ${f.name}`,
      }));
      if (item.folderId) {
        actions.push({ name: 'unfile', label: 'Move to unfiled' });
      }
      return actions;
    },
    [folders],
  );

  const handleAccessibilityAction = useCallback(
    (item: OrganizeItem, actionName: string) => {
      if (actionName === 'unfile') {
        handleUnfile(item.id);
        return;
      }
      const folderId = actionName.startsWith('moveTo_') ? actionName.slice('moveTo_'.length) : null;
      if (folderId) {
        handleMoveToFolder(item.id, folderId);
      }
    },
    [handleUnfile, handleMoveToFolder],
  );

  // ── Render ──

  const content = (
    <>
      {/* Error banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={IconGrammar.metadata} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {manageMode.kind === 'none' ? (
        interaction === 'tap' ? (
          <TapOrganizeContent
            folders={folders}
            items={items}
            unfiledItems={unfiledItems}
            targetFolder={targetFolder}
            selectedFolderId={selectedFolderId}
            selectedItemIds={selectedItemIds}
            itemNoun={itemNoun}
            busy={busy}
            styles={styles}
            colors={colors}
            onSelectFolder={handleSelectFolder}
            onToggleItem={handleToggleItem}
            onAssignSelected={handleAssignSelected}
            onMoveToFolder={handleMoveToFolder}
            onUnfile={handleUnfile}
            onStartRename={handleStartRename}
            onStartDelete={handleStartDelete}
            onStartCreate={handleStartCreate}
            buildItemAccessibilityActions={buildItemAccessibilityActions}
            onAccessibilityAction={handleAccessibilityAction}
          />
        ) : (
          <DragOrganizeContent
            folders={folders}
            items={items}
            unfiledItems={unfiledItems}
            itemNoun={itemNoun}
            busy={busy}
            draggingItemId={draggingItemId}
            dropTargetFolderId={dropTargetFolderId}
            styles={styles}
            colors={colors}
            panGesture={panGesture}
            onSetDraggingItem={setDraggingItemId}
            onStartRename={handleStartRename}
            onStartDelete={handleStartDelete}
            onStartCreate={handleStartCreate}
            rootDropLayout={rootDropLayout}
            folderLayouts={folderLayouts}
            buildItemAccessibilityActions={buildItemAccessibilityActions}
            onAccessibilityAction={handleAccessibilityAction}
          />
        )
      ) : (
        <ManagePanel
          manageMode={manageMode}
          nameInput={nameInput}
          setNameInput={setNameInput}
          onConfirm={handleConfirmManage}
          onCancel={handleCancelManage}
          itemNoun={itemNoun}
          busy={busy}
          colors={colors}
          styles={styles}
        />
      )}
    </>
  );

  if (container === 'sheet') {
    return (
      <SheetContainer visible={visible} onClose={onClose} maxHeight={0.9}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetInner}
        >
          <OrganizeHeader
            title={title}
            closeLabel={closeLabel}
            onClose={onClose}
            closeIcon="close"
            styles={styles}
            colors={colors}
          />
          {content}
        </KeyboardAvoidingView>
      </SheetContainer>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <OrganizeHeader
          title={title}
          closeLabel={closeLabel}
          onClose={onClose}
          closeIcon="checkmark"
          styles={styles}
          colors={colors}
        />
        {hint && <Text style={styles.hint}>{hint}</Text>}
        {content}

        {/* Floating dragged item */}
        {draggingItem && (
          <Reanimated.View style={[styles.dragItem, dragItemStyle]} pointerEvents="none">
            <Ionicons
              name={draggingItem.type === 'look' ? 'shirt-outline' : 'film-outline'}
              size={IconGrammar.metadata}
              color={colors.textInverse}
            />
            <Text style={styles.dragItemText} numberOfLines={1}>
              {draggingItem.title}
            </Text>
          </Reanimated.View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Header ──────────────────────────────────────────────────────────

interface OrganizeHeaderProps {
  title: string;
  closeLabel: string;
  onClose: () => void;
  closeIcon: keyof typeof Ionicons.glyphMap;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
}

function OrganizeHeader({ title, closeLabel, onClose, closeIcon, styles, colors }: OrganizeHeaderProps) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onClose}
        style={styles.closeBtn}
        accessibilityLabel={closeLabel}
        accessibilityRole="button"
        hitSlop={8}
      >
        <Ionicons name={closeIcon} size={22} color={closeIcon === 'checkmark' ? colors.brand : colors.textPrimary} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.closeBtn} />
    </View>
  );
}

// ── Tap-mode content ────────────────────────────────────────────────

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

function TapOrganizeContent({
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
                      accessibilityRole="button"
                      hitSlop={8}
                    >
                      <Ionicons name="create-outline" size={18} color={colors.textSecondary} />
                    </Pressable>
                    <Pressable
                      onPress={() => onStartDelete(folder)}
                      style={styles.folderActionBtn}
                      accessibilityLabel={`Delete folder ${folder.name}`}
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

// ── Drag-mode content ───────────────────────────────────────────────

interface DragOrganizeContentProps {
  folders: OrganizeFolder[];
  items: OrganizeItem[];
  unfiledItems: OrganizeItem[];
  itemNoun: { singular: string; plural: string };
  busy: boolean;
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

function DragOrganizeContent({
  folders,
  items,
  unfiledItems,
  itemNoun,
  busy,
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
        <View style={styles.dragHandle} accessibilityLabel="Drag handle" accessibilityRole="button">
          <Ionicons name="menu" size={IconGrammar.metadata} color={colors.textMuted} />
        </View>
      </Reanimated.View>
    </GestureDetector>
  );
});

// ── Manage panel ────────────────────────────────────────────────────

interface ManagePanelProps {
  manageMode: ManageMode;
  nameInput: string;
  setNameInput: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  itemNoun: { singular: string; plural: string };
  busy: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

function ManagePanel({
  manageMode,
  nameInput,
  setNameInput,
  onConfirm,
  onCancel,
  itemNoun,
  busy,
  colors,
  styles,
}: ManagePanelProps) {
  if (manageMode.kind === 'delete') {
    return (
      <View style={styles.managePanel}>
        <Text style={styles.manageTitle}>Delete folder?</Text>
        <Text style={styles.manageBody}>
          &ldquo;{manageMode.folder.name}&rdquo; will be removed. Its {itemNoun.plural.toLowerCase()} will move back to unfiled.
        </Text>
        <Pressable
          onPress={onConfirm}
          disabled={busy}
          style={({ pressed }) => [
            styles.manageDangerBtn,
            pressed && { opacity: 0.85 },
            busy && { opacity: 0.5 },
          ]}
          accessibilityLabel="Confirm delete folder"
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <Text style={styles.manageDangerText}>Delete Folder</Text>
          )}
        </Pressable>
        <Pressable
          onPress={onCancel}
          style={({ pressed }) => [styles.manageCancelBtn, pressed && { opacity: 0.7 }]}
          accessibilityLabel="Cancel"
          accessibilityRole="button"
        >
          <Text style={styles.manageCancelText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.managePanel}>
      <Text style={styles.manageTitle}>
        {manageMode.kind === 'create' ? 'New Folder' : 'Rename Folder'}
      </Text>
      <TextInput
        style={styles.nameInput}
        value={nameInput}
        onChangeText={setNameInput}
        placeholder="Folder name"
        placeholderTextColor={colors.textMuted}
        autoFocus
        maxLength={40}
        returnKeyType="done"
        onSubmitEditing={onConfirm}
        accessibilityLabel="Folder name"
      />
      <Pressable
        onPress={onConfirm}
        disabled={!nameInput.trim() || busy}
        style={({ pressed }) => [
          styles.manageConfirmBtn,
          !nameInput.trim() && styles.manageConfirmDisabled,
          pressed && { opacity: 0.85 },
        ]}
        accessibilityLabel={manageMode.kind === 'create' ? 'Create folder' : 'Save folder name'}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.textInverse} />
        ) : (
          <Text style={styles.manageConfirmText}>
            {manageMode.kind === 'create' ? 'Create' : 'Save'}
          </Text>
        )}
      </Pressable>
      <Pressable
        onPress={onCancel}
        style={({ pressed }) => [styles.manageCancelBtn, pressed && { opacity: 0.7 }]}
        accessibilityLabel="Cancel"
        accessibilityRole="button"
      >
        <Text style={styles.manageCancelText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // ── Sheet container ──
    sheetInner: {
      flex: 1,
      paddingHorizontal: Space.md,
    },
    // ── Modal container ──
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    // ── Header ──
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      height: 44,
    },
    headerTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: 17,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    closeBtn: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    hint: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      lineHeight: TypographyV2.meta.lineHeight,
    },
    // ── Error banner ──
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      backgroundColor: colors.danger,
      borderRadius: Radius.md,
      marginHorizontal: Space.md,
      marginTop: Space.sm,
    },
    errorText: {
      flex: 1,
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size,
      color: colors.textInverse,
    },
    // ── New folder button ──
    newFolderBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      paddingVertical: Space.smMd,
      marginBottom: Space.sm,
    },
    newFolderText: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.brand,
    },
    // ── Scroll ──
    scrollArea: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: Space.lg,
    },
    emptyHint: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.body.size,
      color: colors.textSecondary,
      paddingVertical: Space.md,
    },
    // ── Tap-mode folder rows ──
    folderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.md,
      paddingHorizontal: Space.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    folderRowSelected: {
      backgroundColor: colors.brandSubtle,
    },
    folderInfo: {
      flex: 1,
      gap: 2,
    },
    folderName: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.textPrimary,
    },
    folderNameSelected: {
      color: colors.brand,
    },
    folderCount: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary,
    },
    folderActions: {
      flexDirection: 'row',
      gap: Space.xs,
    },
    folderActionBtn: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center',
    },
    // ── Tap-mode assign section ──
    assignSection: {
      marginTop: Space.lg,
      paddingTop: Space.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle,
    },
    assignHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Space.sm,
    },
    assignTitle: {
      flex: 1,
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.textPrimary,
    },
    assignConfirmBtn: {
      backgroundColor: colors.brand,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
    },
    assignConfirmText: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.body.size,
      color: colors.textInverse,
    },
    // ── Tap-mode item pick rows ──
    itemPickRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    itemPickRowSelected: {
      backgroundColor: colors.brandSubtle,
    },
    itemPickInfo: {
      flex: 1,
      gap: 2,
    },
    itemPickTitle: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size,
      color: colors.textPrimary,
    },
    itemPickMeta: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary,
    },
    itemPickRemove: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center',
    },
    // ── Quick-move chips ──
    quickMoveSection: {
      marginTop: Space.lg,
    },
    quickMoveRow: {
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    quickMoveInfo: {
      gap: 2,
      marginBottom: Space.xs,
    },
    quickMoveTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.body.size,
      color: colors.textPrimary,
    },
    quickMoveFolder: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary,
    },
    quickChip: {
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      marginRight: Space.xs,
      minHeight: Control.hit,
      justifyContent: 'center',
      borderRadius: Radius.md,
    },
    // Accessibility fix: visible active fill
    quickChipActive: {
      backgroundColor: colors.brandSubtle,
    },
    quickChipInactive: {
      backgroundColor: 'transparent',
    },
    quickChipUnfile: {
      backgroundColor: 'transparent',
    },
    quickChipText: {
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.body.size,
    },
    quickChipTextActive: {
      color: colors.brand,
    },
    quickChipTextInactive: {
      color: colors.textSecondary,
    },
    quickChipTextUnfile: {
      color: colors.danger,
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.body.size,
    },
    footerHint: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.meta.size,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: Space.lg,
    },
    // ── Drag-mode drop zones ──
    dropZone: {
      borderRadius: Radius.lg,
      backgroundColor: colors.surfaceAlt,
      padding: Space.sm,
      marginBottom: Space.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'transparent',
    },
    dropZoneActive: {
      borderColor: colors.brand,
      borderWidth: 2,
      backgroundColor: colors.brandSubtle,
    },
    dropZoneHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginBottom: Space.xs,
      minHeight: 44,
    },
    dropZoneTitle: {
      flex: 1,
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.textPrimary,
    },
    dropZoneCount: {
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size,
      color: colors.textSecondary,
      backgroundColor: colors.surface,
      paddingHorizontal: Space.sm,
      paddingVertical: 2,
      borderRadius: Radius.full,
      overflow: 'hidden',
    },
    folderNameBtn: {
      flex: 1,
      minHeight: 44,
      justifyContent: 'center',
    },
    // ── Drag-mode item rows ──
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.sm,
      borderRadius: Radius.md,
      minHeight: 44,
      backgroundColor: colors.surface,
      marginBottom: Space.xxs,
    },
    itemRowDragging: {
      opacity: 0.4,
    },
    itemTitle: {
      flex: 1,
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size,
      color: colors.textPrimary,
    },
    dragHandle: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center',
    },
    dragItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderRadius: Radius.md,
      backgroundColor: colors.brand,
      width: 120,
      height: 44,
    },
    dragItemText: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.meta.size,
      color: colors.textInverse,
      flex: 1,
    },
    // ── Manage mode ──
    managePanel: {
      paddingVertical: Space.md,
      flex: 1,
    },
    manageTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.sectionTitle.size,
      color: colors.textPrimary,
      textAlign: 'center',
      marginTop: Space.sm,
    },
    manageBody: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.body.size,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: Space.xs,
      marginBottom: Space.lg,
    },
    nameInput: {
      fontFamily: Typography.family.regular,
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.textPrimary,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      borderRadius: Radius.lg,
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
      marginBottom: Space.md,
      minHeight: 44,
    },
    manageConfirmBtn: {
      backgroundColor: colors.brand,
      paddingVertical: Space.md,
      borderRadius: Radius.lg,
      alignItems: 'center',
      marginBottom: Space.sm,
      minHeight: 44,
      justifyContent: 'center',
    },
    manageConfirmDisabled: {
      opacity: 0.4,
    },
    manageConfirmText: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.textInverse,
    },
    manageDangerBtn: {
      backgroundColor: colors.danger,
      paddingVertical: Space.md,
      borderRadius: Radius.lg,
      alignItems: 'center',
      marginBottom: Space.sm,
      minHeight: 44,
      justifyContent: 'center',
    },
    manageDangerText: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.bodyStrong.size,
      color: colors.textInverse,
    },
    manageCancelBtn: {
      paddingVertical: Space.md,
      borderRadius: Radius.lg,
      alignItems: 'center',
      minHeight: 44,
      justifyContent: 'center',
    },
    manageCancelText: {
      fontFamily: Typography.family.semibold,
      fontSize: TypographyV2.body.size,
      color: colors.textSecondary,
    },
  });
}
