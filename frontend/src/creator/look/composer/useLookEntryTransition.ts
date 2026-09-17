/**
 * useLookEntryTransition — camera → editor crossfade state for the Look
 * composer.
 *
 * Extracted from LookComposerScreen — pure relocation, no changes.
 * For Look, each asset becomes an auto-arranged media layer on page 0
 * via computeLookLayout — never N identical full-bleed overlaps.
 */

import { useCallback, useRef, useState } from 'react';
import { makeStableId } from '../../../utils/createStableId';
import { computeLookLayout } from '../../core/projectStore/composition';
import type { CreatorLayer } from '../../core/projectStore/composition';
import type { CreatorInitialMedia, NativeStackNavigationProp, RootStackParamList } from '../../../navigation/types';
import type { CreatorContentTransform } from '../../studio/CreatorEntryEditorCrossfade';
import type { CaptureViewport } from '../../capture/CaptureViewport';
import type { CreatorContextValue } from '../../studio/CreatorContext';
import type { LookComposerStateResult } from './useLookComposerState';

export function useLookEntryTransition({
  cs,
  creator,
  navigation,
  canvasWidth,
  canvasHeight,
  canvasVerticalOffset,
}: {
  cs: LookComposerStateResult;
  creator: CreatorContextValue;
  navigation: NativeStackNavigationProp<RootStackParamList, 'CreatorStudio'>;
  canvasWidth: number;
  canvasHeight: number;
  canvasVerticalOffset: number;
}) {
  const { setEntryComplete } = cs;
  const { document, setDocument } = creator;

  // ── Entry screen media handling ──────────────────────────────────────
  // For Look, each asset becomes an auto-arranged media layer on page 0
  // via computeLookLayout — never N identical full-bleed overlaps.
  const [entryPinnedUri, setEntryPinnedUri] = useState<string | null>(null);
  const [entryPinnedKind, setEntryPinnedKind] = useState<'image' | 'video'>('image');
  const [entryPinnedDestination, setEntryPinnedDestination] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  // Source content transform — the camera viewport guide rect captured at
  // the moment of capture. The transition animates the pinned media from
  // this frame to the editor canvas frame, preserving the focal point.
  const [entrySourceTransform, setEntrySourceTransform] = useState<CreatorContentTransform | null>(null);
  const cameraViewportRef = useRef<CaptureViewport | null>(null);
  const handleEntryMediaSelected = useCallback((media: CreatorInitialMedia[]) => {
    const mediaLayers: CreatorLayer[] = media.map((asset, i) => ({
      id: makeStableId(`media_${i}`),
      type: 'media' as const,
      x: 0.5,
      y: 0.5,
      width: 1,
      height: 1,
      scale: 1,
      rotation: 0,
      zIndex: i,
      locked: false,
      hidden: false,
      opacity: 1,
      payload: {
        mediaUri: asset.uri,
        mediaType: asset.kind,
        contentFit: 'cover' as const,
        videoDurationMs: asset.kind === 'video' ? asset.durationMs : undefined,
        opacity: 1,
        ...(asset.speed ? { speed: asset.speed } : {}),
        // Apply camera effect post-capture: store as a filter node in
        // the effect stack so the renderer applies the color matrix.
        // The effect ID matches the filter system's ImageFilter names.
        ...(asset.cameraEffect ? {
          effects: [{ type: 'filter' as const, id: asset.cameraEffect, amount: 1 }] } : {}) } }));
    const arranged = computeLookLayout(mediaLayers);
    const firstMedia = arranged.find((layer) => layer.type === 'media');
    setEntryPinnedUri(media[0]?.uri ?? null);
    setEntryPinnedKind(media[0]?.kind ?? 'image');
    // Build the source content transform from the measured camera viewport
    // so the transition animates from the guide frame, not full-screen.
    const vp = cameraViewportRef.current;
    if (vp) {
      setEntrySourceTransform({
        frame: {
          left: vp.viewRect.x,
          top: vp.viewRect.y,
          width: vp.viewRect.width,
          height: vp.viewRect.height },
        aspectRatio: vp.authoredAspectRatio });
    } else {
      setEntrySourceTransform(null);
    }
    setEntryPinnedDestination(firstMedia ? {
      left: (firstMedia.x - firstMedia.width / 2) * canvasWidth,
      top: canvasVerticalOffset + (firstMedia.y - firstMedia.height / 2) * canvasHeight,
      width: firstMedia.width * canvasWidth,
      height: firstMedia.height * canvasHeight } : null);
    const newDoc = {
      ...document,
      pages: [{ id: document.pages[0]?.id ?? 'page_1', layers: arranged }],
      updatedAt: new Date().toISOString() };
    setDocument(newDoc);
    setEntryComplete(true);
  }, [canvasHeight, canvasVerticalOffset, canvasWidth, document, setDocument, setEntryComplete]);

  const handleEntryBlankStart = useCallback(() => {
    setEntryPinnedUri(null);
    setEntryPinnedKind('image');
    setEntryPinnedDestination(null);
    setEntrySourceTransform(null);
    setEntryComplete(true);
  }, [setEntryComplete]);

  const handleEntryClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  return {
    entryPinnedUri,
    entryPinnedKind,
    entryPinnedDestination,
    entrySourceTransform,
    cameraViewportRef,
    handleEntryMediaSelected,
    handleEntryBlankStart,
    handleEntryClose,
  };
}
