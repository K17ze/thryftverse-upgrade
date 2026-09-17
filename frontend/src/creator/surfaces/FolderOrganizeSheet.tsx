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
 *
 * Render blocks live under `./folderOrganize/` (header, tap/drag
 * content, manage panel, styles, and the drag-state hook); this file
 * keeps the adapter contract, shared types, and orchestration logic.
 */
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  Modal,
  AccessibilityInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated from 'react-native-reanimated';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { IconGrammar } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { SheetContainer } from '../shared/CreatorAnimations';
import { useHaptic } from '../../hooks/useHaptic';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { createStyles } from './folderOrganize/folderOrganizeStyles';
import { OrganizeHeader } from './folderOrganize/OrganizeHeader';
import { TapOrganizeContent } from './folderOrganize/TapOrganizeContent';
import { DragOrganizeContent } from './folderOrganize/DragOrganizeContent';
import { ManagePanel } from './folderOrganize/ManagePanel';
import { useFolderOrganizeDrag } from './folderOrganize/useFolderOrganizeDrag';

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

export type ManageMode =
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

  // ── Drag state (drag mode only) ──
  const {
    draggingItemId,
    setDraggingItemId,
    dropTargetFolderId,
    setDropTargetFolderId,
    folderLayouts,
    rootDropLayout,
    panGesture,
    draggingItem,
    dragItemStyle,
  } = useFolderOrganizeDrag({
    items,
    folders,
    adapter,
    haptic,
    reduceMotion,
    spring,
    runMutation,
    announceMove,
  });

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
  }, [visible, setDraggingItemId, setDropTargetFolderId]);

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

  // ── Derived data ──

  const unfiledItems = useMemo(
    () => items.filter((i) => !i.folderId),
    [items],
  );

  const targetFolder = useMemo(
    () => folders.find((f) => f.id === selectedFolderId) ?? null,
    [folders, selectedFolderId],
  );

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
