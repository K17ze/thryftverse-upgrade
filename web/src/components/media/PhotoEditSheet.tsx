'use client';

/**
 * PhotoEditSheet — per-photo edit surface for the media studio.
 *
 * Web counterpart of the mobile CreatorCropSheet + AIPhotoEnhancementScreen,
 * merged into one sheet:
 *
 *  - Crop: aspect presets + draggable/resizable crop frame (pointer).
 *  - Rotate / flip: quarter-turns and mirrors on the real pixels.
 *  - Adjust: brightness / contrast / saturation sliders + "Auto lighting"
 *    (a histogram luminance stretch computed from the actual image).
 *  - Enhance: AI operations — capability-gated against
 *    /media-enhancement/capabilities exactly like mobile. When the backend
 *    reports no provider, the tab shows the honest "Not yet available"
 *    state; nothing fabricates an AI result.
 *
 * Apply exports the transformed pixels to a real blob — the caller swaps
 * the staged file, so what ships is what was previewed.
 */

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';
import { CropOverlay } from './photoEdit/CropOverlay';
import { CropRotateControls } from './photoEdit/CropRotateControls';
import { AdjustControls } from './photoEdit/AdjustControls';
import { EnhanceControls } from './photoEdit/EnhanceControls';
import { usePhotoEditWorkflow, type EditTab } from './photoEdit/usePhotoEditWorkflow';

interface PhotoEditSheetProps {
  open: boolean;
  /** Staged preview URL (blob:) of the photo being edited. */
  src: string | null;
  /** e.g. "Photo 2" — used for accessible labels and announcements. */
  photoLabel: string;
  onClose: () => void;
  /** The exported blob — real transformed pixels. Caller swaps the file. */
  onApply: (blob: Blob) => void;
}

export function PhotoEditSheet({
  open,
  src,
  photoLabel,
  onClose,
  onApply,
}: PhotoEditSheetProps) {
  const {
    canvasRef,
    img,
    loadFailed,
    edits,
    setEdits,
    cropAspect,
    tab,
    setTab,
    comparing,
    setComparing,
    applying,
    notice,
    photoEnhancementOn,
    aiPhase,
    setAiPhase,
    capability,
    selectedOpId,
    setSelectedOpId,
    selectedPresetId,
    setSelectedPresetId,
    selectedSceneId,
    setSelectedSceneId,
    aiError,
    aiProvenance,
    frameSize,
    presets,
    scenes,
    showScenes,
    canApplyAi,
    changed,
    patchEdits,
    pickAspect,
    rotateBy,
    retryCapability,
    runAiApply,
    revertAi,
    apply,
  } = usePhotoEditWorkflow(open, src, onApply);

  return (
    <Sheet open={open} onClose={onClose} title={`Edit ${photoLabel.toLowerCase()}`} maxWidth={720}>
      <div className="px-5 pb-6 pt-1">
        <p className="sr-only" role="status" aria-live="polite">
          {notice}
        </p>

        {/* Preview — the real transformed pixels, not a mock. */}
        <div className="relative mx-auto w-fit max-w-full">
          <canvas
            ref={canvasRef}
            aria-label={`Preview of ${photoLabel}`}
            role="img"
            className="block max-h-[46dvh] max-w-full rounded-md bg-surface-alt"
          />
          {!img && !loadFailed ? (
            <div className="absolute inset-0 flex items-center justify-center rounded-md bg-surface-alt">
              <Spinner size={24} tone="neutral" />
            </div>
          ) : null}
          {loadFailed ? (
            <div className="absolute inset-0 flex min-h-40 items-center justify-center rounded-md bg-surface-alt px-6 text-center">
              <p className="text-caption text-text-secondary">
                This photo couldn&apos;t be read for editing.
              </p>
            </div>
          ) : null}

          {tab === 'crop' && img && edits.crop && !comparing ? (
            <CropOverlay
              rect={edits.crop}
              aspect={typeof cropAspect === 'number' ? cropAspect : null}
              frameWidth={frameSize.width}
              frameHeight={frameSize.height}
              onChange={(crop) => setEdits((e) => ({ ...e, crop }))}
            />
          ) : null}
        </div>

        {/* Hold-to-compare — the untouched staged photo, on demand. */}
        {img ? (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onPointerDown={() => setComparing(true)}
              onPointerUp={() => setComparing(false)}
              onPointerLeave={() => setComparing(false)}
              onPointerCancel={() => setComparing(false)}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  setComparing(true);
                }
              }}
              onKeyUp={() => setComparing(false)}
              onBlur={() => setComparing(false)}
              aria-label="Hold to see the original photo"
              className="pressable rounded-md px-3 py-2 text-caption font-medium text-text-secondary hover:text-text-primary"
            >
              Hold to compare
            </button>
          </div>
        ) : null}

        {/* Tool switcher */}
        <div className="mt-2 flex gap-2" role="group" aria-label="Edit tools">
          {(
            [
              { id: 'crop', label: 'Crop & rotate' },
              { id: 'adjust', label: 'Adjust' },
              { id: 'enhance', label: 'Enhance' },
            ] as { id: EditTab; label: string }[]
          )
            .filter((t) => t.id !== 'enhance' || photoEnhancementOn)
            .map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`pressable h-9 rounded-full px-4 text-body font-medium ${
                  tab === t.id
                    ? 'bg-brand text-text-inverse'
                    : 'bg-surface-alt text-text-primary hover:bg-surface-raised'
                }`}
              >
                {t.label}
              </button>
            ))}
        </div>

        {/* Crop & rotate */}
        {tab === 'crop' ? (
          <CropRotateControls
            cropAspect={cropAspect}
            edits={edits}
            onPickAspect={pickAspect}
            onRotateBy={rotateBy}
            onPatchEdits={patchEdits}
          />
        ) : null}

        {/* Adjust */}
        {tab === 'adjust' ? (
          <AdjustControls
            edits={edits}
            onPatchEdits={patchEdits}
            onReset={() => {
              setEdits((e) => ({
                ...e,
                brightness: 100,
                contrast: 100,
                saturation: 100,
                autoLighting: false,
              }));
            }}
          />
        ) : null}

        {/* Enhance */}
        {tab === 'enhance' && photoEnhancementOn ? (
          <EnhanceControls
            aiPhase={aiPhase}
            aiError={aiError}
            capability={capability}
            selectedOpId={selectedOpId}
            setSelectedOpId={setSelectedOpId}
            selectedPresetId={selectedPresetId}
            setSelectedPresetId={setSelectedPresetId}
            selectedSceneId={selectedSceneId}
            setSelectedSceneId={setSelectedSceneId}
            presets={presets}
            scenes={scenes}
            showScenes={showScenes}
            canApplyAi={canApplyAi}
            aiProvenance={aiProvenance}
            setAiPhase={setAiPhase}
            onRetryCapability={retryCapability}
            onRunAiApply={() => void runAiApply()}
            onRevertAi={revertAi}
          />
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-2 border-t border-border-subtle pt-4">
          <Button variant="quiet" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => void apply()}
            disabled={!img || applying || !changed}
          >
            {applying ? 'Applying…' : 'Apply edits'}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
