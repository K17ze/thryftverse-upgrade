/**
 * TemplatePickerSheets — the template browser and asset picker sheet
 * branches of PosterSheetStack. Extracted verbatim from
 * PosterSheetStack.tsx.
 */
import React from 'react';
import { CreatorTemplateBrowser } from '../../surfaces/CreatorTemplateBrowser';
import type { CreatorTemplate } from '../../studio/templates';
import { CreatorAssetPicker, type AssetPickerMode } from '../../surfaces/CreatorAssetPicker';
import type { CreatorLayer, CreatorDocument } from '../../core/projectStore/composition';

interface TemplatePickerSheetsProps {
  showTemplates: boolean;
  document: CreatorDocument;
  setShowTemplates: (v: boolean) => void;
  setDocument: (doc: CreatorDocument) => void;
  pickerMode: AssetPickerMode | null;
  editingLayer: CreatorLayer | null;
  backgroundMediaUri: string | undefined;
  handlePickerClose: () => void;
  handlePickerAddLayer: (layer: CreatorLayer) => void;
}

export function TemplatePickerSheets({
  showTemplates,
  document,
  setShowTemplates,
  setDocument,
  pickerMode,
  editingLayer,
  backgroundMediaUri,
  handlePickerClose,
  handlePickerAddLayer }: TemplatePickerSheetsProps) {
  return (
    <>
      <CreatorTemplateBrowser
        visible={showTemplates}
        documentType="poster"
        hasExistingWork={document.pages.some((p) => p.layers.length > 0)}
        onClose={() => setShowTemplates(false)}
        onApply={(template: CreatorTemplate) => {
          const doc = template.build();
          setDocument(doc);
        }}
      />
      <CreatorAssetPicker
        visible={pickerMode !== null}
        mode={pickerMode ?? 'media'}
        editingLayer={editingLayer}
        backgroundUri={backgroundMediaUri}
        onClose={handlePickerClose}
        onAddLayer={handlePickerAddLayer}
      />
    </>
  );
}
