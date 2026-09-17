import React from 'react';
import type { CreatorContextValue } from '../../studio/CreatorContext';
import type { CreatorDocument, CreatorLayer, CreatorPage, CreatorBackground } from '../../core/projectStore/composition';
import { layerTypeLabel } from '../../shared/layerUtils';
import { CreatorPreviewOverlay } from '../../surfaces/CreatorPreviewOverlay';
import { CreatorLayersSheet } from '../../surfaces/CreatorLayersSheet';
import { CreatorPublishSheet } from '../../publish/CreatorPublishSheet';
import { InstantCutSheet } from '../../surfaces/InstantCutSheet';
import { CreatorSettingsSheet } from '../../surfaces/CreatorSettingsSheet';
import { HelpShortcutsSheet } from '../../surfaces/HelpShortcutsSheet';
import { BackgroundSheet } from '../BackgroundSheet';
import { AIEffectBrowserSheet } from '../../tools/effects/AIEffectBrowserSheet';
import { AccessibilityMoveSheet } from '../../surfaces/AccessibilityMoveSheet';
import { AccessibilityZOrderSheet, type ZOrderLayer } from '../../surfaces/AccessibilityZOrderSheet';
import { AccessibilityTransformSheet } from '../../surfaces/AccessibilityTransformSheet';
import { CreatorTemplateBrowser } from '../../surfaces/CreatorTemplateBrowser';
import { CreatorCropSheet } from '../../surfaces/CreatorCropSheet';
import { CreatorCutoutSheet } from '../../surfaces/CreatorCutoutSheet';
import { CutoutPreviewSheet } from '../../surfaces/CutoutPreviewSheet';
import type { CutoutResult } from '../../core/cutout/CutoutService';
import {
  CreatorColorPicker,
  toHexString,
  fromHexString,
  type CreatorColor,
} from '../../color';
import { CreatorAssetPicker, type AssetPickerMode } from '../../surfaces/CreatorAssetPicker';
import { ConfirmationSheet } from '../../../components/ConfirmationSheet';
import type { CreatorTemplate } from '../../studio/templates';
import type { LayoutId } from '../layout/layoutTypes';
import type { LookEditorState } from '../lookEditorState';
import { useHaptic } from '../../../hooks/useHaptic';

// ── Sheets host (presentational) ────────────────────────────────────
// Extracted from LookComposerScreen — pure relocation, no changes.
// Renders every sheet / overlay / picker driven by the editor state
// machine and the screen's local target state. Only the state values and
// callbacks already in scope are passed in; no hooks, no new behavior.

type ConfirmSheetState = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'default' | 'danger';
  onConfirm: () => void;
};

