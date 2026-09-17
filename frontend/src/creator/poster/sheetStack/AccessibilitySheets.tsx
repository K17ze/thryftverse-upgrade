/**
 * AccessibilitySheets — the keyboard/button-based accessibility sheet
 * branches of PosterSheetStack (move, z-order, transform).
 * Extracted verbatim from PosterSheetStack.tsx.
 */
import React from 'react';
import { AccessibilityMoveSheet } from '../../surfaces/AccessibilityMoveSheet';
import { AccessibilityZOrderSheet, type ZOrderLayer } from '../../surfaces/AccessibilityZOrderSheet';
import { AccessibilityTransformSheet } from '../../surfaces/AccessibilityTransformSheet';
import { layerTypeLabel } from '../../shared/layerUtils';
import type { CreatorLayer, CreatorPage } from '../../core/projectStore/composition';

interface AccessibilitySheetsProps {
  showA11yMove: boolean;
  showA11yZOrder: boolean;
  showA11yTransform: boolean;
  selectedLayerId: string | null;
  selectedLayer: CreatorLayer | null;
  page: CreatorPage | undefined;
  closeSheet: () => void;
  updateLayer: (id: string, updates: Partial<CreatorLayer>, label?: string) => void;
  reorderLayer: (id: string, direction: 'front' | 'forward' | 'backward' | 'back') => void;
}

export function AccessibilitySheets({
  showA11yMove,
  showA11yZOrder,
  showA11yTransform,
  selectedLayerId,
  selectedLayer,
  page,
  closeSheet,
  updateLayer,
  reorderLayer }: AccessibilitySheetsProps) {
  return (
    <>
      {/* ── Accessibility sheets (drag alternatives) ─────────────────── */}
      {/* Per spec 09: keyboard/button-based alternatives for users who
          cannot perform drag gestures. onMove wires to updateLayer;
          onReorder wires to reorderLayer. */}
      <AccessibilityMoveSheet
        visible={showA11yMove}
        layerId={selectedLayerId}
        position={selectedLayer ? { x: selectedLayer.x, y: selectedLayer.y } : null}
        onClose={closeSheet}
        onMove={(x, y) => {
          if (selectedLayerId) updateLayer(selectedLayerId, { x, y }, 'Move layer');
        }}
      />
      <AccessibilityZOrderSheet
        visible={showA11yZOrder}
        layers={(page?.layers ?? []).map((l) => ({
          id: l.id,
          label: layerTypeLabel(l.type),
          zIndex: l.zIndex,
        })) as ZOrderLayer[]}
        selectedLayerId={selectedLayerId}
        onClose={closeSheet}
        onReorder={(layerId, direction) => reorderLayer(layerId, direction)}
      />
      {/* Pinch/rotate alternative: button-driven scale + rotation. */}
      <AccessibilityTransformSheet
        visible={showA11yTransform}
        layerId={selectedLayerId}
        transform={
          selectedLayer
            ? { scale: selectedLayer.scale, rotation: selectedLayer.rotation }
            : null
        }
        onClose={closeSheet}
        onTransform={(scale, rotation) => {
          if (selectedLayerId) {
            updateLayer(selectedLayerId, { scale, rotation }, 'Resize & rotate layer');
          }
        }}
      />
    </>
  );
}
