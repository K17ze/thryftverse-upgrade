import { useCallback, useState } from 'react';
import type { CreatorDocument, CreatorLayer } from '../../core/projectStore/composition';
import { createStableId } from '../../../utils/createStableId';
import { haptics } from '../../../utils/haptics';

export interface UseClipboardOptions {
  document: CreatorDocument;
  activePageIndex: number;
  addLayer: (layer: CreatorLayer) => void;
}

export interface UseClipboard {
  clipboard: CreatorLayer | null;
  copyLayer: (layerId: string) => void;
  pasteLayer: () => void;
}

// ─── Copy / Paste ────────────────────────────────────────────────────────
export function useClipboard({
  document,
  activePageIndex,
  addLayer,
}: UseClipboardOptions): UseClipboard {
  const [clipboard, setClipboard] = useState<CreatorLayer | null>(null);

  const copyLayer = useCallback((layerId: string) => {
    const layer = document.pages[activePageIndex].layers.find((l) => l.id === layerId);
    if (layer) {
      setClipboard({ ...layer });
      haptics.selection();
    }
  }, [document, activePageIndex]);

  const pasteLayer = useCallback(() => {
    if (!clipboard) return;
    const newLayer: CreatorLayer = {
      ...clipboard,
      id: createStableId(clipboard.type),
      x: Math.min(clipboard.x + 0.05, 1.4),
      y: Math.min(clipboard.y + 0.05, 1.4),
    };
    addLayer(newLayer);
    setClipboard(null);
    haptics.tap();
  }, [clipboard, addLayer]);

  return { clipboard, copyLayer, pasteLayer };
}
