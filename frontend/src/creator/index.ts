export { CreatorStudioScreen } from './studio/CreatorStudioShell';
export { LookComposerScreen } from './look/LookComposerScreen';
export { PosterComposerScreen } from './poster/PosterComposerScreen';
export { CreatorDraftListScreen } from './studio/CreatorDraftListScreen';
export { CreatorProvider, useCreator } from './studio/CreatorContext';
export { CreatorCanvas } from './studio/CreatorCanvas';
export { default as CreatorCamera } from './capture/CreatorCamera';
export { CreatorAssetPicker } from './surfaces/CreatorAssetPicker';
export type { AssetPickerMode } from './surfaces/CreatorAssetPicker';
export { CreatorSettingsSheet } from './surfaces/CreatorSettingsSheet';
export { CreatorTemplateBrowser } from './surfaces/CreatorTemplateBrowser';
export { lookToDocument, posterStoryToDocument } from './export/viewerAdapters';
export type { LookViewData, PosterStoryViewData, PosterFrameViewData } from './export/viewerAdapters';
export { CreatorAnalytics, setCreatorAnalyticsHandler, trackCreatorEvent } from './shared/creatorAnalytics';
export { LOOK_TEMPLATES, POSTER_TEMPLATES, ALL_TEMPLATES, getTemplateById, getTemplatesByType } from './studio/templates';
export type { CreatorTemplate } from './studio/templates';
export { uploadAllLocalMedia, hasLocalUris } from './core/upload/mediaUploadPipeline';
export type { CreatorDocument, CreatorLayer, CreatorPage, CreatorBackground, CreatorMetadata, LayerType } from './core/projectStore/composition';
export {
  createEmptyDocument,
  validateDocument,
  safeValidateDocument,
  migrateLookToDocument,
  migratePosterFramesToDocument,
  addLayerToPage,
  updateLayerInPage,
  removeLayerFromPage,
  reorderLayerZ,
  duplicateLayerInPage,
  getVisibleLayersSorted,
  getAllLayersSorted,
} from './core/projectStore/composition';
export { HistoryStack } from './core/projectStore/history';
export { CreatorDraftService } from './core/projectStore/drafts';
