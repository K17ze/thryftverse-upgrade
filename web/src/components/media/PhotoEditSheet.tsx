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

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';
import { DATA_MODE } from '@/lib/api/client';
import {
  applyEnhancement,
  applyPreset,
  derivePresetsFromOperations,
  disclosureLabel,
  fetchEnhancementCapability,
  getBackgroundScenes,
  invalidateEnhancementCapabilityCache,
  replaceBackground,
  type EnhancementCapability,
  type EnhancementProvenance,
} from '@/lib/api/services/mediaEnhancement';
import {
  centeredCropFor,
  DEFAULT_IMAGE_EDITS,
  exportEditedImage,
  hasPixelEdits,
  loadImageElement,
  MIN_CROP_FRACTION,
  renderEdits,
  rotatedSize,
  type CropRect,
  type ImageEdits,
} from '@/lib/media/imageEdit';

type EditTab = 'crop' | 'adjust' | 'enhance';

/** Aspect presets — 'original' clears the crop, 'free' is unconstrained. */
const ASPECT_PRESETS: { id: string; label: string; aspect: number | 'free' | 'original' }[] = [
  { id: 'original', label: 'Original', aspect: 'original' },
  { id: 'free', label: 'Free', aspect: 'free' },
  { id: '1:1', label: '1:1', aspect: 1 },
  { id: '4:5', label: '4:5', aspect: 4 / 5 },
  { id: '3:4', label: '3:4', aspect: 3 / 4 },
];

