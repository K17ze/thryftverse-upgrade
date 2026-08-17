import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useReducedMotion } from 'react-native-reanimated';
import { Space, Radius, Type, Typography, FontFamily, Control } from '../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { SheetContainer, PressScale } from './CreatorAnimations';
import { useHaptic } from '../hooks/useHaptic';
import { CreatorDraftService, type Folder, type DraftMeta } from './drafts';

interface CreatorFolderOrganizeSheetProps {
  visible: boolean;
  onClose: () => void;
  drafts: DraftMeta[];
  folders: Folder[];
  onFoldersChanged: () => void;
  onDraftsChanged: () => void;
}

type ManageMode =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'rename'; folder: Folder }
  | { kind: 'delete'; folder: Folder };

export function CreatorFolderOrganizeSheet({
  visible,
  onClose,
  drafts,
  folders,
  onFoldersChanged,
  onDraftsChanged,
}: CreatorFolderOrganizeSheetProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reduceMotion = useReducedMotion();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [manageMode, setManageMode] = useState<ManageMode>({ kind: 'none' });
  const [nameInput, setNameInput] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set());

  // Reset transient state whenever the sheet closes
  useEffect(() => {
    if (!visible) {
      setManageMode({ kind: 'none' });
      setNameInput('');
      setSelectedFolderId(null);
      setSelectedDraftIds(new Set());
    }
  }, [visible]);

  const unfiledDrafts = useMemo(
    () => drafts.filter((d) => !d.folderId),
    [drafts],
  );

  const handleStartCreate = useCallback(() => {
    haptic.light();
    setManageMode({ kind: 'create' });
    setNameInput('');
  }, [haptic]);

  const handleStartRename = useCallback(
    (folder: Folder) => {
      haptic.heavy();
      setManageMode({ kind: 'rename', folder });
      setNameInput(folder.name);
    },
    [haptic],
  );

  const handleStartDelete = useCallback(
    (folder: Folder) => {
      haptic.heavy();
      setManageMode({ kind: 'delete', folder });
    },
    [haptic],
  );

  const handleConfirmManage = useCallback(async () => {
    if (manageMode.kind === 'create') {
      const trimmed = nameInput.trim();
      if (!trimmed) {
        haptic.error();
        return;
      }
      await CreatorDraftService.createFolder(trimmed);
      haptic.success();
      setManageMode({ kind: 'none' });
      setNameInput('');
      onFoldersChanged();
    } else if (manageMode.kind === 'rename') {
      const trimmed = nameInput.trim();
      if (!trimmed) {
        haptic.error();
        return;
      }
      await CreatorDraftService.renameFolder(manageMode.folder.id, trimmed);
      haptic.success();
      setManageMode({ kind: 'none' });
      setNameInput('');
      onFoldersChanged();
    } else if (manageMode.kind === 'delete') {
      await CreatorDraftService.deleteFolder(manageMode.folder.id);
      haptic.warning();
      setManageMode({ kind: 'none' });
      onFoldersChanged();
      onDraftsChanged();
    }
  }, [manageMode, nameInput, haptic, onFoldersChanged, onDraftsChanged]);

  const handleCancelManage = useCallback(() => {
    haptic.light();
    setManageMode({ kind: 'none' });
    setNameInput('');
  }, [haptic]);

  const handleSelectFolder = useCallback(
    (folderId: string) => {
      haptic.selection();
      setSelectedFolderId((prev) => (prev === folderId ? null : folderId));
      setSelectedDraftIds(new Set());
    },
    [haptic],
  );

  const handleToggleDraft = useCallback(
    (draftId: string) => {
      haptic.light();
      setSelectedDraftIds((prev) => {
        const next = new Set(prev);
        if (next.has(draftId)) {
          next.delete(draftId);
        } else {
          next.add(draftId);
        }
        return next;
      });
    },
    [haptic],
  );

  const handleAssignSelected = useCallback(async () => {
    if (!selectedFolderId || selectedDraftIds.size === 0) return;
    haptic.medium();
    await Promise.all(
      Array.from(selectedDraftIds).map((id) =>
        CreatorDraftService.moveDraftToFolder(id, selectedFolderId),
      ),
    );
    setSelectedDraftIds(new Set());
    setSelectedFolderId(null);
    onDraftsChanged();
  }, [selectedFolderId, selectedDraftIds, haptic, onDraftsChanged]);

  const handleMoveToFolder = useCallback(
    async (draftId: string, folderId: string) => {
      haptic.medium();
      await CreatorDraftService.moveDraftToFolder(draftId, folderId);
      onDraftsChanged();
    },
    [haptic, onDraftsChanged],
  );

  const handleUnfile = useCallback(
    async (draftId: string) => {
      haptic.light();
      await CreatorDraftService.moveDraftToFolder(draftId, null);
      onDraftsChanged();
    },
    [haptic, onDraftsChanged],
  );

  const targetFolder = useMemo(
    () => folders.find((f) => f.id === selectedFolderId) ?? null,
    [folders, selectedFolderId],
  );

  return (
    <SheetContainer visible={visible} onClose={onClose} maxHeight={0.9}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetInner}
      >
        {/* Header */}
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Organize Folders</Text>
          <Pressable
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityLabel="Close organize sheet"
            accessibilityRole="button"
            hitSlop={8}
          >
            <Ionicons name="close" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <Text style={styles.sheetHint}>
          Long-press a folder to rename or delete it. Tap a folder, then tap
          drafts to assign them.
        </Text>

        {manageMode.kind === 'none' ? (
          <>
            {/* New folder button */}
            <PressScale
              onPress={handleStartCreate}
              style={styles.newFolderBtn}
              accessibilityLabel="Create new folder"
              accessibilityRole="button"
              scale={0.97}
            >
              <Ionicons name="folder-open-outline" size={20} color={colors.brand} />
              <Text style={styles.newFolderText}>New Folder</Text>
              <Ionicons name="add" size={20} color={colors.brand} />
            </PressScale>

            {/* Folders list */}
            <ScrollView
              style={styles.scrollArea}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.sectionLabel}>FOLDERS</Text>
              {folders.length === 0 ? (
                <Text style={styles.emptyHint}>No folders yet. Create one above.</Text>
              ) : (
                folders.map((folder) => {
                  const isSelected = selectedFolderId === folder.id;
                  return (
                    <Pressable
                      key={folder.id}
                      onPress={() => handleSelectFolder(folder.id)}
                      onLongPress={() => handleStartRename(folder)}
                      delayLongPress={350}
                      style={({ pressed }) => [
                        styles.folderRow,
                        isSelected && styles.folderRowSelected,
                        pressed && { opacity: 0.7 },
                      ]}
                      accessibilityLabel={`Folder ${folder.name}, ${folder.draftCount ?? 0} drafts`}
                      accessibilityHint="Tap to select for assigning drafts. Long-press to rename or delete."
                      accessibilityRole="button"
                    >
                      <Ionicons
                        name={isSelected ? 'folder' : 'folder-outline'}
                        size={22}
                        color={isSelected ? colors.brand : colors.textSecondary}
                      />
                      <View style={styles.folderInfo}>
                        <Text
                          style={[
                            styles.folderName,
                            isSelected && styles.folderNameSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {folder.name}
                        </Text>
                        <Text style={styles.folderCount}>
                          {folder.draftCount ?? 0} {(folder.draftCount ?? 0) === 1 ? 'draft' : 'drafts'}
                        </Text>
                      </View>
                      {isSelected && (
                        <View style={styles.folderActions}>
                          <Pressable
                            onPress={() => handleStartRename(folder)}
                            style={styles.folderActionBtn}
                            accessibilityLabel={`Rename folder ${folder.name}`}
                            accessibilityRole="button"
                            hitSlop={8}
                          >
                            <Ionicons name="create-outline" size={18} color={colors.textSecondary} />
                          </Pressable>
                          <Pressable
                            onPress={() => handleStartDelete(folder)}
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

              {/* Draft assignment section */}
              {targetFolder && (
                <View style={styles.assignSection}>
                  <View style={styles.assignHeader}>
                    <Text style={styles.assignTitle} numberOfLines={1}>
                      Assign to &ldquo;{targetFolder.name}&rdquo;
                    </Text>
                    {selectedDraftIds.size > 0 && (
                      <Pressable
                        onPress={handleAssignSelected}
                        style={({ pressed }) => [
                          styles.assignConfirmBtn,
                          pressed && { opacity: 0.8 },
                        ]}
                        accessibilityLabel={`Move ${selectedDraftIds.size} drafts to ${targetFolder.name}`}
                        accessibilityRole="button"
                      >
                        <Text style={styles.assignConfirmText}>
                          Move {selectedDraftIds.size}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                  <Text style={styles.assignHint}>
                    Tap drafts to select, then confirm.
                  </Text>
                  {drafts.map((draft) => {
                    const isSelected = selectedDraftIds.has(draft.id);
                    const inThisFolder = draft.folderId === targetFolder.id;
                    return (
                      <Pressable
                        key={draft.id}
                        onPress={() => handleToggleDraft(draft.id)}
                        style={({ pressed }) => [
                          styles.draftPickRow,
                          isSelected && styles.draftPickRowSelected,
                          pressed && { opacity: 0.7 },
                        ]}
                        accessibilityLabel={`Draft ${draft.title}${inThisFolder ? ', already in this folder' : ''}`}
                        accessibilityRole="button"
                      >
                        <Ionicons
                          name={
                            isSelected
                              ? 'checkmark-circle'
                              : inThisFolder
                                ? 'folder'
                                : 'ellipse-outline'
                          }
                          size={20}
                          color={
                            isSelected
                              ? colors.brand
                              : inThisFolder
                                ? colors.textMuted
                                : colors.border
                          }
                        />
                        <View style={styles.draftPickInfo}>
                          <Text style={styles.draftPickTitle} numberOfLines={1}>
                            {draft.title}
                          </Text>
                          <Text style={styles.draftPickMeta} numberOfLines={1}>
                            {draft.type === 'look' ? 'Look' : 'Poster'} ·{' '}
                            {new Date(draft.updatedAt).toLocaleDateString()}
                          </Text>
                        </View>
                        {inThisFolder && (
                          <Pressable
                            onPress={() => handleUnfile(draft.id)}
                            style={styles.draftPickRemove}
                            accessibilityLabel={`Remove ${draft.title} from folder`}
                            accessibilityRole="button"
                            hitSlop={8}
                          >
                            <Ionicons name="remove-circle-outline" size={18} color={colors.danger} />
                          </Pressable>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {/* Quick-move section when no folder is selected */}
              {!targetFolder && drafts.length > 0 && (
                <View style={styles.quickMoveSection}>
                  <Text style={styles.sectionLabel}>DRAFTS</Text>
                  {drafts.map((draft) => (
                    <View key={draft.id} style={styles.quickMoveRow}>
                      <View style={styles.quickMoveInfo}>
                        <Text style={styles.quickMoveTitle} numberOfLines={1}>
                          {draft.title}
                        </Text>
                        <Text style={styles.quickMoveFolder} numberOfLines={1}>
                          {draft.folderId
                            ? folders.find((f) => f.id === draft.folderId)?.name ?? 'Folder'
                            : 'Unfiled'}
                        </Text>
                      </View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {folders.map((folder) => {
                          const isCurrent = draft.folderId === folder.id;
                          return (
                            <Pressable
                              key={folder.id}
                              onPress={() =>
                                !isCurrent && handleMoveToFolder(draft.id, folder.id)
                              }
                              disabled={isCurrent}
                              style={({ pressed }) => [
                                styles.quickChip,
                                isCurrent ? styles.quickChipActive : styles.quickChipInactive,
                                pressed && { opacity: 0.7 },
                              ]}
                              accessibilityLabel={`Move ${draft.title} to ${folder.name}`}
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
                        {draft.folderId && (
                          <Pressable
                            onPress={() => handleUnfile(draft.id)}
                            style={({ pressed }) => [
                              styles.quickChip,
                              styles.quickChipUnfile,
                              pressed && { opacity: 0.7 },
                            ]}
                            accessibilityLabel={`Remove ${draft.title} from any folder`}
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

              {unfiledDrafts.length > 0 && !targetFolder && folders.length > 0 && (
                <Text style={styles.footerHint}>
                  {unfiledDrafts.length} unfiled {unfiledDrafts.length === 1 ? 'draft' : 'drafts'}
                </Text>
              )}
            </ScrollView>
          </>
        ) : (
          /* Manage mode — create / rename / delete */
          <View style={styles.managePanel}>
            {manageMode.kind === 'delete' ? (
              <>
                <Text style={styles.manageTitle}>Delete folder?</Text>
                <Text style={styles.manageBody}>
                  &ldquo;{manageMode.folder.name}&rdquo; will be removed. Its drafts
                  will remain in All Projects.
                </Text>
                <Pressable
                  onPress={handleConfirmManage}
                  style={({ pressed }) => [
                    styles.manageDangerBtn,
                    pressed && { opacity: 0.85 },
                  ]}
                  accessibilityLabel="Confirm delete folder"
                  accessibilityRole="button"
                >
                  <Text style={styles.manageDangerText}>Delete Folder</Text>
                </Pressable>
                <Pressable
                  onPress={handleCancelManage}
                  style={({ pressed }) => [
                    styles.manageCancelBtn,
                    pressed && { opacity: 0.7 },
                  ]}
                  accessibilityLabel="Cancel"
                  accessibilityRole="button"
                >
                  <Text style={styles.manageCancelText}>Cancel</Text>
                </Pressable>
              </>
            ) : (
              <>
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
                  onSubmitEditing={handleConfirmManage}
                  accessibilityLabel="Folder name"
                />
                <Pressable
                  onPress={handleConfirmManage}
                  style={({ pressed }) => [
                    styles.manageConfirmBtn,
                    !nameInput.trim() && styles.manageConfirmDisabled,
                    pressed && { opacity: 0.85 },
                  ]}
                  disabled={!nameInput.trim()}
                  accessibilityLabel={
                    manageMode.kind === 'create' ? 'Create folder' : 'Save folder name'
                  }
                  accessibilityRole="button"
                >
                  <Text style={styles.manageConfirmText}>
                    {manageMode.kind === 'create' ? 'Create' : 'Save'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleCancelManage}
                  style={({ pressed }) => [
                    styles.manageCancelBtn,
                    pressed && { opacity: 0.7 },
                  ]}
                  accessibilityLabel="Cancel"
                  accessibilityRole="button"
                >
                  <Text style={styles.manageCancelText}>Cancel</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </SheetContainer>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    sheetInner: {
      flex: 1,
      paddingHorizontal: Space.md,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm,
    },
    sheetTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.subtitle.size,
      color: colors.textPrimary,
    },
    closeBtn: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sheetHint: {
      fontFamily: Typography.family.regular,
      fontSize: Type.caption.size,
      color: colors.textSecondary,
      marginBottom: Space.md,
      lineHeight: Type.caption.lineHeight,
    },
    newFolderBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.sm,
      paddingVertical: Space.md,
      borderRadius: Radius.lg,
      backgroundColor: colors.brandSubtle,
      marginBottom: Space.md,
    },
    newFolderText: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.bodyEmphasis.size,
      color: colors.brand,
    },
    scrollArea: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: Space.lg,
    },
    sectionLabel: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.metaElevated.size,
      letterSpacing: Type.metaElevated.letterSpacing,
      color: colors.textMuted,
      marginTop: Space.sm,
      marginBottom: Space.xs,
    },
    emptyHint: {
      fontFamily: Typography.family.regular,
      fontSize: Type.body.size,
      color: colors.textSecondary,
      paddingVertical: Space.md,
    },
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
      backgroundColor: 'transparent',
    },
    folderInfo: {
      flex: 1,
      gap: 2,
    },
    folderName: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.bodyEmphasis.size,
      color: colors.textPrimary,
    },
    folderNameSelected: {
      color: colors.brand,
    },
    folderCount: {
      fontFamily: Typography.family.regular,
      fontSize: Type.caption.size,
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
      fontSize: Type.bodyEmphasis.size,
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
      fontSize: Type.body.size,
      color: colors.textInverse,
    },
    assignHint: {
      fontFamily: Typography.family.regular,
      fontSize: Type.caption.size,
      color: colors.textSecondary,
      marginTop: Space.xs,
      marginBottom: Space.sm,
    },
    draftPickRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    draftPickRowSelected: {
      backgroundColor: 'transparent',
    },
    draftPickInfo: {
      flex: 1,
      gap: 2,
    },
    draftPickTitle: {
      fontFamily: Typography.family.medium,
      fontSize: Type.body.size,
      color: colors.textPrimary,
    },
    draftPickMeta: {
      fontFamily: Typography.family.regular,
      fontSize: Type.caption.size,
      color: colors.textSecondary,
    },
    draftPickRemove: {
      width: Control.hit,
      height: Control.hit,
      justifyContent: 'center',
      alignItems: 'center',
    },
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
      fontSize: Type.body.size,
      color: colors.textPrimary,
    },
    quickMoveFolder: {
      fontFamily: Typography.family.regular,
      fontSize: Type.caption.size,
      color: colors.textSecondary,
    },
    quickChip: {
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      marginRight: Space.xs,
      minHeight: Control.hit,
      justifyContent: 'center',
    },
    quickChipActive: {
      backgroundColor: 'transparent',
    },
    quickChipInactive: {
      backgroundColor: 'transparent',
    },
    quickChipUnfile: {
      backgroundColor: 'transparent',
    },
    quickChipText: {
      fontFamily: FontFamily.medium,
      fontSize: Type.body.size,
    },
    quickChipTextActive: {
      color: colors.brand,
      textDecorationLine: 'underline',
    },
    quickChipTextInactive: {
      color: colors.textSecondary,
    },
    quickChipTextUnfile: {
      color: colors.danger,
      fontFamily: FontFamily.medium,
      fontSize: Type.body.size,
    },
    footerHint: {
      fontFamily: Typography.family.regular,
      fontSize: Type.caption.size,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: Space.lg,
    },
    // ── Manage mode ──
    managePanel: {
      paddingVertical: Space.md,
    },
    manageTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.subtitle.size,
      color: colors.textPrimary,
      textAlign: 'center',
      marginTop: Space.sm,
    },
    manageBody: {
      fontFamily: Typography.family.regular,
      fontSize: Type.body.size,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: Space.xs,
      marginBottom: Space.lg,
    },
    nameInput: {
      fontFamily: Typography.family.regular,
      fontSize: Type.bodyEmphasis.size,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: Radius.lg,
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
      marginBottom: Space.md,
    },
    manageConfirmBtn: {
      backgroundColor: colors.brand,
      paddingVertical: Space.md,
      borderRadius: Radius.lg,
      alignItems: 'center',
      marginBottom: Space.sm,
    },
    manageConfirmDisabled: {
      opacity: 0.4,
    },
    manageConfirmText: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.bodyEmphasis.size,
      color: colors.textInverse,
    },
    manageDangerBtn: {
      backgroundColor: colors.danger,
      paddingVertical: Space.md,
      borderRadius: Radius.lg,
      alignItems: 'center',
      marginBottom: Space.sm,
    },
    manageDangerText: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.bodyEmphasis.size,
      color: colors.textInverse,
    },
    manageCancelBtn: {
      paddingVertical: Space.md,
      borderRadius: Radius.lg,
      alignItems: 'center',
    },
    manageCancelText: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.body.size,
      color: colors.textSecondary,
    },
  });
}
