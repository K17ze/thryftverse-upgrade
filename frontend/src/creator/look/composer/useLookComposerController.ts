/**
 * useLookComposerController — composition root for the Look composer's
 * state, handlers, and derived data.
 *
 * Extracted from LookComposerScreen — pure relocation, no changes.
 * Calls the domain hooks in exactly the order their contents originally
 * appeared in LookComposerInner (hook call order preserved) and returns
 * a flat bag consumed by LookComposerWorkspace.
 */

import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '../../../context/ToastContext';
import { useAppTheme } from '../../../theme/ThemeContext';
import { useHaptic } from '../../../hooks/useHaptic';
import type { NativeStackNavigationProp, RootStackParamList } from '../../../navigation/types';
import { useCreator, type CreatorContextValue } from '../../studio/CreatorContext';
import { useMultiSelect } from '../../shared/useMultiSelect';
import { useLookEffects } from '../useLookEffects';
import { useLookComposerState } from './useLookComposerState';
import { useLookSourceLoader } from './useLookSourceLoader';
import { useLookBackGuard } from './useLookBackGuard';
import { useLookMultiSelectActions } from './useLookMultiSelectActions';
import { useLookSurfaceDismiss } from './useLookSurfaceDismiss';
import { useLookSelectionHandlers } from './useLookSelectionHandlers';
import { useLookFloatingMenu } from './useLookFloatingMenu';
import { useLookChromeFade } from './useLookChromeFade';
import { useLookEntryTransition } from './useLookEntryTransition';
import { useLookObjectActions } from './useLookObjectActions';
import { useLookSurfaceActions } from './useLookSurfaceActions';
import { useLookTextActions } from './useLookTextActions';
import { useLookToolGroups } from './useLookToolGroups';
import { useLookDraftExport } from './useLookDraftExport';
import { buildLookGlobalOverflow } from './lookGlobalOverflow';
import { useLookLayoutState } from './useLookLayoutState';

type LookComposerRouteProp = RouteProp<RootStackParamList, 'CreatorStudio'>;
type LookComposerNavProp = NativeStackNavigationProp<RootStackParamList, 'CreatorStudio'>;