export function LookSheetHost({
  state,
  setShowPreview,
  setShowPublish,
  setShowLayers,
  setShowSettings,
  setShowHelp,
  setShowTemplates,
  setShowBackground,
  setShowAIEffects,
  setShowA11yMove,
  setShowA11yZOrder,
  setShowA11yTransform,
  editingLookId,
  instantCutVisible,
  setInstantCutVisible,
  mediaAssetUris,
  handleLayoutSelect,
  document,
  mediaLayers,
  updateCanvas,
  setDocument,
  activeAIEffectId,
  effectsSourceUri,
  handleAIEffectApply,
  handleAIEffectRemove,
  selectedLayerId,
  selectedLayer,
  updateLayer,
  page,
  reorderLayer,
  cropTarget,
  setCropTarget,
  cutoutTarget,
  setCutoutTarget,
  cutoutPreviewTarget,
  setCutoutPreviewTarget,
  showTextColorPicker,
  colorRecents,
  commitRecentColor,
  haptic,
  pickerMode,
  editingLayer,
  backgroundMediaUri,
  setPickerMode,
  setEditingLayer,
  swapLookAsset,
  addLayer,
  confirmSheet,
  setConfirmSheet }: {
  state: LookEditorState;
  setShowPreview: (show: boolean) => void;
  setShowPublish: (show: boolean) => void;
  setShowLayers: (show: boolean) => void;
  setShowSettings: (show: boolean) => void;
  setShowHelp: (show: boolean) => void;
  setShowTemplates: (show: boolean) => void;
  setShowBackground: (show: boolean) => void;
  setShowAIEffects: (show: boolean) => void;
  setShowA11yMove: (show: boolean) => void;
  setShowA11yZOrder: (show: boolean) => void;
  setShowA11yTransform: (show: boolean) => void;
  editingLookId: string | null;
  instantCutVisible: boolean;
  setInstantCutVisible: React.Dispatch<React.SetStateAction<boolean>>;
  mediaAssetUris: string[];
  handleLayoutSelect: (id: LayoutId) => void;
  document: CreatorDocument;
  mediaLayers: CreatorLayer[];
  updateCanvas: CreatorContextValue['updateCanvas'];
  setDocument: CreatorContextValue['setDocument'];
  activeAIEffectId: React.ComponentProps<typeof AIEffectBrowserSheet>['initialEffectId'];
  effectsSourceUri: React.ComponentProps<typeof AIEffectBrowserSheet>['sourceImageUri'];
  handleAIEffectApply: React.ComponentProps<typeof AIEffectBrowserSheet>['onApply'];
  handleAIEffectRemove: React.ComponentProps<typeof AIEffectBrowserSheet>['onRemove'];
  selectedLayerId: string | null;
  selectedLayer: CreatorLayer | null;
  updateLayer: CreatorContextValue['updateLayer'];
  page: CreatorPage;
  reorderLayer: CreatorContextValue['reorderLayer'];
  cropTarget: CreatorLayer | null;
  setCropTarget: React.Dispatch<React.SetStateAction<CreatorLayer | null>>;
  cutoutTarget: CreatorLayer | null;
  setCutoutTarget: React.Dispatch<React.SetStateAction<CreatorLayer | null>>;
  cutoutPreviewTarget: CreatorLayer | null;
  setCutoutPreviewTarget: React.Dispatch<React.SetStateAction<CreatorLayer | null>>;
  showTextColorPicker: boolean;
  colorRecents: React.ComponentProps<typeof CreatorColorPicker>['recents'];
  commitRecentColor: NonNullable<React.ComponentProps<typeof CreatorColorPicker>['onCommitRecent']>;
  haptic: ReturnType<typeof useHaptic>;
  pickerMode: AssetPickerMode | null;
  editingLayer: CreatorLayer | null;
  backgroundMediaUri: string | undefined;
  setPickerMode: React.Dispatch<React.SetStateAction<AssetPickerMode | null>>;
  setEditingLayer: React.Dispatch<React.SetStateAction<CreatorLayer | null>>;
  swapLookAsset: CreatorContextValue['swapLookAsset'];
  addLayer: CreatorContextValue['addLayer'];
  confirmSheet: ConfirmSheetState;
  setConfirmSheet: React.Dispatch<React.SetStateAction<ConfirmSheetState>>;
}) {
  return (
    <>
      {/* ── Sheets ─────────────────────────────────────────────────── */}
      {state.mode.type === 'previewing' && (
        <CreatorPreviewOverlay
          visible={true}
          onClose={() => setShowPreview(false)}
          onPublish={() => {
            setShowPreview(false);
            setShowPublish(true);
          }}
        />
      )}
      <CreatorLayersSheet visible={state.mode.type === 'arrangingLayers'} onClose={() => setShowLayers(false)} />
      <CreatorPublishSheet visible={state.mode.type === 'publishing'} onClose={() => setShowPublish(false)} editingLookId={editingLookId ?? undefined} />

      {/* ── Instant Cut sheet (Snapchat Quick Cut equivalent) ── */}
      {/* One-tap auto-compose + publish path. Opens from the source tray
          when the user has 2+ media assets selected. */}
      <InstantCutSheet
        visible={instantCutVisible}
        assetUris={mediaAssetUris}
        onClose={() => setInstantCutVisible(false)}
        onPublish={(layoutId) => {
          // Commit the user's selected layout to the document before
          // entering the publish flow — otherwise the choice is silently
          // discarded (the sheet only previews, it never applies).
          handleLayoutSelect(layoutId as LayoutId);
          setInstantCutVisible(false);
          setShowPublish(true);
        }}
        onOpenEditor={(layoutId) => {
          // Commit the selected layout so the full composer opens with the
          // user's Instant Cut choice already applied to the canvas.
          handleLayoutSelect(layoutId as LayoutId);
          setInstantCutVisible(false);
        }}
      />
      <CreatorSettingsSheet visible={state.mode.type === 'settings'} onClose={() => setShowSettings(false)} />
      <HelpShortcutsSheet visible={state.mode.type === 'help'} onClose={() => setShowHelp(false)} />
      {/* ── Background picker sheet ────────────────────────────────── */}
      {/* Bottom sheet for picking the canvas background (solid, gradient,
          blurred photo, or image). On confirm, commits the selected
          background to document.canvas.background via updateCanvas. */}
      <BackgroundSheet
        visible={state.mode.type === 'background'}
        currentBackground={document.canvas.background}
        mediaLayers={mediaLayers}
        onConfirm={(bg: CreatorBackground) => {
          updateCanvas({ background: bg });
          setShowBackground(false);
        }}
        onClose={() => setShowBackground(false)}
      />
      {/* ── AI Effects browser sheet ───────────────────────────────── */}
      {/* Bottom sheet for browsing and applying photo effects from
          the AIEffectRegistry. Each effect is a composed stack of real
          Skia render nodes. When applied, the effect is stored as a
          filter node in the selected media layer's effect stack. */}
      <AIEffectBrowserSheet
        visible={state.mode.type === 'aiEffects'}
        initialEffectId={activeAIEffectId}
        sourceImageUri={effectsSourceUri}
        onApply={handleAIEffectApply}
        onRemove={handleAIEffectRemove}
        onClose={() => setShowAIEffects(false)}
      />
      {/* ── Accessibility sheets (drag alternatives) ────────────────── */}
      {/* Per spec 09: keyboard/button-based alternatives for users who
          cannot perform drag gestures. onMove wires to updateLayer;
          onReorder wires to reorderLayer. */}
      <AccessibilityMoveSheet
        visible={state.mode.type === 'a11yMove'}
        layerId={selectedLayerId}
        position={selectedLayer ? { x: selectedLayer.x, y: selectedLayer.y } : null}
        onClose={() => setShowA11yMove(false)}
        onMove={(x, y) => {
          if (selectedLayerId) updateLayer(selectedLayerId, { x, y }, 'Move object');
        }}
      />
      <AccessibilityZOrderSheet
        visible={state.mode.type === 'a11yZOrder'}
        layers={(page?.layers ?? []).map((l) => ({
          id: l.id,
          label: layerTypeLabel(l.type, 'look'),
          zIndex: l.zIndex })) as ZOrderLayer[]}
        selectedLayerId={selectedLayerId}
        onClose={() => setShowA11yZOrder(false)}
        onReorder={(layerId, direction) => reorderLayer(layerId, direction)}
      />
      {/* Pinch/rotate alternative: button-driven scale + rotation. */}
      <AccessibilityTransformSheet
        visible={state.mode.type === 'a11yTransform'}
        layerId={selectedLayerId}
        transform={
          selectedLayer
            ? { scale: selectedLayer.scale, rotation: selectedLayer.rotation }
            : null
        }
        onClose={() => setShowA11yTransform(false)}
        onTransform={(scale, rotation) => {
          if (selectedLayerId) {
            updateLayer(selectedLayerId, { scale, rotation }, 'Resize & rotate object');
          }
        }}
      />
      <CreatorTemplateBrowser
        visible={state.mode.type === 'choosingTemplate'}
        documentType="look"
        hasExistingWork={document.pages.some((p) => p.layers.length > 0)}
        onClose={() => setShowTemplates(false)}
        onApply={(template: CreatorTemplate) => {
          const doc = template.build();
          setDocument(doc);
        }}
      />
      {/* In-canvas crop overlay — non-destructive crop handles rendered
          directly over the canvas (spec 07 §6, spec 04 §1). The
          composition remains visible while the user adjusts the crop. */}
      {/* Crop sheet — legacy fallback for aspect-ratio crop (kept as
          fallback per spec — not removed). */}
      {cropTarget && cropTarget.type === 'media' && (
        <CreatorCropSheet
          visible={!!cropTarget}
          imageUri={cropTarget.payload.mediaUri}
          focalPoint={cropTarget.payload.focalPoint}
          onFocalPointChange={(point) => {
            if (cropTarget && cropTarget.type === 'media') {
              updateLayer(cropTarget.id, {
                type: 'media',
                payload: {
                  ...cropTarget.payload,
                  focalPoint: point } });
            }
          }}
          onClose={() => setCropTarget(null)}
          onCropComplete={(newUri) => {
            if (cropTarget && cropTarget.type === 'media') {
              updateLayer(cropTarget.id, {
                type: 'media',
                payload: {
                  ...cropTarget.payload,
                  mediaUri: newUri,
                  mediaFinalizationId: undefined,
                  mediaAssetId: undefined } });
            }
            setCropTarget(null);
          }}
        />
      )}
      {/* Crop sheet — manual rectangular cropping as a real visual operation.
          Per spec 10: if high-quality removal is unavailable, keep the
          original media rectangle. NEVER pretend a cutout succeeded.
          The CreatorCutoutSheet handles this truthfully — it only calls
          onCutoutComplete with a real result URI. */}
      {cutoutTarget && cutoutTarget.type === 'media' && (
        <CreatorCutoutSheet
          visible={!!cutoutTarget}
          imageUri={cutoutTarget.payload.mediaUri}
          onClose={() => setCutoutTarget(null)}
          onCutoutComplete={(newUri) => {
            if (cutoutTarget && cutoutTarget.type === 'media') {
              // Replace the media layer's URI with the crop result.
              // The crop sheet only calls this with a real processed URI.
              updateLayer(cutoutTarget.id, {
                type: 'media',
                payload: {
                  ...cutoutTarget.payload,
                  mediaUri: newUri,
                  contentFit: 'contain' } });
            }
            setCutoutTarget(null);
          }}
        />
      )}
      {/* True cutout preview sheet — native subject segmentation.
          Opens when the user taps "Cutout" and the native backend is
          available. Shows a before/after preview over a checkerboard.
          On confirm, replaces the media URI with the transparent PNG
          and stores the alpha mask reference on the layer. */}
      {cutoutPreviewTarget && cutoutPreviewTarget.type === 'media' && (
        <CutoutPreviewSheet
          visible={!!cutoutPreviewTarget}
          imageUri={cutoutPreviewTarget.payload.mediaUri}
          onClose={() => setCutoutPreviewTarget(null)}
          onConfirm={(result: CutoutResult) => {
            if (cutoutPreviewTarget && cutoutPreviewTarget.type === 'media') {
              // Replace the media layer's URI with the transparent PNG
              // result. Store the maskRef id on the layer so the render
              // pipeline can composite with the alpha mask (spec 07 §7).
              updateLayer(cutoutPreviewTarget.id, {
                type: 'media',
                payload: {
                  ...cutoutPreviewTarget.payload,
                  mediaUri: result.uri,
                  contentFit: 'contain' },
                maskRef: result.maskRef?.uri }, 'Apply cutout');
            }
            setCutoutPreviewTarget(null);
          }}
        />
      )}
      {/* ── Text color picker sheet ────────────────────────────────── */}
      {showTextColorPicker && selectedLayer && selectedLayer.type === 'text' && (
        <CreatorColorPicker
          color={selectedLayer.payload.fill ?? fromHexString(selectedLayer.payload.textColor ?? '#ffffff') ?? { space: 'srgb', r: 1, g: 1, b: 1, a: 1 }}
          onChange={(c: CreatorColor) => {
            updateLayer(selectedLayer.id, {
              type: 'text',
              payload: {
                ...selectedLayer.payload,
                fill: c,
                textColor: toHexString(c),
              },
            }, 'Change text color');
          }}
          onCommit={(c: CreatorColor) => {
            updateLayer(selectedLayer.id, {
              type: 'text',
              payload: {
                ...selectedLayer.payload,
                fill: c,
                textColor: toHexString(c),
              },
            }, 'Change text color');
            commitRecentColor(c);
            haptic.light();
          }}
          mode="expanded"
          recents={colorRecents}
          onCommitRecent={commitRecentColor}
          accessibilityLabel="Text color picker"
          accessibilityHint="Choose the text color"
        />
      )}
      <CreatorAssetPicker
        visible={pickerMode !== null}
        mode={pickerMode ?? 'media'}
        editingLayer={editingLayer}
        backgroundUri={backgroundMediaUri}
        onClose={() => { setPickerMode(null); setEditingLayer(null); }}
        onAddLayer={(layer) => {
          if (editingLayer) {
            // Editing existing layer — for media, use swapLookAsset to
            // preserve position (stable position when replacing media
            // per spec 10). For other types, update in place.
            if (editingLayer.type === 'media' && layer.type === 'media') {
              swapLookAsset(editingLayer.id, {
                mediaUri: layer.payload.mediaUri,
                mediaType: layer.payload.mediaType,
                contentFit: layer.payload.contentFit });
            } else if (editingLayer.type === 'product' && layer.type === 'product') {
              // Link/change item — update the product layer in place
              updateLayer(editingLayer.id, layer, 'Change item');
            } else {
              updateLayer(editingLayer.id, layer, 'Edit object');
            }
          } else {
            addLayer(layer);
          }
        }}
      />
      {confirmSheet.visible && (
        <ConfirmationSheet
          visible={true}
          onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
          title={confirmSheet.title}
          message={confirmSheet.message}
          confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
          variant={confirmSheet.variant ?? 'default'}
          onConfirm={() => { confirmSheet.onConfirm(); setConfirmSheet((s) => ({ ...s, visible: false })); }}
        />
      )}
    </>
  );
}
