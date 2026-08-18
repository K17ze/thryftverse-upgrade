/**
 * ProjectFolderOrganizeMode — full-screen organize mode for project
 * folders (Meta Edits August 2026 pattern).
 *
 * Entered via long-press on a project in the draft list. Provides:
 *   - Drag-and-drop projects into folders (Reanimated gestures)
 *   - Create new folder button
 *   - Rename folder (tap folder name)
 *   - Delete folder (with confirmation)
 *   - Haptics on drag start / drop
 *
 * Uses the ProjectFolderStore Zustand store for all mutations — every
 * change is persisted to AsyncStorage in real time.
 */
import React, { useState, useCallback, useMemo, useRef } from 'react';
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
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useMotionConfig } from '../hooks/useMotionConfig';
import { PressScale } from './CreatorAnimations';
import {
  useProjectFolderStore,
  findFolderForProject,
} from './core/projectStore/ProjectFolderStore';
import type { ProjectFolder } from './core/projectStore/ProjectFolderTypes';

// ── Props ───────────────────────────────────────────────────────────

export interface ProjectOrganizeItem {
  id: string;
  title: string;
  type: 'look' | 'poster';
}

interface ProjectFolderOrganizeModeProps {
  visible: boolean;
  onClose: () => void;
  projects: ProjectOrganizeItem[];
}

// ── Manage mode ─────────────────────────────────────────────────────

type ManageMode =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'rename'; folder: ProjectFolder }
  | { kind: 'delete'; folder: ProjectFolder };

// ── Component ───────────────────────────────────────────────────────