export function useLookComposerController() {
  const navigation = useNavigation<LookComposerNavProp>();
  const route = useRoute<LookComposerRouteProp>();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const { show } = useToast();
  const creator: CreatorContextValue = useCreator();

  // Sheet / overlay state machine + local UI state.
  const cs = useLookComposerState({
    openTemplates: route.params?.openTemplates,
    startBlank: route.params?.startBlank });

  const sourceDocumentId = route.params?.sourceDocumentId;
  const sourceMode = route.params?.sourceMode ?? 'edit';
  const source = useLookSourceLoader({
    sourceDocumentId,
    sourceMode,
    draftId: route.params?.draftId,
    templateId: route.params?.templateId,
    setDocument: creator.setDocument,
    setEditingLookId: cs.setEditingLookId,
    setIsLoadingSourceLook: cs.setIsLoadingSourceLook,
    setSourceLookError: cs.setSourceLookError,
    setSourceLookRetryNonce: cs.setSourceLookRetryNonce,
    sourceLookRetryNonce: cs.sourceLookRetryNonce });

  // Show entry screen when document is empty and not loading
  const hasContent = creator.document.pages.some((p) => p.layers.length > 0);
  const showEntryScreen = !cs.entryComplete && !hasContent && !creator.isLoadingDraft && !cs.isLoadingSourceLook;

  const page = creator.document.pages[0]; // Look is always single-page

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // ── Canvas geometry ──────────────────────────────────────────────────
  // The authored coordinate space is always the document's canvas aspect
  // ratio (4:5 for looks). The edit surface letterboxes around this
  // authored space — it never mutates the document geometry to match the
  // physical screen. Full-bleed media is achieved by the media layer's
  // contentFit="cover" filling the authored canvas, not by changing the
  // canvas dimensions. This ensures editor, viewer, thumbnail, and export
  // all use the same coordinate space.
  const canvasWidth = screenWidth;
  const canvasHeight = useMemo(() => {
    // Always use the authored aspect ratio — never the physical screen ratio.
    return Math.floor(screenWidth / creator.document.canvas.aspectRatio);
  }, [screenWidth, creator.document.canvas.aspectRatio]);

  // Canvas vertical position: vertically centered in the viewport.
  const canvasVerticalOffset = useMemo(() => {
    if (canvasHeight >= screenHeight) return 0;
    return Math.floor((screenHeight - canvasHeight) / 2);
  }, [canvasHeight, screenHeight]);

  // Truthful back + autosave, then the shared surface-dismiss cascade,
  // then canvas/selection handlers — in the original declaration order.
  const back = useLookBackGuard({ cs, creator, navigation });
  const multiActions = useLookMultiSelectActions({ cs, creator, haptic });
  useLookSurfaceDismiss({
    cs,
    creator,
    exitMultiSelect: multiActions.exitMultiSelect,
    handleMultiDelete: multiActions.handleMultiDelete,
    handleBack: back.handleBack });
  const selection = useLookSelectionHandlers({
    cs,
    creator,
    haptic,
    exitMultiSelect: multiActions.exitMultiSelect });

  const selectedLayer = page?.layers.find((l) => l.id === creator.selectedLayerId) ?? null;

  const floating = useLookFloatingMenu({
    cs,
    creator,
    selectedLayer,
    canvasWidth,
    canvasHeight,
    haptic });

  // Background media URI for draw-on-media (Snapchat/Instagram pattern)
  const backgroundMediaUri = useMemo(() => {
    const mediaLayer = page?.layers
      .filter((l) => l.type === 'media' && !l.hidden)
      .sort((a, b) => a.zIndex - b.zIndex)[0];
    return mediaLayer?.type === 'media' ? mediaLayer.payload.mediaUri : undefined;
  }, [page]);

  const chrome = useLookChromeFade();
  const entry = useLookEntryTransition({
    cs,
    creator,
    navigation,
    canvasWidth,
    canvasHeight,
    canvasVerticalOffset });
  const objectActions = useLookObjectActions({ cs, creator, haptic });
  const surfaceActions = useLookSurfaceActions({ cs, selectedLayer, haptic });

  // Effects sheet — derived state & handlers (extracted to useLookEffects)
  const effects = useLookEffects(selectedLayer, creator.updateLayer, creator.updateLayerLive);

  const textActions = useLookTextActions({
    cs,
    creator,
    selectedLayer,
    handleEditLayer: objectActions.handleEditLayer,
    haptic });

  // Multi-select operations (extracted to useLookMultiSelect)
  const multi = useMultiSelect(
    page,
    creator.selectedLayerIds,
    cs.multiSelectMode,
    {
      commitMultiLayerTransform: creator.commitMultiLayerTransform,
      bringSelectedToFront: creator.bringSelectedToFront,
      sendSelectedToBack: creator.sendSelectedToBack,
      toggleLayerInSelection: creator.toggleLayerInSelection,
      selectLayer: creator.selectLayer },
    haptic,
  );

  // Context-sensitive tool rail (extracted to lookToolRailConfig)
  const tools = useLookToolGroups({
    cs,
    creator,
    selectedLayer,
    objectActions,
    surfaceActions,
    textActions,
    multi,
    multiActions,
    effects });

  const draft = useLookDraftExport({
    document: creator.document,
    page,
    haptic,
    show });

  const overflow = buildLookGlobalOverflow({
    cs,
    navigation,
    canExportDraft: draft.canExportDraft,
    handleExportDraftImage: draft.handleExportDraftImage,
    contextOverflowTools: tools.contextOverflowTools });

  const layout = useLookLayoutState({
    page,
    canvasWidth,
    canvasHeight,
    commitLayerTransform: creator.commitLayerTransform,
    updateLayerLive: creator.updateLayerLive,
    haptic });

  return {
    navigation,
    colors,
    insets,
    haptic,
    screenWidth,
    screenHeight,
    canvasWidth,
    canvasHeight,
    canvasVerticalOffset,
    page,
    selectedLayer,
    showEntryScreen,
    backgroundMediaUri,
    ...creator,
    ...cs,
    ...source,
    ...back,
    ...multiActions,
    ...selection,
    ...floating,
    ...chrome,
    ...entry,
    ...objectActions,
    ...surfaceActions,
    ...effects,
    ...textActions,
    ...multi,
    ...tools,
    ...draft,
    ...overflow,
    ...layout,
  };
}

export type LookComposerControllerResult = ReturnType<typeof useLookComposerController>;
