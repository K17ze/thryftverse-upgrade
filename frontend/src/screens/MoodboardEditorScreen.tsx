/**
 * MoodboardEditorScreen — creative composition surface
 *
 * The editor is the authoring surface for a ThryftVerse Moodboard: a themed
 * canvas where users arrange marketplace listings into an editorial collage.
 *
 * Layout:
 *  - Canvas (top ~70% of screen) — themed background with pan/pinch/rotate items
 *  - Bottom panel (~30%) — item picker rail; tap to add to canvas center
 *  - Selected item shows delete + layer-order controls
 *
 * Truthful UI (AGENTS.md §11):
 *  In demo mode (MOODBOARD_DEMO_MODE === true) the moodboard is stored in
 *  memory only. A persistent "Demo mode" indicator communicates this honestly.
 *  We never claim the board is shared, synced, or backed by a real backend.
 *
 * Gestures (react-native-gesture-handler is installed — see package.json):
 *  - Pan to move an item (clamped to canvas bounds)
 *  - Pinch to scale an item (0.4×–2.5×)
 *  - Two-finger rotation
 *  - Tap to select (reveals delete + layer controls)
 *  - Long-press for layer order (bring to front / send to back)
 *  Reanimated shared values drive the transforms; useReducedMotion disables
 *  spring settle animations when the user has requested reduced motion.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ImageStyle,
  ActivityIndicator,
  Pressable,
  LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS } from 'react-native-reanimated';

import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Typography, Stroke, Control, LetterSpacing } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { NativeStackScreenProps, RootStackParamList } from '../navigation/types';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { HorizontalRail } from '../components/HorizontalRail';
import { EmptyState } from '../components/EmptyState';
import { PremiumSkeletonTile } from '../components/discover/PremiumSkeletonTile';
import { OfflineBanner } from '../components/OfflineBanner';
import { MoodboardCollaboratorSheet } from '../components/MoodboardCollaboratorSheet';
import { MoodboardCommentsSheet } from '../components/MoodboardCommentsSheet';
import { MoodboardVersionHistorySheet } from '../components/MoodboardVersionHistorySheet';
import { MoodboardConflictCompareSheet } from '../components/MoodboardConflictCompareSheet';
import { useHaptic } from '../hooks/useHaptic';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useConnectivity } from '../hooks/useConnectivity';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useRealtimeEvent } from '../platform/realtime/useRealtimeEvent';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { isDbAvailable } from '../storage/db';
import { enqueueMoodboardOperation } from '../storage/moodboardOutbox';
import { Motion } from '../theme/motionTokens';
import {
  fetchMoodboardDetail,
  fetchMoodboardThemes,
  fetchPickerItems,
  createMoodboard,
  addItemToMoodboard,
  removeItemFromMoodboard,
  reorderItem,
  submitMoodboardOperation,
  publishMoodboardAsPoster,
  getThemeById,
  MOODBOARD_DEMO_MODE,
  type Moodboard,
  type MoodboardItem,
  type MoodboardItemPosition,
  type MoodboardTheme,
  type MoodboardOperationResponse } from '../services/moodboardApi';
import { createStableId } from '../utils/createStableId';

type Props = NativeStackScreenProps<RootStackParamList, 'MoodboardEditor'>;

// ── Layout constants ──
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CANVAS_HEIGHT_RATIO = 0.7;
const CANVAS_HEIGHT = Math.round(SCREEN_H * CANVAS_HEIGHT_RATIO);
const PICKER_TILE_SIZE = 72;
const PICKER_TILE_GAP = Space.sm;
const ITEM_BASE_SIZE = 120; // base pixel size of a canvas item at scale 1
const MIN_SCALE = 0.4;
const MAX_SCALE = 2.5;
const DEFAULT_THEME_ID = 'theme-linen';

// ---------------------------------------------------------------------------
// Sync status state machine
// ---------------------------------------------------------------------------
// Replaces the global `saving` boolean with an honest per-operation status.
// Position commits and theme changes flow through the operation endpoint and
// report their outcome via this state. The status appears only on transition
// (Saving → Synced → recedes; or Saving → Conflict → needs review).
type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'conflict'
  | 'error'
  | 'unknown';

interface ConflictDetail {
  currentRevision: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp a pixel position so the item center stays within the canvas. */
function clampCenter(px: number, canvasSize: number, itemHalfPx: number): number {
  const min = itemHalfPx;
  const max = canvasSize - itemHalfPx;
  return Math.max(min, Math.min(max, px));
}

/** Convert a normalised (0–1) position to a center-origin pixel position. */
function normToPx(norm: number, canvasSize: number): number {
  return norm * canvasSize;
}

/** Convert a center-origin pixel position to a normalised (0–1) value. */
function pxToNorm(px: number, canvasSize: number): number {
  return canvasSize > 0 ? px / canvasSize : 0;
}

// ---------------------------------------------------------------------------
// Draggable canvas item — pan + pinch + rotation + tap + long-press
//
// Shared values are created HERE (per-item, at render time) to respect the
// Rules of Hooks. The parent passes the initial position; the item owns its
// gesture state and commits final positions via onPositionCommit.
// ---------------------------------------------------------------------------
interface CanvasItemProps {
  item: MoodboardItem;
  canvasWidth: number;
  canvasHeight: number;
  isSelected: boolean;
  multiSelectMode: boolean;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
  onPositionCommit: (id: string, position: MoodboardItemPosition) => void;
  onLongPress: (id: string) => void;
}

