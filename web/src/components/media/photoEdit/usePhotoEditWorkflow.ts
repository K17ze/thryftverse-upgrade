'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DATA_MODE } from '@/lib/api/client';
import { aiFeatureOn, useAIPrefs } from '@/lib/store/aiPrefs';
import {
  applyEnhancement,
  applyPreset,
  derivePresetsFromOperations,
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
  renderEdits,
  rotatedSize,
  type ImageEdits,
} from '@/lib/media/imageEdit';

export type EditTab = 'crop' | 'adjust' | 'enhance';

export type AiPhase =
  | 'idle'
  | 'checking'
  | 'unavailable'
  | 'available'
  | 'submitting'
  | 'error';

export function usePhotoEditWorkflow(
  open: boolean,
  src: string | null,
  onApply: (blob: Blob) => void,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [workingSrc, setWorkingSrc] = useState<string | null>(src);
  const [edits, setEdits] = useState<ImageEdits>(DEFAULT_IMAGE_EDITS);
  const [cropAspect, setCropAspect] = useState<number | 'free' | 'original'>('original');
  const [tab, setTab] = useState<EditTab>('crop');
  const [comparing, setComparing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState('');

  // AI enhancement state
  const photoEnhancementOn = useAIPrefs((s) =>
    aiFeatureOn(s, 'photoEnhancement'),
  );
  const [aiPhase, setAiPhase] = useState<AiPhase>('idle');
  const [capability, setCapability] = useState<EnhancementCapability | null>(null);
  const [selectedOpId, setSelectedOpId] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiProvenance, setAiProvenance] = useState<EnhancementProvenance | null>(null);
  const aiRequestedRef = useRef(false);
  const workingObjectUrlRef = useRef<string | null>(null);

  // Lifecycle
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

  useEffect(
    () => () => {
      if (workingObjectUrlRef.current) URL.revokeObjectURL(workingObjectUrlRef.current);
    },
    [],
  );

  // Preview render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!open || !img || !canvas) return;
    const effective = comparing ? DEFAULT_IMAGE_EDITS : edits;
    renderEdits(img, effective, canvas, {
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

  const requestCapability = useCallback(() => {
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
    if (tab === 'enhance' && photoEnhancementOn && !aiRequestedRef.current) {
      aiRequestedRef.current = true;
      requestCapability();
    }
  }, [tab, photoEnhancementOn, requestCapability]);

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

  return {
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
  };
}