export function ProjectFolderOrganizeMode({
  visible,
  onClose,
  projects,
}: ProjectFolderOrganizeModeProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const reduceMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const folders = useProjectFolderStore((s) => s.folders);
  const createFolder = useProjectFolderStore((s) => s.createFolder);
  const renameFolder = useProjectFolderStore((s) => s.renameFolder);
  const deleteFolder = useProjectFolderStore((s) => s.deleteFolder);
  const moveProjectToFolder = useProjectFolderStore((s) => s.moveProjectToFolder);

  const [manageMode, setManageMode] = useState<ManageMode>({ kind: 'none' });
  const [nameInput, setNameInput] = useState('');
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null);
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(null);

  // ── Drag state ──
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const dragStartX = useSharedValue(0);
  const dragStartY = useSharedValue(0);
  const dragScale = useSharedValue(1);
  const folderLayouts = useRef<Map<string, { x: number; y: number; width: number; height: number }>>(new Map());
  const rootDropLayout = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  // Reset state when modal closes
  React.useEffect(() => {
    if (!visible) {
      setManageMode({ kind: 'none' });
      setNameInput('');
      setDraggingProjectId(null);
      setDropTargetFolderId(null);
    }
  }, [visible]);

  // ── Folder management ──
  const handleStartCreate = useCallback(() => {
    haptic.light();
    setManageMode({ kind: 'create' });
    setNameInput('');
  }, [haptic]);

  const handleStartRename = useCallback(
    (folder: ProjectFolder) => {
      haptic.heavy();
      setManageMode({ kind: 'rename', folder });
      setNameInput(folder.name);
    },
    [haptic],
  );

  const handleStartDelete = useCallback(
    (folder: ProjectFolder) => {
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
      createFolder(trimmed);
      haptic.success();
      setManageMode({ kind: 'none' });
      setNameInput('');
    } else if (manageMode.kind === 'rename') {
      const trimmed = nameInput.trim();
      if (!trimmed) {
        haptic.error();
        return;
      }
      renameFolder(manageMode.folder.id, trimmed);
      haptic.success();
      setManageMode({ kind: 'none' });
      setNameInput('');
    } else if (manageMode.kind === 'delete') {
      deleteFolder(manageMode.folder.id);
      haptic.warning();
      setManageMode({ kind: 'none' });
    }
  }, [manageMode, nameInput, createFolder, renameFolder, deleteFolder, haptic]);

  const handleCancelManage = useCallback(() => {
    haptic.light();
    setManageMode({ kind: 'none' });
    setNameInput('');
  }, [haptic]);

  // ── Drag-to-folder ──
  const checkDropTarget = useCallback(
    (x: number, y: number) => {
      // Check root drop zone first
      const root = rootDropLayout.current;
      if (root) {
        if (
          x >= root.x && x <= root.x + root.width &&
          y >= root.y && y <= root.y + root.height
        ) {
          if (dropTargetFolderId !== null) {
            setDropTargetFolderId(null);
            haptic.selection();
          }
          return;
        }
      }
      // Check folder drop zones
      for (const [folderId, layout] of folderLayouts.current) {
        if (
          x >= layout.x && x <= layout.x + layout.width &&
          y >= layout.y && y <= layout.y + layout.height
        ) {
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
    (projectId: string, startX: number, startY: number) => {
      haptic.medium();
      setDraggingProjectId(projectId);
      dragStartX.value = startX;
      dragStartY.value = startY;
      dragX.value = startX;
      dragY.value = startY;
      dragScale.value = reduceMotion ? 1.1 : withSpring(1.1, spring.entrance);
    },
    [haptic, dragStartX, dragStartY, dragX, dragY, dragScale, reduceMotion, spring],
  );

  const handleDragEnd = useCallback(
    (finalX: number, finalY: number) => {
      const projectId = draggingProjectId;
      if (!projectId) return;

      // Determine drop target
      let targetFolderId: string | null = null;
      const root = rootDropLayout.current;
      if (root) {
        if (
          finalX >= root.x && finalX <= root.x + root.width &&
          finalY >= root.y && finalY <= root.y + root.height
        ) {
          targetFolderId = null;
        }
      }
      if (targetFolderId === null) {
        for (const [folderId, layout] of folderLayouts.current) {
          if (
            finalX >= layout.x && finalX <= layout.x + layout.width &&
            finalY >= layout.y && finalY <= layout.y + layout.height
          ) {
            targetFolderId = folderId;
            break;
          }
        }
      }

      // Only move if we found a folder target (root is handled by null)
      const currentFolder = findFolderForProject(folders, projectId);
      const currentFolderId = currentFolder?.id ?? null;

      if (targetFolderId !== currentFolderId) {
        moveProjectToFolder(projectId, targetFolderId);
        haptic.success();
      } else {
        haptic.light();
      }

      setDraggingProjectId(null);
      setDropTargetFolderId(null);
      dragScale.value = reduceMotion ? 1 : withSpring(1, spring.settle);
    },
    [draggingProjectId, folders, moveProjectToFolder, haptic, reduceMotion, spring, dragScale],
  );

  // ── Pan gesture for dragging projects ──
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(8)
        .onStart((e) => {
          runOnJS(handleDragStart)(
            draggingProjectId ?? '',
            e.absoluteX,
            e.absoluteY,
          );
        })
        .onUpdate((e) => {
          dragX.value = e.absoluteX;
          dragY.value = e.absoluteY;
          runOnJS(checkDropTarget)(e.absoluteX, e.absoluteY);
        })
        .onEnd((e) => {
          runOnJS(handleDragEnd)(e.absoluteX, e.absoluteY);
        }),
    [dragX, dragY, checkDropTarget, handleDragStart, handleDragEnd, draggingProjectId],
  );

  // ── Derived data ──
  const unfiledProjects = useMemo(
    () => {
      const filedIds = new Set<string>();
      for (const f of folders) {
        for (const pid of f.projectIds) filedIds.add(pid);
      }
      return projects.filter((p) => !filedIds.has(p.id));
    },
    [projects, folders],
  );

  const getProjectsInFolder = useCallback(
    (folder: ProjectFolder) => {
      return projects.filter((p) => folder.projectIds.includes(p.id));
    },
    [projects],
  );

  // ── Dragging item display ──
  const draggingProject = draggingProjectId
    ? projects.find((p) => p.id === draggingProjectId)
    : null;

  const dragItemStyle = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: dragX.value - 60,
    top: dragY.value - 30,
    transform: [{ scale: dragScale.value }],
    opacity: draggingProjectId ? 0.9 : 0,
    zIndex: 1000,
  }));

  // ── Render ──
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityLabel="Done organizing"
            accessibilityRole="button"
            hitSlop={8}
          >
            <Ionicons name="checkmark" size={24} color={colors.brand} />
          </Pressable>
          <Text style={styles.headerTitle}>Organize</Text>
          <View style={styles.headerSpacer} />
        </View>

        <Text style={styles.hint}>
          Drag projects into folders. Tap a folder name to rename.
          Long-press a folder for more options.
        </Text>

        {manageMode.kind === 'none' ? (
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
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
                dropTargetFolderId === null && draggingProjectId && styles.dropZoneActive,
              ]}
            >
              <View style={styles.dropZoneHeader}>
                <Ionicons
                  name={dropTargetFolderId === null && draggingProjectId ? 'folder-open' : 'folder-outline'}
                  size={18}
                  color={dropTargetFolderId === null && draggingProjectId ? colors.brand : colors.textSecondary}
                />
                <Text style={styles.dropZoneTitle}>All Projects</Text>
                <Text style={styles.dropZoneCount}>{unfiledProjects.length}</Text>
              </View>
              {unfiledProjects.length === 0 ? (
                <Text style={styles.emptyHint}>No unfiled projects</Text>
              ) : (
                unfiledProjects.map((project) => (
                  <DraggableProjectRow
                    key={project.id}
                    project={project}
                    folderName="All Projects"
                    colors={colors}
                    styles={styles}
                    panGesture={panGesture}
                    onDragStart={() => setDraggingProjectId(project.id)}
                    isDragging={draggingProjectId === project.id}
                  />
                ))
              )}
            </View>

            {/* Folders */}
            {folders.length === 0 && unfiledProjects.length === 0 && (
              <Text style={styles.emptyHint}>No folders yet. Create one above.</Text>
            )}
            {folders.map((folder) => {
              const folderProjects = getProjectsInFolder(folder);
              const isDropTarget = dropTargetFolderId === folder.id && draggingProjectId;
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
                      size={18}
                      color={isDropTarget ? colors.brand : colors.textSecondary}
                    />
                    <Pressable
                      onPress={() => handleStartRename(folder)}
                      onLongPress={() => handleStartDelete(folder)}
                      delayLongPress={500}
                      style={styles.folderNameBtn}
                      accessibilityLabel={`Folder ${folder.name}, ${folderProjects.length} projects. Tap to rename, long-press to delete.`}
                      accessibilityRole="button"
                    >
                      <Text style={styles.dropZoneTitle} numberOfLines={1}>
                        {folder.name}
                      </Text>
                    </Pressable>
                    <Text style={styles.dropZoneCount}>{folderProjects.length}</Text>
                    <Pressable
                      onPress={() => handleStartDelete(folder)}
                      style={styles.folderActionBtn}
                      accessibilityLabel={`Delete folder ${folder.name}`}
                      accessibilityRole="button"
                      hitSlop={8}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    </Pressable>
                  </View>
                  {folderProjects.length === 0 ? (
                    <Text style={styles.emptyHint}>Empty folder — drag projects here</Text>
                  ) : (
                    folderProjects.map((project) => (
                      <DraggableProjectRow
                        key={project.id}
                        project={project}
                        folderName={folder.name}
                        colors={colors}
                        styles={styles}
                        panGesture={panGesture}
                        onDragStart={() => setDraggingProjectId(project.id)}
                        isDragging={draggingProjectId === project.id}
                      />
                    ))
                  )}
                </View>
              );
            })}
          </ScrollView>
        ) : (
          /* Manage mode — create / rename / delete */
          <View style={styles.managePanel}>
            {manageMode.kind === 'delete' ? (
              <>
                <Text style={styles.manageTitle}>Delete folder?</Text>
                <Text style={styles.manageBody}>
                  &ldquo;{manageMode.folder.name}&rdquo; will be removed. Its
                  projects will move back to All Projects.
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

        {/* Floating dragged item */}
        {draggingProject && (
          <Reanimated.View style={[styles.dragItem, dragItemStyle]} pointerEvents="none">
            <Ionicons
              name={draggingProject.type === 'look' ? 'shirt-outline' : 'film-outline'}
              size={16}
              color={colors.textInverse}
            />
            <Text style={styles.dragItemText} numberOfLines={1}>
              {draggingProject.title}
            </Text>
          </Reanimated.View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Draggable project row ───────────────────────────────────────────

interface DraggableProjectRowProps {
  project: ProjectOrganizeItem;
  folderName: string;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  panGesture: ReturnType<typeof Gesture.Pan>;
  onDragStart: () => void;
  isDragging: boolean;
}

const DraggableProjectRow = React.memo(function DraggableProjectRow({
  project,
  folderName,
  colors,
  styles,
  panGesture,
  onDragStart,
  isDragging,
}: DraggableProjectRowProps) {
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
          styles.projectRow,
          isDragging && styles.projectRowDragging,
        ]}
        accessibilityLabel={`Project ${project.title} in ${folderName}. Long-press and drag to move.`}
        accessibilityRole="button"
      >
        <Ionicons
          name={project.type === 'look' ? 'shirt-outline' : 'film-outline'}
          size={16}
          color={colors.textSecondary}
        />
        <Text style={styles.projectTitle} numberOfLines={1}>
          {project.title}
        </Text>
        <Ionicons name="menu" size={16} color={colors.textMuted} />
      </Reanimated.View>
    </GestureDetector>
  );
});

// ── Styles ──────────────────────────────────────────────────────────

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    closeBtn: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.title.size,
      color: colors.textPrimary,
    },
    headerSpacer: {
      width: 44,
    },
    hint: {
      fontFamily: Typography.family.regular,
      fontSize: Type.caption.size,
      color: colors.textSecondary,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
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
      minHeight: 44,
    },
    newFolderText: {
      fontFamily: Typography.family.semibold,
      fontSize: Type.bodyStrong.size,
      color: colors.brand,
    },
    scrollArea: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.xl,
    },
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
      fontSize: Type.bodyStrong.size,
      color: colors.textPrimary,
    },
    dropZoneCount: {
      fontFamily: Typography.family.medium,
      fontSize: Type.caption.size,
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
    folderActionBtn: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyHint: {
      fontFamily: Typography.family.regular,
      fontSize: Type.caption.size,
      color: colors.textMuted,
      paddingVertical: Space.sm,
      textAlign: 'center',
    },
    projectRow: {
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
    projectRowDragging: {
      opacity: 0.4,
    },
    projectTitle: {
      flex: 1,
      fontFamily: Typography.family.medium,
      fontSize: Type.body.size,
      color: colors.textPrimary,
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
      fontSize: Type.caption.size,
      color: colors.textInverse,
      flex: 1,
    },
    // ── Manage mode ──
    managePanel: {
      flex: 1,
      padding: Space.lg,
      justifyContent: 'center',
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
      fontSize: Type.bodyStrong.size,
      color: colors.textPrimary,
      borderWidth: 1,
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
      fontSize: Type.bodyStrong.size,
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
      fontSize: Type.bodyStrong.size,
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
      fontSize: Type.body.size,
      color: colors.textSecondary,
    },
  });
}