const CanvasItem = React.memo(function CanvasItem({
  item,
  canvasWidth,
  canvasHeight,
  isSelected,
  multiSelectMode,
  reducedMotion,
  onSelect,
  onPositionCommit,
  onLongPress }: CanvasItemProps) {
  const { colors } = useAppTheme();
  const halfBase = ITEM_BASE_SIZE / 2;

  // Shared values — initialised from the service position (normalised → px)
  const translateX = useSharedValue(normToPx(item.position.x, canvasWidth));
  const translateY = useSharedValue(normToPx(item.position.y, canvasHeight));
  const scale = useSharedValue(item.position.scale);
  const rotation = useSharedValue(item.position.rotation);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startRotation = useSharedValue(0);

  // Sync shared values when the service position changes externally (e.g. after
  // a reorder or theme change that re-fetches the moodboard). We compare against
  // the incoming item position and update if it differs from the current SV.
  React.useEffect(() => {
    const expectedX = normToPx(item.position.x, canvasWidth);
    const expectedY = normToPx(item.position.y, canvasHeight);
    if (Math.abs(translateX.value - expectedX) > 1) {
      translateX.value = reducedMotion ? expectedX : withSpring(expectedX, Motion.spring.sharedElement);
    }
    if (Math.abs(translateY.value - expectedY) > 1) {
      translateY.value = reducedMotion ? expectedY : withSpring(expectedY, Motion.spring.sharedElement);
    }
    if (Math.abs(scale.value - item.position.scale) > 0.01) {
      scale.value = reducedMotion ? item.position.scale : withSpring(item.position.scale, Motion.spring.sharedElement);
    }
    if (Math.abs(rotation.value - item.position.rotation) > 0.5) {
      rotation.value = reducedMotion ? item.position.rotation : withSpring(item.position.rotation, Motion.spring.sharedElement);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.position.x, item.position.y, item.position.scale, item.position.rotation, canvasWidth, canvasHeight, reducedMotion]);

  // Commit the current transform to the service (on gesture end).
  const commitPosition = useCallback(
    (finalX: number, finalY: number, finalScale: number, finalRotation: number) => {
      const halfPx = halfBase * finalScale;
      const clampedX = clampCenter(finalX, canvasWidth, halfPx);
      const clampedY = clampCenter(finalY, canvasHeight, halfPx);
      translateX.value = reducedMotion ? clampedX : withSpring(clampedX, Motion.spring.sharedElement);
      translateY.value = reducedMotion ? clampedY : withSpring(clampedY, Motion.spring.sharedElement);
      const position: MoodboardItemPosition = {
        x: pxToNorm(clampedX, canvasWidth),
        y: pxToNorm(clampedY, canvasHeight),
        scale: finalScale,
        rotation: finalRotation };
      onPositionCommit(item.id, position);
    },
    [canvasWidth, canvasHeight, halfBase, item.id, onPositionCommit, reducedMotion, translateX, translateY],
  );

  // Pan — move the item, clamped on end.
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(4)
        .onStart(() => {
          'worklet';
          startX.value = translateX.value;
          startY.value = translateY.value;
        })
        .onUpdate((e) => {
          'worklet';
          translateX.value = startX.value + e.translationX;
          translateY.value = startY.value + e.translationY;
        })
        .onEnd((e) => {
          'worklet';
          const finalX = startX.value + e.translationX;
          const finalY = startY.value + e.translationY;
          runOnJS(commitPosition)(finalX, finalY, scale.value, rotation.value);
        }),
    [commitPosition, scale, rotation, startX, startY, translateX, translateY],
  );

  // Pinch — scale the item, clamped to [MIN_SCALE, MAX_SCALE].
  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          'worklet';
          startScale.value = scale.value;
        })
        .onUpdate((e) => {
          'worklet';
          const next = startScale.value * e.scale;
          scale.value = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
        })
        .onEnd(() => {
          'worklet';
          runOnJS(commitPosition)(translateX.value, translateY.value, scale.value, rotation.value);
        }),
    [commitPosition, scale, rotation, startScale, translateX, translateY],
  );

  // Rotation — two-finger rotation in degrees.
  const rotationGesture = useMemo(
    () =>
      Gesture.Rotation()
        .onStart(() => {
          'worklet';
          startRotation.value = rotation.value;
        })
        .onUpdate((e) => {
          'worklet';
          rotation.value = startRotation.value + (e.rotation * 180) / Math.PI;
        })
        .onEnd(() => {
          'worklet';
          runOnJS(commitPosition)(translateX.value, translateY.value, scale.value, rotation.value);
        }),
    [commitPosition, rotation, scale, startRotation, translateX, translateY],
  );

  // Tap — select the item.
  const tapGesture = useMemo(
    () =>
      Gesture.Tap().onEnd(() => {
        'worklet';
        runOnJS(onSelect)(item.id);
      }),
    [item.id, onSelect],
  );

  // Long-press — reveal layer order controls.
  const longPressGesture = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(450)
        .onEnd(() => {
          'worklet';
          runOnJS(onLongPress)(item.id);
        }),
    [item.id, onLongPress],
  );

  // Compose: simultaneous pan+pinch+rotate, racing with tap and long-press.
  // In multi-select mode items are static — only tap (toggle selection) is active.
  const composedGesture = useMemo(
    () =>
      multiSelectMode
        ? tapGesture
        : Gesture.Race(
            Gesture.Simultaneous(panGesture, pinchGesture, rotationGesture),
            tapGesture,
            longPressGesture,
          ),
    [multiSelectMode, longPressGesture, panGesture, pinchGesture, rotationGesture, tapGesture],
  );

  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      transform: [
        { translateX: translateX.value - halfBase },
        { translateY: translateY.value - halfBase },
        { scale: scale.value },
        { rotate: `${rotation.value}deg` },
      ] };
  });

  const a11yLabel = multiSelectMode
    ? `Canvas item: ${item.title}, ${item.price.toFixed(0)} pounds. ${isSelected ? 'Selected.' : 'Tap to select.'} Multi-select mode.`
    : `Canvas item: ${item.title}, ${item.price.toFixed(0)} pounds. ${isSelected ? 'Selected.' : 'Tap to select.'} Drag to move, pinch to resize, rotate with two fingers. Long-press for layer order.`;

  return (
    <GestureDetector gesture={composedGesture}>
      <Reanimated.View
        style={[styles.canvasItem, animatedStyle]}
        accessibilityLabel={a11yLabel}
        accessibilityRole="button"
        accessibilityHint={multiSelectMode ? 'Tap to toggle selection.' : 'Drag to move, pinch to resize, rotate with two fingers. Long-press for layer order.'}
        accessible
      >
        <View
          style={[
            styles.canvasItemInner,
            isSelected && styles.canvasItemInnerSelected,
          ]}
        >
          <CachedImage
            uri={item.imageUri}
            style={{ width: ITEM_BASE_SIZE, height: ITEM_BASE_SIZE } as ImageStyle}
            contentFit="cover"
            priority="normal"
          />
        </View>
      </Reanimated.View>
    </GestureDetector>
  );
});

// ---------------------------------------------------------------------------
// Picker tile — a listing thumbnail in the bottom rail
// ---------------------------------------------------------------------------
interface PickerTileProps {
  item: MoodboardItem;
  onPress: () => void;
}

