/**
 * CropCutoutSheets — the pixel-crop and true-cutout-preview sheet
 * branches of PosterSheetStack. Extracted verbatim from
 * PosterSheetStack.tsx.
 */
import React from 'react';
import { CreatorCropSheet } from '../../surfaces/CreatorCropSheet';
import { CutoutPreviewSheet } from '../../surfaces/CutoutPreviewSheet';
import type { CutoutResult } from '../../core/cutout/CutoutService';
import type { CreatorLayer } from '../../core/projectStore/composition';

interface CropCutoutSheetsProps {
  cropMode: boolean;
  setCropMode: (v: boolean) => void;
  selectedLayer: CreatorLayer | null;
  updateLayer: (id: string, updates: Partial<CreatorLayer>, label?: string) => void;
  cutoutPreviewTarget: CreatorLayer | null;
  setCutoutPreviewTarget: (layer: CreatorLayer | null) => void;
}

export function CropCutoutSheets({
  cropMode,
  setCropMode,
  selectedLayer,
  updateLayer,
  cutoutPreviewTarget,
  setCutoutPreviewTarget }: CropCutoutSheetsProps) {
  return (
    <>
      {/* Pixel crop. The resulting local asset deliberately clears prior
          upload evidence so publish must upload/finalize the edited bytes. */}
      {cropMode && selectedLayer && selectedLayer.type === 'media' && (
        <CreatorCropSheet
          visible={cropMode}
          imageUri={selectedLayer.payload.mediaUri}
          focalPoint={selectedLayer.payload.focalPoint}
          onFocalPointChange={(point) => {
            if (selectedLayer && selectedLayer.type === 'media') {
              updateLayer(selectedLayer.id, {
                type: 'media',
                payload: {
                  ...selectedLayer.payload,
                  focalPoint: point,
                },
              }, 'Set focal point');
            }
          }}
          onClose={() => setCropMode(false)}
          onCropComplete={(newUri) => {
            if (selectedLayer && selectedLayer.type === 'media') {
              updateLayer(selectedLayer.id, {
                type: 'media',
                payload: {
                  ...selectedLayer.payload,
                  mediaUri: newUri,
                  mediaFinalizationId: undefined,
                  mediaAssetId: undefined,
                },
              }, 'Crop media');
            }
            setCropMode(false);
          }}
        />
      )}
      {/* True cutout preview sheet — native subject segmentation.
          Opens when the user taps "Cutout" in the media-selected
          overflow and the native backend is available. Shows a
          before/after preview over a checkerboard. On confirm,
          replaces the media URI with the transparent PNG and stores
          the alpha mask reference on the layer (spec 07 §7). */}
      {cutoutPreviewTarget && cutoutPreviewTarget.type === 'media' && (
        <CutoutPreviewSheet
          visible={!!cutoutPreviewTarget}
          imageUri={cutoutPreviewTarget.payload.mediaUri}
          onClose={() => setCutoutPreviewTarget(null)}
          onConfirm={(result: CutoutResult) => {
            if (cutoutPreviewTarget && cutoutPreviewTarget.type === 'media') {
              updateLayer(cutoutPreviewTarget.id, {
                type: 'media',
                payload: {
                  ...cutoutPreviewTarget.payload,
                  mediaUri: result.uri,
                  contentFit: 'contain',
                },
                maskRef: result.maskRef?.uri,
              } as Partial<CreatorLayer>, 'Apply cutout');
            }
            setCutoutPreviewTarget(null);
          }}
        />
      )}
    </>
  );
}