type AiPhase =
  | 'idle'
  | 'checking'
  | 'unavailable'
  | 'available'
  | 'submitting'
  | 'error';

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  /** The image the sheet is editing — the staged photo, or the AI result
   *  once an enhancement candidate has been accepted as the working base. */
  const [workingSrc, setWorkingSrc] = useState<string | null>(src);
  const [edits, setEdits] = useState<ImageEdits>(DEFAULT_IMAGE_EDITS);
  const [cropAspect, setCropAspect] = useState<number | 'free' | 'original'>('original');
  const [tab, setTab] = useState<EditTab>('crop');
  const [comparing, setComparing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState('');

  // ── AI enhancement state ──────────────────────────────────────────────
  const [aiPhase, setAiPhase] = useState<AiPhase>('idle');
  const [capability, setCapability] = useState<EnhancementCapability | null>(null);
  const [selectedOpId, setSelectedOpId] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  /** Provenance of the applied AI pass — disclosed to the seller honestly. */
  const [aiProvenance, setAiProvenance] = useState<EnhancementProvenance | null>(null);
  const aiRequestedRef = useRef(false);
  const workingObjectUrlRef = useRef<string | null>(null);

  // ── Image lifecycle ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setWorkingSrc(src);
    setEdits(DEFAULT_IMAGE_EDITS);
    setCropAspect('original');
    setTab('crop');
    setComparing(false);
    setAiPhase('idle');
    setCapability(null);
    setSelectedOpId(null);
    setSelectedPresetId(null);
    setSelectedSceneId(null);
    setAiError(null);
    setAiProvenance(null);
    aiRequestedRef.current = false;
    setNotice('');
  }, [open, src]);

  useEffect(() => {
    if (!open || !workingSrc) return;
    let cancelled = false;
    setLoadFailed(false);
    setImg(null);
    loadImageElement(workingSrc)
      .then((el) => {
        if (!cancelled) setImg(el);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, workingSrc]);

  // The AI result is fetched into a local object URL — released on close.
  useEffect(
    () => () => {
      if (workingObjectUrlRef.current) URL.revokeObjectURL(workingObjectUrlRef.current);
    },
    [],
  );

  // ── Preview render — the canvas IS the preview, drawn from real pixels ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!open || !img || !canvas) return;
    const effective = comparing ? DEFAULT_IMAGE_EDITS : edits;
    renderEdits(img, effective, canvas, {
      // In crop mode show the full post-rotate frame so the crop box maps
      // onto real coordinates; other tabs preview the finished pixels.
      applyCrop: tab !== 'crop',
      maxEdge: 880,
    });
  }, [open, img, edits, tab, comparing]);

  const announce = (message: string) => setNotice(message);

  const patchEdits = (patch: Partial<ImageEdits>, announcement?: string) => {
    setEdits((e) => ({ ...e, ...patch }));
    if (announcement) announce(announcement);
  };

  const frameSize = img
    ? rotatedSize(img.naturalWidth, img.naturalHeight, edits.rotate)
    : { width: 0, height: 0 };

  const pickAspect = (aspect: number | 'free' | 'original', label: string) => {
    setCropAspect(aspect);
    if (aspect === 'original') {
      patchEdits({ crop: null }, 'Crop cleared — full frame restored.');
      return;
    }
    if (aspect === 'free') {
      patchEdits(
        { crop: edits.crop ?? { x: 0.05, y: 0.05, width: 0.9, height: 0.9 } },
        'Free crop — drag the frame or its corners.',
      );
      return;
    }
    patchEdits(
      { crop: centeredCropFor(aspect, frameSize.width, frameSize.height) },
      `Crop set to ${label}.`,
    );
  };

  const rotateBy = (delta: 90 | -90) => {
    const next = (((edits.rotate + delta) % 360) + 360) % 360;
    const rotate = next as ImageEdits['rotate'];
    // The crop rect lives in rotated-frame space — a fixed-aspect crop is
    // recomputed for the new frame instead of pointing at stale pixels.
    setEdits((e) => {
      const newCrop =
        typeof cropAspect === 'number' && img
          ? centeredCropFor(
              cropAspect,
              rotatedSize(img.naturalWidth, img.naturalHeight, rotate).width,
              rotatedSize(img.naturalWidth, img.naturalHeight, rotate).height,
            )
          : e.crop;
      return { ...e, rotate, crop: newCrop };
    });
    announce(`Rotated ${delta === 90 ? 'clockwise' : 'counter-clockwise'}.`);
  };

  // ── AI enhance — capability-gated, fail-closed ───────────────────────
  const requestCapability = useCallback(() => {
    // Fixture builds have no backend — the capability is genuinely absent,
    // so the honest state is "not yet available", same as mobile renders
    // when the server reports no provider.
    if (DATA_MODE !== 'live') {
      setAiPhase('unavailable');
      return;
    }
    setAiPhase('checking');
    void fetchEnhancementCapability()
      .then((cap) => {
        setCapability(cap);
        setAiPhase(cap.available ? 'available' : 'unavailable');
      })
      .catch(() => setAiPhase('unavailable'));
  }, []);

  useEffect(() => {
    if (tab === 'enhance' && !aiRequestedRef.current) {
      aiRequestedRef.current = true;
      requestCapability();
    }
  }, [tab, requestCapability]);

  const retryCapability = () => {
    invalidateEnhancementCapabilityCache();
    requestCapability();
  };

  const runAiApply = async () => {
    if (!workingSrc || aiPhase !== 'available') return;
    const isBgReplace =
      capability?.operations.find((o) => o.id === selectedOpId)?.type ===
      'background_replace';
    setAiPhase('submitting');
    setAiError(null);
    try {
      const result = selectedPresetId
        ? await applyPreset(workingSrc, selectedPresetId)
        : isBgReplace && selectedSceneId
          ? await replaceBackground(workingSrc, selectedSceneId)
          : selectedOpId
            ? await applyEnhancement(workingSrc, selectedOpId)
            : null;
      if (!result) {
        setAiPhase('available');
        return;
      }
      // Pull the candidate into real local pixels — the sheet edits and
      // exports blobs, never remote references.
      const res = await fetch(result.enhancedUri);
      if (!res.ok) throw new Error('The enhanced photo could not be loaded');
      const blob = await res.blob();
      if (workingObjectUrlRef.current) URL.revokeObjectURL(workingObjectUrlRef.current);
      const url = URL.createObjectURL(blob);
      workingObjectUrlRef.current = url;
      setWorkingSrc(url);
      setEdits(DEFAULT_IMAGE_EDITS);
      setCropAspect('original');
      setAiProvenance(result.provenance);
      setAiPhase('available');
      announce(`${result.appliedOperationLabel} applied — preview updated.`);
    } catch (err) {
      setAiError(
        err instanceof Error && err.message
          ? err.message
          : 'The enhancement could not be completed.',
      );
      setAiPhase('error');
    }
  };

  const revertAi = () => {
    if (workingObjectUrlRef.current) {
      URL.revokeObjectURL(workingObjectUrlRef.current);
      workingObjectUrlRef.current = null;
    }
    setWorkingSrc(src);
    setEdits(DEFAULT_IMAGE_EDITS);
    setCropAspect('original');
    setAiProvenance(null);
    announce('Reverted to the original photo.');
  };

  const apply = async () => {
    if (!img || applying) return;
    setApplying(true);
    try {
      const blob = await exportEditedImage(img, edits);
      announce('Edits applied.');
      onApply(blob);
    } catch {
      announce('The edited photo could not be produced — try again.');
      setApplying(false);
    }
  };

  const presets = capability ? derivePresetsFromOperations(capability.operations) : [];
  const scenes = getBackgroundScenes();
  const selectedOp = capability?.operations.find((o) => o.id === selectedOpId);
  const showScenes = selectedOp?.type === 'background_replace';
  const canApplyAi =
    aiPhase === 'available' &&
    (Boolean(selectedOpId && (!showScenes || selectedSceneId)) || Boolean(selectedPresetId));

  const changed = hasPixelEdits(edits) || aiProvenance != null;

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

        {/* Tool switcher — one chip grammar, the same aria-pressed toggle
            group the aspect presets and the auction duration picker use.
            A mode selector, not document tabs: no tablist/tabpanel roles,
            every button stays tabbable. */}
        <div className="mt-2 flex gap-2" role="group" aria-label="Edit tools">
          {(
            [
              { id: 'crop', label: 'Crop & rotate' },
              { id: 'adjust', label: 'Adjust' },
              { id: 'enhance', label: 'Enhance' },
            ] as { id: EditTab; label: string }[]
          ).map((t) => (
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

        {/* ── Crop & rotate ── */}
        {tab === 'crop' ? (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Aspect ratio">
              {ASPECT_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={cropAspect === p.aspect}
                  onClick={() => pickAspect(p.aspect, p.label)}
                  className={`pressable h-9 rounded-full px-4 text-body font-medium ${
                    cropAspect === p.aspect
                      ? 'bg-brand text-text-inverse'
                      : 'bg-surface-alt text-text-primary hover:bg-surface-raised'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Rotate and flip">
              <Button variant="outline" size="sm" onClick={() => rotateBy(-90)}>
                Rotate left
              </Button>
              <Button variant="outline" size="sm" onClick={() => rotateBy(90)}>
                Rotate right
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-pressed={edits.flipH}
                onClick={() =>
                  patchEdits(
                    { flipH: !edits.flipH },
                    edits.flipH ? 'Flip removed.' : 'Flipped horizontally.',
                  )
                }
              >
                Flip
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-pressed={edits.flipV}
                onClick={() =>
                  patchEdits(
                    { flipV: !edits.flipV },
                    edits.flipV ? 'Vertical flip removed.' : 'Flipped vertically.',
                  )
                }
              >
                Flip vertically
              </Button>
            </div>
          </div>
        ) : null}

        {/* ── Adjust — honest local pixel adjustments ── */}
        {tab === 'adjust' ? (
          <div className="mt-4 space-y-4">
            {(
              [
                { id: 'brightness', label: 'Brightness', min: 50, max: 150 },
                { id: 'contrast', label: 'Contrast', min: 50, max: 150 },
                { id: 'saturation', label: 'Saturation', min: 0, max: 200 },
              ] as const
            ).map((s) => (
              <div key={s.id}>
                <div className="flex items-baseline justify-between">
                  <label
                    htmlFor={`edit-${s.id}`}
                    className="text-caption font-medium text-text-secondary"
                  >
                    {s.label}
                  </label>
                  <span className="tnum text-caption text-text-muted">
                    {edits[s.id]}%
                  </span>
                </div>
                <input
                  id={`edit-${s.id}`}
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={1}
                  value={edits[s.id]}
                  onChange={(e) =>
                    patchEdits({ [s.id]: Number(e.target.value) } as Partial<ImageEdits>)
                  }
                  className="mt-1 w-full accent-text-primary"
                />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                aria-pressed={edits.autoLighting}
                onClick={() =>
                  patchEdits(
                    { autoLighting: !edits.autoLighting },
                    edits.autoLighting
                      ? 'Auto lighting removed.'
                      : 'Auto lighting applied — contrast stretched to the photo’s range.',
                  )
                }
              >
                Auto lighting
              </Button>
              <Button
                variant="quiet"
                size="sm"
                onClick={() => {
                  setEdits((e) => ({
                    ...e,
                    brightness: 100,
                    contrast: 100,
                    saturation: 100,
                    autoLighting: false,
                  }));
                  announce('Adjustments reset.');
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        ) : null}

        {/* ── Enhance — AI capability, fail-closed ── */}
        {tab === 'enhance' ? (
          <div className="mt-4 space-y-4">
            {aiPhase === 'checking' || aiPhase === 'idle' ? (
              <p className="text-caption text-text-secondary">Checking availability…</p>
            ) : null}

            {aiPhase === 'unavailable' ? (
              <div>
                <p className="text-body-emphasis font-medium text-text-primary">
                  Not yet available
                </p>
                <p className="mt-1 text-caption text-text-secondary">
                  AI photo enhancement is being prepared. Your original photo is
                  unchanged — the crop and adjust tools still work on the real
                  pixels.
                </p>
                {DATA_MODE === 'live' ? (
                  <button
                    type="button"
                    onClick={retryCapability}
                    className="pressable mt-2 text-caption font-semibold text-text-primary underline-offset-4 hover:underline"
                  >
                    Check again
                  </button>
                ) : null}
              </div>
            ) : null}

            {aiPhase === 'error' ? (
              <div>
                <p className="text-body-emphasis font-medium text-danger-text">
                  Something went wrong
                </p>
                <p className="mt-1 text-caption text-text-secondary">{aiError}</p>
                <button
                  type="button"
                  onClick={() => setAiPhase('available')}
                  className="pressable mt-2 text-caption font-semibold text-text-primary underline-offset-4 hover:underline"
                >
                  Try again
                </button>
              </div>
            ) : null}

            {aiPhase === 'submitting' ? (
              <div className="flex items-center gap-2">
                <Spinner size={16} tone="neutral" />
                <p className="text-caption text-text-secondary">Enhancing…</p>
              </div>
            ) : null}

            {aiPhase === 'available' && capability ? (
              <>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Enhancement tools">
                  {capability.operations.map((op) => (
                    <button
                      key={op.id}
                      type="button"
                      aria-pressed={selectedOpId === op.id}
                      title={op.description}
                      onClick={() => {
                        setSelectedOpId(selectedOpId === op.id ? null : op.id);
                        setSelectedPresetId(null);
                      }}
                      className={`pressable h-9 rounded-full border px-4 text-body font-medium ${
                        selectedOpId === op.id
                          ? 'border-brand bg-brand text-text-inverse'
                          : 'border-border-subtle text-text-primary hover:border-text-muted'
                      }`}
                    >
                      {op.label}
                    </button>
                  ))}
                </div>

                {presets.length ? (
                  <div>
                    <p className="mb-2 text-caption text-text-muted">Presets</p>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Enhancement presets">
                      {presets.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          aria-pressed={selectedPresetId === p.id}
                          title={p.description}
                          onClick={() => {
                            setSelectedPresetId(selectedPresetId === p.id ? null : p.id);
                            setSelectedOpId(null);
                          }}
                          className={`pressable h-9 rounded-full border px-4 text-body font-medium ${
                            selectedPresetId === p.id
                              ? 'border-brand bg-brand-subtle text-text-primary'
                              : 'border-border-subtle text-text-secondary hover:border-text-muted'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {showScenes ? (
                  <div>
                    <p className="mb-2 text-caption text-text-muted">Background</p>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Background scenes">
                      {scenes.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          aria-pressed={selectedSceneId === s.id}
                          onClick={() =>
                            setSelectedSceneId(selectedSceneId === s.id ? null : s.id)
                          }
                          className={`pressable h-9 rounded-full border px-4 text-body font-medium ${
                            selectedSceneId === s.id
                              ? 'border-brand bg-brand text-text-inverse'
                              : 'border-border-subtle text-text-primary hover:border-text-muted'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!canApplyAi}
                  onClick={() => void runAiApply()}
                >
                  Apply enhancement
                </Button>
              </>
            ) : null}

            {aiProvenance ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-subtle pt-3">
                <p className="text-caption text-text-muted">
                  {disclosureLabel(aiProvenance.disclosureType)} · {aiProvenance.provider}
                </p>
                <button
                  type="button"
                  onClick={revertAi}
                  className="pressable text-caption font-semibold text-text-primary underline-offset-4 hover:underline"
                >
                  Revert to original
                </button>
              </div>
            ) : null}
          </div>
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

// ---------------------------------------------------------------------------
// CropOverlay — pointer-driven crop frame over the preview canvas. The rect
// is normalized to the post-rotate frame; aspect-locked presets resize in
// real pixel proportions so the exported crop matches the preview exactly.
// ---------------------------------------------------------------------------

const HANDLES = ['nw', 'ne', 'sw', 'se'] as const;
type Handle = (typeof HANDLES)[number] | 'move';

interface CropOverlayProps {
  rect: CropRect;
  /** Fixed w/h aspect in real pixels, or null for free resize. */
  aspect: number | null;
  frameWidth: number;
  frameHeight: number;
  onChange: (rect: CropRect) => void;
}

function CropOverlay({ rect, aspect, frameWidth, frameHeight, onChange }: CropOverlayProps) {
  const drag = useRef<{
    mode: Handle;
    startX: number;
    startY: number;
    rect: CropRect;
    box: DOMRect;
  } | null>(null);

  const startDrag = (mode: Handle) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // The overlay parent is exactly the canvas box — its rect is the
    // normalized coordinate space the crop is expressed in.
    const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    drag.current = { mode, startX: e.clientX, startY: e.clientY, rect, box };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const applyDelta = (dxn: number, dyn: number) => {
    const d = drag.current;
    if (!d || !frameWidth || !frameHeight) return;
    const r = d.rect;
    const min = MIN_CROP_FRACTION;
    const right = r.x + r.width;
    const bottom = r.y + r.height;
    // Pixel-space aspect → normalized height per unit of normalized width.
    const hPerW = aspect != null ? frameWidth / (aspect * frameHeight) : null;

    if (d.mode === 'move') {
      onChange({
        x: Math.min(Math.max(r.x + dxn, 0), 1 - r.width),
        y: Math.min(Math.max(r.y + dyn, 0), 1 - r.height),
        width: r.width,
        height: r.height,
      });
      return;
    }

    // Every corner anchors its opposite corner. Width deltas drive the
    // resize; with a locked aspect, height follows in real proportions and
    // clamps back into the frame.
    let w = r.width;
    let h = r.height;
    const east = d.mode === 'ne' || d.mode === 'se';
    const south = d.mode === 'sw' || d.mode === 'se';

    const wLimit = east ? 1 - r.x : right;
    w = Math.min(Math.max(east ? r.width + dxn : r.width - dxn, min), wLimit);
    if (hPerW != null) {
      const hLimit = south ? 1 - r.y : bottom;
      h = Math.min(w * hPerW, hLimit);
      w = (h / hPerW);
      w = Math.min(Math.max(w, min), wLimit);
      h = w * hPerW;
    } else {
      const hLimit = south ? 1 - r.y : bottom;
      h = Math.min(Math.max(south ? r.height + dyn : r.height - dyn, min), hLimit);
    }

    onChange({
      x: east ? r.x : right - w,
      y: south ? r.y : bottom - h,
      width: w,
      height: h,
    });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    applyDelta(
      (e.clientX - d.startX) / d.box.width,
      (e.clientY - d.startY) / d.box.height,
    );
  };

  const endDrag = () => {
    drag.current = null;
  };

  /* Keyboard equivalent — the crop frame is focusable: arrows nudge it,
   * Shift+arrow grows it from the bottom-right corner, Alt+arrow shrinks.
   * Announced via the tile's aria-label; the parent live region reports. */
  const onFrameKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey || e.altKey ? 0.02 : 0.01;
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const dir = dirs[e.key];
    if (!dir) return;
    e.preventDefault();
    const [dx, dy] = dir;
    if (e.shiftKey || e.altKey) {
      const sign = e.altKey ? -1 : 1;
      drag.current = {
        mode: 'se',
        startX: 0,
        startY: 0,
        rect,
        box: { width: 1, height: 1 } as DOMRect,
      };
      applyDelta(sign * step * dx, sign * step * dy);
      drag.current = null;
      return;
    }
    onChange({
      x: Math.min(Math.max(rect.x + dx * step, 0), 1 - rect.width),
      y: Math.min(Math.max(rect.y + dy * step, 0), 1 - rect.height),
      width: rect.width,
      height: rect.height,
    });
  };

  const handleStyle = (corner: (typeof HANDLES)[number]): React.CSSProperties => ({
    left: corner.includes('w') ? `${rect.x * 100}%` : undefined,
    right: corner.includes('e') ? `${100 - (rect.x + rect.width) * 100}%` : undefined,
    top: corner.includes('n') ? `${rect.y * 100}%` : undefined,
    bottom: corner.includes('s') ? `${100 - (rect.y + rect.height) * 100}%` : undefined,
    transform:
      `${corner.includes('w') ? 'translateX(-50%)' : 'translateX(50%)'} ` +
      `${corner.includes('n') ? 'translateY(-50%)' : 'translateY(50%)'}`,
  });

  const handleCursor: Record<(typeof HANDLES)[number], string> = {
    nw: 'cursor-nwse-resize',
    ne: 'cursor-nesw-resize',
    sw: 'cursor-nesw-resize',
    se: 'cursor-nwse-resize',
  };

  return (
    <div className="absolute inset-0">
      {/* Crop frame — everything outside is dimmed via the box-shadow. */}
      <div
        role="slider"
        tabIndex={0}
        aria-label="Crop area — arrow keys move it, Shift plus arrows resizes, Alt plus arrows shrinks"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(rect.width * 100)}
        aria-valuetext={`crop covers ${Math.round(rect.width * 100)} by ${Math.round(rect.height * 100)} percent of the photo`}
        onKeyDown={onFrameKeyDown}
        onPointerDown={startDrag('move')}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="absolute cursor-move touch-none rounded-[2px] border-2 border-white/80 outline-none focus-visible:border-white"
        style={{
          left: `${rect.x * 100}%`,
          top: `${rect.y * 100}%`,
          width: `${rect.width * 100}%`,
          height: `${rect.height * 100}%`,
          boxShadow: '0 0 0 2000px rgba(0,0,0,0.55)',
        }}
      >
        {/* Rule-of-thirds guides — hairlines, like the mobile crop grid. */}
        <span className="absolute inset-y-0 left-1/3 w-px bg-white/40" aria-hidden />
        <span className="absolute inset-y-0 left-2/3 w-px bg-white/40" aria-hidden />
        <span className="absolute inset-x-0 top-1/3 h-px bg-white/40" aria-hidden />
        <span className="absolute inset-x-0 top-2/3 h-px bg-white/40" aria-hidden />
      </div>
      {HANDLES.map((corner) => (
        <div
          key={corner}
          aria-hidden
          onPointerDown={startDrag(corner)}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={`absolute flex h-11 w-11 touch-none items-center justify-center ${handleCursor[corner]}`}
          style={handleStyle(corner)}
        >
          <span className="h-3 w-3 rounded-full border border-black/20 bg-white" />
        </div>
      ))}
    </div>
  );
}
