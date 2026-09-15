import type { CreatorDocument } from './composition';

/**
 * A media-bearing field discovered while walking a composition document.
 * Each reference maps a (layerId, field) pair to a URI and its associated
 * finalization/asset evidence from the document payload.
 *
 * This is the client-side mirror of the server's `extractMediaReferences`
 * walker (backend/api/src/routes/creatorPublications.ts). The two must
 * stay in lockstep — any media-bearing field the server walks must also
 * be walked here, or `validateMediaCoverage` rejects with
 * MEDIA_COVERAGE_MISMATCH.
 */
export interface MediaReference {
  layerId: string;
  /** The document field that carries the URI ('mediaUri', 'thumbnailUri', 'snapshotImageUrl'). */
  field: string;
  uri: string;
  finalizationId?: string;
  mediaAssetId?: string;
  mediaType: 'image' | 'video';
  /**
   * The expectedMedia role that corresponds to this field. Must match the
   * server's role string exactly — coverage is keyed on (layerId, role).
   */
  role: string;
}

/** Synthetic layer id for the document-scoped canvas background ref —
 *  must match the server walker's key exactly (coverage is (layerId, role)). */
export const CANVAS_LAYER_ID = '__canvas__';

const LOCAL_URI_PREFIXES = [
  'file://',
  'ph://',
  'asset://',
  'data:',
  'content://',
  'assets-library://',
];

export function isLocalUri(uri: string): boolean {
  return LOCAL_URI_PREFIXES.some((prefix) => uri.startsWith(prefix));
}

/**
 * Walk every page and every layer in a composition document and extract
 * every media-bearing reference.
 *
 * Media-bearing fields by layer type (mirrors the server walker):
 *  - media:   mediaUri    (role: 'primary')    → mediaFinalizationId / mediaAssetId
 *             thumbnailUri (role: 'thumbnail') → thumbnailFinalizationId / thumbnailMediaAssetId
 *  - product: snapshotImageUrl (role: 'product-snapshot') → snapshotMediaFinalizationId / snapshotMediaAssetId
 *  - look:    snapshotImageUrl (role: 'look-snapshot')    → snapshotMediaFinalizationId / snapshotMediaAssetId
 *
 * Non-media layers (text, mention, vote, quiz, etc.) produce no references.
 */
export function walkMediaReferences(doc: CreatorDocument): MediaReference[] {
  const refs: MediaReference[] = [];

  // Canvas background image — document-scoped, keyed under the fixed
  // '__canvas__' layer id. Mirrors the server walker's canvas entry.
  const bg = doc.canvas?.background;
  if (
    bg?.type === 'image'
    && (typeof bg.value === 'string' || bg.mediaFinalizationId || bg.mediaAssetId)
  ) {
    refs.push({
      layerId: CANVAS_LAYER_ID,
      field: 'backgroundValue',
      uri: typeof bg.value === 'string' ? bg.value : '',
      finalizationId: bg.mediaFinalizationId,
      mediaAssetId: bg.mediaAssetId,
      mediaType: 'image',
      role: 'canvas-background',
    });
  }

  for (const page of doc.pages) {
    for (const layer of page.layers) {
      // Alpha mask (cutout) — a base-level ref on ANY layer type. The
      // mask PNG is a media-bearing asset that must upload + render
      // with the layer. Mirrors the server walker's 'mask' entry.
      if (layer.maskRef || layer.maskFinalizationId || layer.maskMediaAssetId) {
        refs.push({
          layerId: layer.id,
          field: 'maskRef',
          uri: typeof layer.maskRef === 'string' ? layer.maskRef : '',
          finalizationId: layer.maskFinalizationId,
          mediaAssetId: layer.maskMediaAssetId,
          mediaType: 'image',
          role: 'mask',
        });
      }
      if (layer.type === 'media') {
        // Primary media
        if (layer.payload.mediaUri || layer.payload.mediaFinalizationId || layer.payload.mediaAssetId) {
          refs.push({
            layerId: layer.id,
            field: 'mediaUri',
            uri: layer.payload.mediaUri ?? '',
            finalizationId: layer.payload.mediaFinalizationId,
            mediaAssetId: layer.payload.mediaAssetId,
            mediaType: layer.payload.mediaType ?? 'image',
            role: 'primary',
          });
        }
        // Thumbnail (video poster image)
        if (layer.payload.thumbnailUri || layer.payload.thumbnailFinalizationId || layer.payload.thumbnailMediaAssetId) {
          refs.push({
            layerId: layer.id,
            field: 'thumbnailUri',
            uri: layer.payload.thumbnailUri ?? '',
            finalizationId: layer.payload.thumbnailFinalizationId,
            mediaAssetId: layer.payload.thumbnailMediaAssetId,
            mediaType: 'image',
            role: 'thumbnail',
          });
        }
      } else if (layer.type === 'product') {
        if (layer.payload.snapshotImageUrl || layer.payload.snapshotMediaFinalizationId || layer.payload.snapshotMediaAssetId) {
          refs.push({
            layerId: layer.id,
            field: 'snapshotImageUrl',
            uri: layer.payload.snapshotImageUrl ?? '',
            finalizationId: layer.payload.snapshotMediaFinalizationId,
            mediaAssetId: layer.payload.snapshotMediaAssetId,
            mediaType: 'image',
            role: 'product-snapshot',
          });
        }
      } else if (layer.type === 'look') {
        if (layer.payload.snapshotImageUrl || layer.payload.snapshotMediaFinalizationId || layer.payload.snapshotMediaAssetId) {
          refs.push({
            layerId: layer.id,
            field: 'snapshotImageUrl',
            uri: layer.payload.snapshotImageUrl ?? '',
            finalizationId: layer.payload.snapshotMediaFinalizationId,
            mediaAssetId: layer.payload.snapshotMediaAssetId,
            mediaType: 'image',
            role: 'look-snapshot',
          });
        }
      }
    }
  }

  return refs;
}