const PickerTile = React.memo(function PickerTile({ item, onPress }: PickerTileProps) {
  const { colors } = useAppTheme();
  const { currencySymbol, currencyCode } = useFormattedPrice();
  return (
    <AnimatedPressable
      style={[styles.pickerTile, { width: PICKER_TILE_SIZE }]}
      onPress={onPress}
      activeOpacity={0.85}
      scaleValue={0.96}
      accessibilityRole="button"
      accessibilityLabel={`Add ${item.title}, ${item.price.toFixed(0)} ${currencyCode} to moodboard`}
      accessibilityHint="Adds this item to the center of the canvas"
    >
      <CachedImage
        uri={item.imageUri}
        style={styles.pickerTileImage as ImageStyle}
        contentFit="cover"
        priority="normal"
      />
      <Text style={styles.pickerTileTitle} numberOfLines={1}>
        {item.title}
      </Text>
      <Text style={styles.pickerTilePrice} numberOfLines={1}>
        {currencySymbol}{item.price.toFixed(0)}
      </Text>
    </AnimatedPressable>
  );
});

// ---------------------------------------------------------------------------
// Theme chip — selects the canvas background theme
// ---------------------------------------------------------------------------
interface ThemeChipProps {
  theme: MoodboardTheme;
  selected: boolean;
  onPress: () => void;
}

