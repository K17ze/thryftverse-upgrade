/**
 * MediaBrowser — dedicated media browser component.
 *
 * Extracted from CreatorAssetPicker's monolithic MediaPicker as the first
 * step of the CreatorAssetPicker decomposition (spec 08_MEDIA_TOOLCHAIN).
 *
 * Usage:
 *   import { MediaBrowserSheet, type SelectedAsset } from '@/creator/tools/MediaBrowser';
 *
 *   <MediaBrowserSheet
 *     visible={visible}
 *     onClose={() => setVisible(false)}
 *     onConfirm={(assets) => { ... }}
 *     maxSelections={10}
 *     title="Select photos"
 *     showCameraTile
 *     allowVideos
 *   />
 */
export { MediaBrowserSheet } from './MediaBrowserSheet';
export type { MediaBrowserSheetProps, SelectedAsset } from './MediaBrowserSheet';
