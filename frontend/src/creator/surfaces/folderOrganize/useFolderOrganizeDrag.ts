/**
 * useFolderOrganizeDrag — drag-mode state, drop-target detection, pan
 * gesture, and floating-drag-item style for the generic
 * FolderOrganizeSheet surface. Extracted verbatim from
 * FolderOrganizeSheet.tsx.
 */
import { useState, useCallback, useMemo, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import type { useHaptic } from '../../../hooks/useHaptic';
import type { useMotionConfig } from '../../../hooks/useMotionConfig';
import type {
  OrganizeFolder,
  OrganizeItem,
  FolderOrganizeAdapter,
} from '../FolderOrganizeSheet';

interface UseFolderOrganizeDragParams {
  items: OrganizeItem[];
  folders: OrganizeFolder[];
  adapter: FolderOrganizeAdapter;
  haptic: ReturnType<typeof useHaptic>;
  reduceMotion: boolean;
  spring: ReturnType<typeof useMotionConfig>['spring'];
  runMutation: (fn: () => Promise<void> | void, successHaptic: () => void) => Promise<void>;
  announceMove: (itemTitle: string, folderName: string | null) => void;
}

export function useFolderOrganizeDrag({
  items,
  folders,
  adapter,
  haptic,
  reduceMotion,
  spring,
  runMutation,
  announceMove,
}: UseFolderOrganizeDragParams) {
  // ── Drag state (drag mode only) ──
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(null);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const dragScale = useSharedValue(1);
  const folderLayouts = useRef<Map<string, { x: number; y: number; width: number; height: number }>>(new Map());
  const rootDropLayout = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

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

  const draggingItem = draggingItemId ? items.find((i) => i.id === draggingItemId) : null;

  const dragItemStyle = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: dragX.value - 60,
    top: dragY.value - 30,
    transform: [{ scale: dragScale.value }],
    opacity: draggingItemId ? 0.9 : 0,
    zIndex: 1000,
  }));

  return {
    draggingItemId,
    setDraggingItemId,
    dropTargetFolderId,
    setDropTargetFolderId,
    folderLayouts,
    rootDropLayout,
    panGesture,
    draggingItem,
    dragItemStyle,
  };
}