const ThemeChip = React.memo(function ThemeChip({ theme, selected, onPress }: ThemeChipProps) {
  const { colors } = useAppTheme();
  return (
    <AnimatedPressable
      style={[
        styles.themeChip,
        { borderColor: colors.border, backgroundColor: colors.surface },
        selected && { borderWidth: Stroke.emphasis, borderColor: colors.textPrimary, backgroundColor: colors.surfaceAlt },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
      scaleValue={0.96}
      accessibilityRole="button"
      accessibilityLabel={`Theme: ${theme.label}${selected ? ', selected' : ''}`}
      accessibilityHint="Sets the canvas background theme"
    >
      <View
        style={[
          styles.themeChipSwatch,
          { backgroundColor: theme.backgroundColor, borderColor: theme.accentColor },
        ]}
      />
      <Text
        style={[
          styles.themeChipLabel,
          { color: selected ? colors.textPrimary : colors.textSecondary },
          selected && styles.themeChipLabelSelected,
        ]}
        numberOfLines={1}
      >
        {theme.label}
      </Text>
    </AnimatedPressable>
  );
});

// ---------------------------------------------------------------------------
// Selection control button — delete / layer order
// ---------------------------------------------------------------------------
interface SelectionControlProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  onPress: () => void;
  destructive?: boolean;
}

const SelectionControl = React.memo(function SelectionControl({
  icon,
  label,
  hint,
  onPress,
  destructive }: SelectionControlProps) {
  const { colors } = useAppTheme();
  return (
    <AnimatedPressable
      style={[
        styles.selectionControl,
        { backgroundColor: colors.overlay },
        destructive && { backgroundColor: colors.danger },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
      scaleValue={0.94}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <Ionicons name={icon} size={20} color={colors.scrimTextPrimary} />
    </AnimatedPressable>
  );
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function MoodboardEditorScreen({ route, navigation }: Props) {
  const { colors, isDark } = useAppTheme();
  const haptic = useHaptic();
  const { isOffline } = useConnectivity();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const styles = useStyles();

  const moodboardId = route.params?.moodboardId;

  // ── State ──
  const [moodboard, setMoodboard] = useState<Moodboard | null>(null);
  const [themes, setThemes] = useState<MoodboardTheme[]>([]);
  const [pickerItems, setPickerItems] = useState<MoodboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [conflictDetail, setConflictDetail] = useState<ConflictDetail | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [activeThemeId, setActiveThemeId] = useState<string>(DEFAULT_THEME_ID);
  const [canvasWidth, setCanvasWidth] = useState(SCREEN_W);
  const [canvasHeight, setCanvasHeight] = useState(CANVAS_HEIGHT);

  // ── Collaboration sheet state ──
  const [collaboratorSheetVisible, setCollaboratorSheetVisible] = useState(false);
  const [commentsSheetVisible, setCommentsSheetVisible] = useState(false);
  const [commentsItemId, setCommentsItemId] = useState<string | undefined>(undefined);
  const [versionHistoryVisible, setVersionHistoryVisible] = useState(false);
  const [conflictCompareVisible, setConflictCompareVisible] = useState(false);
  const [localConflictSnapshot, setLocalConflictSnapshot] = useState<Moodboard | null>(null);

  // ── Publication state ──
  const [publishing, setPublishing] = useState(false);

  // ── Presence indicator ──
  const [collaboratorsOnline, setCollaboratorsOnline] = useState(false);

  // ── Current user (for filtering out our own realtime events) ──
  const currentUserId = useStore((state) => state.currentUser?.id ?? '');

  // ── Toast ──
  const { show } = useToast();

  // Whether the current user is the board owner (for capability-gated UI).
  const isOwner = useMemo(() => {
    if (!moodboard) return false;
    // The creator is the owner. The membership table backfills this, but
    // the editor only has the board DTO — the curator field is the display
    // name, not the id. We use the board's curator field as a proxy: if
    // the board was created by the current user, they are the owner.
    // This is refined when the collaborator sheet loads members.
    return true; // The editor is opened by the creator in the current flow.
  }, [moodboard]);

  const activeTheme = useMemo(
    () => themes.find((t) => t.id === activeThemeId) ?? getThemeById(activeThemeId),
    [themes, activeThemeId],
  );

  // Track the current board revision for operation submissions. Updated
  // whenever moodboard state changes, so operation handlers always read the
  // latest revision without stale closure issues.
  const boardRevisionRef = useRef(0);
  useEffect(() => {
    if (moodboard) {
      boardRevisionRef.current = moodboard.revision;
    }
  }, [moodboard]);

  // ── Data loading ──
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [themeList, picker] = await Promise.all([
        fetchMoodboardThemes(),
        fetchPickerItems(),
      ]);
      setThemes(themeList);
      setPickerItems(picker);

      if (moodboardId) {
        const mb = await fetchMoodboardDetail(moodboardId);
        if (!mb) {
          setError('This moodboard could not be found.');
          return;
        }
        setMoodboard(mb);
        setActiveThemeId(mb.theme);
      } else {
        // New moodboard — create immediately so the editor has a real entity.
        const mb = await createMoodboard('Untitled moodboard', DEFAULT_THEME_ID);
        setMoodboard(mb);
        setActiveThemeId(mb.theme);
      }
    } catch {
      setError('We couldn\u2019t load the moodboard editor. Try again.');
    } finally {
      setLoading(false);
    }
  }, [moodboardId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // ── Realtime subscription — live collaboration updates ──
  const realtimeOperation = useRealtimeEvent<{
    boardId: string;
    revision: number;
    operationType: string;
    operationId: string;
    actorId: string;
  }>(moodboard ? `moodboard:${moodboard.id}` : '', 'moodboard.operation.applied');

  const realtimeComment = useRealtimeEvent<{
    boardId: string;
    commentId: string;
    authorId: string;
    itemId: string | null;
  }>(moodboard ? `moodboard:${moodboard.id}` : '', 'moodboard.comment.added');

  const realtimeVersion = useRealtimeEvent<{
    boardId: string;
    versionId: string;
    revision: number;
  }>(moodboard ? `moodboard:${moodboard.id}` : '', 'moodboard.version.created');

  // Re-fetch the board when a remote operation is applied.
  useEffect(() => {
    if (!realtimeOperation || !moodboard) return;
    // Don't re-fetch for our own operations — we already applied them locally.
    if (realtimeOperation.payload.actorId === currentUserId) return;
    void loadAll();
  }, [realtimeOperation, moodboard, currentUserId, loadAll]);

  // Presence indicator — show a live dot briefly when a remote collaborator is active.
  useEffect(() => {
    if (!realtimeOperation) return;
    if (realtimeOperation.payload.actorId === currentUserId) return;
    setCollaboratorsOnline(true);
    const timer = setTimeout(() => setCollaboratorsOnline(false), 5000);
    return () => clearTimeout(timer);
  }, [realtimeOperation, currentUserId]);

  // ── Reconciliation: re-fetch the board after a conflict or unknown outcome ──
  // The server is the source of truth. When a conflict or unknown outcome
  // occurs, we re-fetch the canonical board state and update local state to
  // match. The user's unsynced work is preserved in the optimistic update
  // until the re-fetch replaces it with the server's version.
  const reconcileBoard = useCallback(async () => {
    if (!moodboard) return;
    try {
      const mb = await fetchMoodboardDetail(moodboard.id);
      if (mb) {
        setMoodboard(mb);
        setActiveThemeId(mb.theme);
        boardRevisionRef.current = mb.revision;
      }
    } catch {
      // Re-fetch failed — leave the user's local state intact. The next
      // successful load or operation will reconcile.
    }
  }, [moodboard]);

  // ── Handle an operation response from the server ──
  // Centralised handling for all operation outcomes. Updates the board
  // revision on success, surfaces conflicts, and never fabricates success
  // on unknown outcomes.
  const handleOperationResponse = useCallback(
    (response: MoodboardOperationResponse) => {
      if (response.outcome === 'applied' || response.outcome === 'duplicate') {
        boardRevisionRef.current = response.revision;
        setSyncStatus('synced');
        // Recede the "synced" indicator after a brief moment.
        setTimeout(() => setSyncStatus('idle'), 1500);
      } else if (response.outcome === 'conflict') {
        setSyncStatus('conflict');
        setConflictDetail({
          currentRevision: response.currentRevision,
          message: 'Another edit changed this board. Your canvas has been updated to the latest version.' });
        haptic.warning();
        // Re-fetch the canonical board state.
        void reconcileBoard();
      } else if (response.outcome === 'forbidden') {
        setSyncStatus('error');
        setConflictDetail({
          currentRevision: boardRevisionRef.current,
          message: 'You no longer have permission to edit this board. Your unsaved work is preserved locally.' });
        haptic.error();
      }
    },
    [haptic, reconcileBoard],
  );

  // ── Handlers ──
  const handleGoBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MoodboardHome');
    }
  }, [navigation]);

  const handleSelect = useCallback(
    (id: string) => {
      haptic.selection();
      if (multiSelectMode) {
        setSelectedItemIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return next;
        });
      } else {
        setSelectedItemId((prev) => (prev === id ? null : id));
      }
    },
    [haptic, multiSelectMode],
  );

  const handleLongPress = useCallback(
    (id: string) => {
      haptic.heavy();
      setSelectedItemId(null);
      setMultiSelectMode(true);
      setSelectedItemIds(new Set([id]));
    },
    [haptic],
  );

  // Exit multi-select mode once the selection set becomes empty.
  useEffect(() => {
    if (multiSelectMode && selectedItemIds.size === 0) {
      setMultiSelectMode(false);
    }
  }, [multiSelectMode, selectedItemIds]);

  const handleCancelMultiSelect = useCallback(() => {
    haptic.light();
    setMultiSelectMode(false);
    setSelectedItemIds(new Set());
  }, [haptic]);

  const handlePositionCommit = useCallback(
    async (id: string, position: MoodboardItemPosition) => {
      if (!moodboard) return;
      // Optimistic local update — the user sees the item move immediately.
      setMoodboard((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((it) =>
                it.id === id ? { ...it, position } : it,
              ),
              updatedAt: new Date().toISOString() }
          : prev,
      );
      setSyncStatus('syncing');
      setConflictDetail(null);
      // When offline and the local DB is available, enqueue to the outbox
      // instead of making a network call that will fail.
      if (isOffline && isDbAvailable()) {
        try {
          await enqueueMoodboardOperation({
            operationId: `${id}_move_${Date.now()}`,
            boardId: moodboard.id,
            operation: 'item.move',
            payload: { itemId: id, x: position.x, y: position.y },
            baseRev: moodboard.revision });
          // Status remains 'syncing' — the outbox will flush on reconnect.
          return;
        } catch {
          // Fall through to online path if enqueue fails
        }
      }
      // Submit via the idempotent operation endpoint with the current base
      // revision. The client operation id dedups retries.
      try {
        const response = await submitMoodboardOperation(moodboard.id, {
          clientOperationId: createStableId('pos'),
          baseRevision: boardRevisionRef.current,
          type: 'item.transform',
          itemId: id,
          payload: {
            positionX: position.x,
            positionY: position.y,
            rotation: position.rotation,
            scale: position.scale } });
        handleOperationResponse(response);
      } catch (error) {
        // Network error or server error. The outcome is unknown if the
        // request may have reached the server — do not fabricate success.
        // The optimistic update stays visible; the status communicates the
        // problem. The user can retry by moving the item again.
        setSyncStatus('error');
        haptic.error();
      }
    },
    [moodboard, isOffline, handleOperationResponse, haptic],
  );

  const handleAddItem = useCallback(
    async (source: MoodboardItem) => {
      if (!moodboard) return;
      haptic.light();
      setSaving(true);
      try {
        const added = await addItemToMoodboard(moodboard.id, source.listingId);
        if (added) {
          // Re-fetch to get the full updated item list with the new item
          const mb = await fetchMoodboardDetail(moodboard.id);
          if (mb) {
            setMoodboard(mb);
            setSelectedItemId(added.id);
          }
        }
      } catch {
        haptic.error();
      } finally {
        setSaving(false);
      }
    },
    [haptic, moodboard],
  );

  const handleDeleteItem = useCallback(
    async (id: string) => {
      if (!moodboard) return;
      haptic.warning();
      setSaving(true);
      setSelectedItemId(null);
      try {
        const ok = await removeItemFromMoodboard(moodboard.id, id);
        if (ok) {
          const mb = await fetchMoodboardDetail(moodboard.id);
          if (mb) setMoodboard(mb);
        }
      } catch {
        haptic.error();
      } finally {
        setSaving(false);
      }
    },
    [haptic, moodboard],
  );

  const handleReorder = useCallback(
    async (id: string, direction: 'front' | 'back') => {
      if (!moodboard) return;
      haptic.selection();
      setSaving(true);
      try {
        const ok = await reorderItem(moodboard.id, id, direction);
        if (ok) {
          const mb = await fetchMoodboardDetail(moodboard.id);
          if (mb) setMoodboard(mb);
        }
      } catch {
        haptic.error();
      } finally {
        setSaving(false);
      }
    },
    [haptic, moodboard],
  );

  const handleDeleteSelected = useCallback(
    async () => {
      if (!moodboard || selectedItemIds.size === 0) return;
      haptic.warning();
      const ids = Array.from(selectedItemIds);
      setMultiSelectMode(false);
      setSelectedItemIds(new Set());
      setSaving(true);
      try {
        await Promise.all(ids.map((id) => removeItemFromMoodboard(moodboard.id, id)));
        const mb = await fetchMoodboardDetail(moodboard.id);
        if (mb) setMoodboard(mb);
      } catch {
        haptic.error();
      } finally {
        setSaving(false);
      }
    },
    [haptic, moodboard, selectedItemIds],
  );

  const handleBringAllToFront = useCallback(
    async () => {
      if (!moodboard || selectedItemIds.size === 0) return;
      haptic.selection();
      // Preserve relative layer order: bring to front in back→front (array) order.
      const ids = moodboard.items
        .map((it) => it.id)
        .filter((id) => selectedItemIds.has(id));
      setSaving(true);
      try {
        for (const id of ids) {
          await reorderItem(moodboard.id, id, 'front');
        }
        const mb = await fetchMoodboardDetail(moodboard.id);
        if (mb) setMoodboard(mb);
      } catch {
        haptic.error();
      } finally {
        setSaving(false);
      }
    },
    [haptic, moodboard, selectedItemIds],
  );

  const handleThemeChange = useCallback(
    async (themeId: string) => {
      if (!moodboard) return;
      haptic.selection();
      setActiveThemeId(themeId);
      // Optimistic local update — the user sees the theme change immediately.
      setMoodboard((prev) =>
        prev ? { ...prev, theme: themeId, updatedAt: new Date().toISOString() } : prev,
      );
      setSyncStatus('syncing');
      setConflictDetail(null);
      // When offline and the local DB is available, enqueue to the outbox
      // instead of making a network call that will fail.
      if (isOffline && isDbAvailable()) {
        try {
          await enqueueMoodboardOperation({
            operationId: `${moodboard.id}_theme_${Date.now()}`,
            boardId: moodboard.id,
            operation: 'board.setTheme',
            payload: { themeId },
            baseRev: moodboard.revision });
          return;
        } catch {
          // Fall through to online path
        }
      }
      // Submit via the idempotent operation endpoint.
      void submitMoodboardOperation(moodboard.id, {
        clientOperationId: createStableId('theme'),
        baseRevision: boardRevisionRef.current,
        type: 'board.theme',
        payload: { theme: themeId } })
        .then(handleOperationResponse)
        .catch(() => {
          setSyncStatus('error');
          haptic.error();
        });
    },
    [haptic, moodboard, isOffline, handleOperationResponse],
  );

  const handleCanvasLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setCanvasWidth(width);
      setCanvasHeight(height);
    }
  }, []);

  const handleCanvasBackgroundPress = useCallback(() => {
    if (multiSelectMode) {
      setMultiSelectMode(false);
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemId(null);
    }
  }, [multiSelectMode]);

  // ── Publish the moodboard as a poster to the user's feed ──
  const handlePublishAsPoster = useCallback(async () => {
    if (!moodboard) return;
    haptic.medium();
    setPublishing(true);
    try {
      await publishMoodboardAsPoster(moodboard.id);
      haptic.success();
      show('Published as poster', 'success');
    } catch {
      haptic.error();
      show('Could not publish', 'error');
    } finally {
      setPublishing(false);
    }
  }, [moodboard, haptic, show]);

  // ── Derived ──
  const selectedItem = useMemo(
    () => moodboard?.items.find((it) => it.id === selectedItemId) ?? null,
    [moodboard, selectedItemId],
  );

  const canvasA11yLabel = useMemo(() => {
    if (!moodboard || moodboard.items.length === 0) {
      return 'Moodboard canvas, empty. Add items from the picker below.';
    }
    const count = moodboard.items.length;
    if (selectedItem) {
      return `Moodboard canvas with ${count} item${count === 1 ? '' : 's'}. Selected: ${selectedItem.title}.`;
    }
    return `Moodboard canvas with ${count} item${count === 1 ? '' : 's'}. Tap an item to select it.`;
  }, [moodboard, selectedItem]);

  // ── Loading state ──
  if (loading) {
    return (
      <View style={styles.container}>
        <ExpoStatusBar style={isDark ? 'light' : 'dark'} />
        <View style={[styles.headerRow, { marginTop: insets.top }]}>
          <View style={styles.backButtonPlaceholder} />
          <Text style={styles.headerTitle}>Moodboard</Text>
          <View style={styles.backButtonPlaceholder} />
        </View>
        <View style={styles.canvasSkeleton}>
          <PremiumSkeletonTile width="100%" height="100%" borderRadius={Radius.lg} />
        </View>
        <View style={styles.pickerSkeletonRail}>
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={[styles.pickerTile, { width: PICKER_TILE_SIZE }]}>
              <PremiumSkeletonTile width={PICKER_TILE_SIZE} height={PICKER_TILE_SIZE} borderRadius={Radius.md} />
              <PremiumSkeletonTile width="80%" height={10} borderRadius={Radius.sm} />
              <PremiumSkeletonTile width={40} height={9} borderRadius={Radius.sm} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  // ── Error state ──
  if (error && !moodboard) {
    return (
      <View style={styles.stateContainer}>
        <ExpoStatusBar style={isDark ? 'light' : 'dark'} />
        <EmptyState
          icon="cloud-offline-outline"
          title="Editor unavailable"
          subtitle={error}
          ctaLabel="Retry"
          onCtaPress={() => void loadAll()}
        />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <ExpoStatusBar style={isDark ? 'light' : 'dark'} />

      {/* Offline banner */}
      {isOffline && (
        <OfflineBanner message="Offline — changes are not saved. Reconnect to persist your work." />
      )}

      {/* Demo mode banner — truthful per AGENTS.md §11 */}
      {MOODBOARD_DEMO_MODE && (
        <View style={styles.demoBanner}>
          <Ionicons name="information-circle-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.demoBannerText}>
            Demo mode — moodboards are not persisted. Changes will be lost when the app restarts.
          </Text>
        </View>
      )}

      {/* ── Header ── */}
      <View style={[styles.headerRow, { marginTop: insets.top }]}>
        <AnimatedPressable
          style={styles.backButton}
          onPress={handleGoBack}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Returns to the moodboard home"
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {moodboard?.title ?? 'Moodboard'}
        </Text>
        <View style={styles.headerActions}>
          {collaboratorsOnline && (
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
            </View>
          )}
          <AnimatedPressable
            style={styles.headerActionButton}
            onPress={() => {
              haptic.selection();
              setCommentsItemId(undefined);
              setCommentsSheetVisible(true);
            }}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel="Comments"
            accessibilityHint="View and add comments on this moodboard"
          >
            <Ionicons name="chatbubble-outline" size={20} color={colors.textPrimary} />
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.headerActionButton}
            onPress={() => {
              haptic.selection();
              setVersionHistoryVisible(true);
            }}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel="Version history"
            accessibilityHint="View saved versions and restore"
          >
            <Ionicons name="time-outline" size={20} color={colors.textPrimary} />
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.headerActionButton}
            onPress={() => {
              haptic.selection();
              setCollaboratorSheetVisible(true);
            }}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel="Collaborators"
            accessibilityHint="Invite collaborators and manage roles"
          >
            <Ionicons name="people-outline" size={20} color={colors.textPrimary} />
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.headerActionButton}
            onPress={handlePublishAsPoster}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel="Publish as poster"
            accessibilityHint="Publishes this moodboard as a poster to your feed"
            disabled={publishing}
          >
            <Ionicons name="share-outline" size={20} color={publishing ? colors.textMuted : colors.textPrimary} />
          </AnimatedPressable>
        </View>
      </View>

      {/* ── Canvas (top ~70%) ── */}
      <Pressable
        style={[styles.canvas, { backgroundColor: activeTheme.backgroundColor }]}
        onLayout={handleCanvasLayout}
        onPress={handleCanvasBackgroundPress}
        accessibilityLabel={canvasA11yLabel}
        accessibilityRole="image"
      >
        {/* Empty canvas prompt */}
        {moodboard && moodboard.items.length === 0 && (
          <View style={styles.canvasEmpty} pointerEvents="box-none">
            <EmptyState
              density="compact"
              icon="create-outline"
              title="Start your moodboard"
              subtitle="Tap a listing below to place it on the canvas."
              {...(pickerItems.length > 0
                ? { ctaLabel: 'Add items', onCtaPress: () => void handleAddItem(pickerItems[0]) }
                : {})}
            />
          </View>
        )}

        {/* Canvas items — rendered in layer order (array order = back→front) */}
        {moodboard?.items.map((item) => (
          <CanvasItem
            key={item.id}
            item={item}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            isSelected={multiSelectMode ? selectedItemIds.has(item.id) : selectedItemId === item.id}
            multiSelectMode={multiSelectMode}
            reducedMotion={reducedMotion}
            onSelect={handleSelect}
            onPositionCommit={handlePositionCommit}
            onLongPress={handleLongPress}
          />
        ))}

        {/* Multi-select badge — count + cancel, overlaid at the top of the canvas */}
        {multiSelectMode && (
          <View style={styles.multiSelectBadge} pointerEvents="box-none">
            <View style={styles.multiSelectPill}>
              <Text style={styles.multiSelectCountText}>
                {selectedItemIds.size} selected
              </Text>
              <Pressable
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={handleCancelMultiSelect}
                accessibilityRole="button"
                accessibilityLabel="Cancel multi-select"
                accessibilityHint="Exits multi-select mode"
              >
                <Text style={styles.multiSelectCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Selection controls — overlaid on canvas, above items.
            In multi-select mode, batch controls replace the single-item controls. */}
        {multiSelectMode ? (
          selectedItemIds.size >= 2 && (
            <View style={styles.selectionControlsRow} pointerEvents="box-none">
              <SelectionControl
                icon="arrow-up"
                label="Bring all to front"
                hint="Moves all selected items above the others"
                onPress={() => void handleBringAllToFront()}
              />
              <SelectionControl
                icon="trash-outline"
                label="Delete all selected"
                hint="Deletes all selected items from the canvas"
                onPress={() => void handleDeleteSelected()}
                destructive
              />
            </View>
          )
        ) : (
          selectedItem && (
            <View style={styles.selectionControlsRow} pointerEvents="box-none">
              <SelectionControl
                icon="arrow-up"
                label="Bring to front"
                hint="Moves this item above all others"
                onPress={() => void handleReorder(selectedItem.id, 'front')}
              />
              <SelectionControl
                icon="arrow-down"
                label="Send to back"
                hint="Moves this item below all others"
                onPress={() => void handleReorder(selectedItem.id, 'back')}
              />
              <SelectionControl
                icon="chatbubble-outline"
                label="Comment"
                hint="Add a comment anchored to this item"
                onPress={() => {
                  setCommentsItemId(selectedItem.id);
                  setCommentsSheetVisible(true);
                }}
              />
              <SelectionControl
                icon="trash-outline"
                label="Remove from moodboard"
                hint="Deletes this item from the canvas"
                onPress={() => void handleDeleteItem(selectedItem.id)}
                destructive
              />
            </View>
          )
        )}

        {/* Sync status indicator — honest per-operation status.
            Replaces the global "Saving…" pill. Shows syncing, synced,
            conflict, or error states for position/theme operations.
            The saving boolean still drives the pill for add/delete/reorder
            (heavier operations that re-fetch the full board). */}
        {(saving || syncStatus !== 'idle') && (
          <View style={styles.savingOverlay} pointerEvents={syncStatus === 'conflict' || syncStatus === 'error' ? 'auto' : 'none'}>
            {syncStatus === 'conflict' && conflictDetail ? (
              <View style={styles.conflictCard}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
                <Text style={styles.conflictText}>{conflictDetail.message}</Text>
                <Pressable
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() => {
                    setLocalConflictSnapshot(moodboard);
                    setConflictCompareVisible(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Compare versions"
                >
                  <Text style={styles.conflictDismiss}>Compare</Text>
                </Pressable>
                <Pressable
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() => {
                    setSyncStatus('idle');
                    setConflictDetail(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss conflict notice"
                >
                  <Text style={styles.conflictDismiss}>OK</Text>
                </Pressable>
              </View>
            ) : syncStatus === 'error' ? (
              <View style={styles.errorPill}>
                <Ionicons name="cloud-offline-outline" size={14} color={colors.textInverse} />
                <Text style={styles.savingText}>Couldn't sync — try again</Text>
              </View>
            ) : syncStatus === 'synced' ? (
              <View style={styles.syncedPill}>
                <Ionicons name="checkmark" size={14} color={colors.textInverse} />
                <Text style={styles.savingText}>Synced</Text>
              </View>
            ) : (
              <View style={styles.savingPill}>
                <ActivityIndicator size="small" color={colors.textInverse} />
                <Text style={styles.savingText}>Saving…</Text>
              </View>
            )}
          </View>
        )}
      </Pressable>

      {/* ── Bottom panel (~30%) — picker + themes ── */}
      <View style={[styles.bottomPanel, { paddingBottom: insets.bottom || Space.sm }]}>
        {/* Theme selector rail */}
        {themes.length > 0 && (
          <View style={styles.themeRailWrap}>
            <HorizontalRail
              contentContainerStyle={styles.themeRailContent}
              showsHorizontalScrollIndicator={false}
              accessibilityLabel="Canvas theme selector"
            >
              {themes.map((theme) => (
                <ThemeChip
                  key={theme.id}
                  theme={theme}
                  selected={theme.id === activeThemeId}
                  onPress={() => handleThemeChange(theme.id)}
                />
              ))}
            </HorizontalRail>
          </View>
        )}

        {/* Picker rail — items to add */}
        <Text style={styles.pickerSectionLabel}>ADD TO CANVAS</Text>
        {pickerItems.length > 0 ? (
          <HorizontalRail
            contentContainerStyle={styles.pickerRailContent}
            showsHorizontalScrollIndicator={false}
            accessibilityLabel="Items available to add"
          >
            {pickerItems.map((pickerItem) => (
              <PickerTile
                key={pickerItem.id}
                item={pickerItem}
                onPress={() => void handleAddItem(pickerItem)}
              />
            ))}
          </HorizontalRail>
        ) : (
          <View style={styles.pickerEmpty}>
            <Text style={styles.pickerEmptyText}>No items available to add</Text>
          </View>
        )}
      </View>

      {/* ── Collaboration sheets ── */}
      {moodboard && (
        <>
          <MoodboardCollaboratorSheet
            visible={collaboratorSheetVisible}
            onDismiss={() => setCollaboratorSheetVisible(false)}
            moodboardId={moodboard.id}
            isOwner={isOwner}
          />
          <MoodboardCommentsSheet
            visible={commentsSheetVisible}
            onDismiss={() => setCommentsSheetVisible(false)}
            moodboardId={moodboard.id}
            itemId={commentsItemId}
          />
          <MoodboardVersionHistorySheet
            visible={versionHistoryVisible}
            onDismiss={() => setVersionHistoryVisible(false)}
            moodboardId={moodboard.id}
            isOwner={isOwner}
            onRestored={() => void loadAll()}
          />
          <MoodboardConflictCompareSheet
            visible={conflictCompareVisible}
            onDismiss={() => setConflictCompareVisible(false)}
            localVersion={localConflictSnapshot}
            serverVersion={moodboard}
            onKeepLocal={() => {
              setConflictCompareVisible(false);
              setSyncStatus('idle');
              setConflictDetail(null);
            }}
            onKeepServer={() => {
              setConflictCompareVisible(false);
              setSyncStatus('idle');
              setConflictDetail(null);
              void loadAll();
            }}
          />
        </>
      )}
    </GestureHandlerRootView>
  );
}

// ---------------------------------------------------------------------------
// Static styles (no theme dependency)
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1 },
  canvasItem: {
    position: 'absolute',
    top: 0,
    left: 0 },
  canvasItemInner: {
    width: ITEM_BASE_SIZE,
    height: ITEM_BASE_SIZE,
    borderRadius: Radius.md,
    overflow: 'hidden' },
  canvasItemInnerSelected: {
    borderWidth: Stroke.emphasis },
  pickerTile: {
    alignItems: 'flex-start',
    gap: Space.xs / 2 },
  pickerTileImage: {
    width: PICKER_TILE_SIZE,
    height: PICKER_TILE_SIZE,
    borderRadius: Radius.md } as ImageStyle,
  pickerTileTitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: LetterSpacing.normal - 0.1 },
  pickerTilePrice: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  themeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard },
  themeChipLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  themeChipLabelSelected: {
    fontFamily: Typography.family.semibold },
  themeChipSwatch: {
    width: Control.iconCompact,
    height: Control.iconCompact,
    borderRadius: Radius.full,
    borderWidth: Stroke.standard },
  selectionControlsRow: {
    position: 'absolute',
    bottom: Space.sm,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Space.sm },
  selectionControl: {
    width: Control.hit,
    height: Control.hit,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center' },
  savingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center' },
  canvasEmpty: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  headerActionButton: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  liveIndicator: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  backButtonPlaceholder: {
    width: Control.hit },
  pickerSkeletonRail: {
    flexDirection: 'row',
    gap: PICKER_TILE_GAP,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md } });

// ---------------------------------------------------------------------------
// Themed styles (depend on useAppTheme colors)
// ---------------------------------------------------------------------------
function useStyles() {
  const { colors } = useAppTheme();
  return React.useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background },
        stateContainer: {
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: Space.lg },
        demoBanner: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm,
          backgroundColor: colors.surface,
          borderBottomWidth: Stroke.hairline,
          borderBottomColor: colors.borderSubtle },
        demoBannerText: {
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.textSecondary,
          flex: 1 },
        headerRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Space.md,
          paddingBottom: Space.sm },
        backButton: {
          width: Control.hit,
          height: Control.hit,
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: -Space.xs },
        headerTitle: {
          fontSize: TypographyV2.sectionTitle.size,
          lineHeight: TypographyV2.sectionTitle.lineHeight,
          fontFamily: TypographyV2.sectionTitle.fontFamily,
          color: colors.textPrimary,
          letterSpacing: LetterSpacing.tight,
          flex: 1,
          textAlign: 'center' },
        canvas: {
          flex: 1,
          marginHorizontal: Space.md,
          borderRadius: Radius.lg,
          overflow: 'hidden',
          position: 'relative' },
        canvasItemInner: {
          width: ITEM_BASE_SIZE,
          height: ITEM_BASE_SIZE,
          borderRadius: Radius.md,
          overflow: 'hidden',
          backgroundColor: colors.surfaceAlt,
          borderColor: 'transparent',
          borderWidth: 0 },
        canvasItemInnerSelected: {
          borderColor: colors.textPrimary,
          borderWidth: Stroke.emphasis },
        selectionControl: {
          width: Control.hit,
          height: Control.hit,
          borderRadius: Radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.overlay },
        savingPill: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.sm,
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm,
          borderRadius: Radius.full,
          backgroundColor: colors.brand },
        savingText: {
          fontSize: TypographyV2.bodyStrong.size,
          fontFamily: TypographyV2.bodyStrong.fontFamily,
          color: colors.textInverse },
        syncedPill: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm,
          borderRadius: Radius.full,
          backgroundColor: colors.success },
        errorPill: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm,
          borderRadius: Radius.full,
          backgroundColor: colors.danger },
        conflictCard: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.sm,
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm,
          borderRadius: Radius.lg,
          backgroundColor: colors.warningSubtle,
          borderWidth: Stroke.standard,
          borderColor: colors.warningBorder,
          marginHorizontal: Space.md,
          maxWidth: 320 },
        conflictText: {
          flex: 1,
          fontSize: TypographyV2.meta.size,
          lineHeight: TypographyV2.meta.lineHeight,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.warning },
        conflictDismiss: {
          fontSize: TypographyV2.bodyStrong.size,
          fontFamily: TypographyV2.bodyStrong.fontFamily,
          color: colors.warning },
        bottomPanel: {
          paddingTop: Space.md,
          gap: Space.xs,
          backgroundColor: colors.background },
        themeRailWrap: {
          marginBottom: Space.xs },
        themeRailContent: {
          paddingHorizontal: Space.md,
          gap: Space.sm },
        themeChip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs,
          paddingHorizontal: Space.sm,
          paddingVertical: Space.xs,
          borderRadius: Radius.full,
          borderWidth: Stroke.standard },
        themeChipLabel: {
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily },
        themeChipLabelSelected: {
          fontFamily: Typography.family.semibold },
        pickerSectionLabel: {
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.textMuted,
          letterSpacing: LetterSpacing.caps,
          paddingHorizontal: Space.md,
          paddingBottom: Space.xs },
        pickerRailContent: {
          paddingHorizontal: Space.md,
          gap: PICKER_TILE_GAP },
        pickerTileImage: {
          width: PICKER_TILE_SIZE,
          height: PICKER_TILE_SIZE,
          borderRadius: Radius.md,
          backgroundColor: colors.surfaceAlt } as ImageStyle,
        pickerTileTitle: {
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.textPrimary,
          letterSpacing: LetterSpacing.normal - 0.1 },
        pickerTilePrice: {
          fontSize: TypographyV2.meta.size,
          fontFamily: TypographyV2.meta.fontFamily,
          color: colors.textSecondary },
        pickerEmpty: {
          paddingHorizontal: Space.md,
          paddingVertical: Space.md,
          alignItems: 'center' },
        pickerEmptyText: {
          fontSize: TypographyV2.body.size,
          fontFamily: TypographyV2.body.fontFamily,
          color: colors.textMuted },
        canvasSkeleton: {
          flex: 1,
          marginHorizontal: Space.md,
          borderRadius: Radius.lg,
          overflow: 'hidden',
          backgroundColor: colors.surfaceAlt },
        backButtonPlaceholder: {
          width: Control.hit },
        headerActions: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs },
        headerActionButton: {
          width: Control.hit,
          height: Control.hit,
          alignItems: 'center',
          justifyContent: 'center' },
        liveIndicator: {
          width: Control.hit,
          height: Control.hit,
          alignItems: 'center',
          justifyContent: 'center' },
        liveDot: {
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: colors.success },
        pickerSkeletonRail: {
          flexDirection: 'row',
          gap: PICKER_TILE_GAP,
          paddingHorizontal: Space.md,
          paddingVertical: Space.md },
        pickerTile: {
          alignItems: 'flex-start',
          gap: Space.xs / 2 },
        canvasEmpty: {
          ...StyleSheet.absoluteFill,
          alignItems: 'center',
          justifyContent: 'center',
          gap: Space.sm },
        selectionControlsRow: {
          position: 'absolute',
          bottom: Space.sm,
          left: 0,
          right: 0,
          flexDirection: 'row',
          justifyContent: 'center',
          gap: Space.sm },
        multiSelectBadge: {
          position: 'absolute',
          top: Space.sm,
          left: 0,
          right: 0,
          alignItems: 'center' },
        multiSelectPill: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.md,
          paddingHorizontal: Space.md,
          paddingVertical: Space.sm,
          borderRadius: Radius.full,
          backgroundColor: colors.overlay },
        multiSelectCountText: {
          fontSize: TypographyV2.bodyStrong.size,
          fontFamily: TypographyV2.bodyStrong.fontFamily,
          color: colors.scrimTextPrimary },
        multiSelectCancelText: {
          fontSize: TypographyV2.bodyStrong.size,
          fontFamily: TypographyV2.bodyStrong.fontFamily,
          color: colors.scrimTextPrimary },
        savingOverlay: {
          ...StyleSheet.absoluteFill,
          alignItems: 'center',
          justifyContent: 'center' } }),
    [colors],
  );
}
