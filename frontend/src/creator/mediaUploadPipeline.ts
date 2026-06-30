import type { CreatorDocument, CreatorLayer } from './composition';
import { uploadMedia } from '../services/mediaUpload';

const LOCAL_URI_PREFIXES = [
  'file://',
  'ph://',
  'asset://',
  'data:',
  'content://',
  'assets-library://',
];

function isLocalUri(uri: string): boolean {
  return LOCAL_URI_PREFIXES.some((prefix) => uri.startsWith(prefix));
}

interface MediaLayerRef {
  layerId: string;
  field: string;
  currentUri: string;
  layerType: string;
}

function scanDocumentForLocalUris(doc: CreatorDocument): MediaLayerRef[] {
  const refs: MediaLayerRef[] = [];
  for (const page of doc.pages) {
    for (const layer of page.layers) {
      if (layer.type === 'media') {
        if (layer.payload.mediaUri && isLocalUri(layer.payload.mediaUri)) {
          refs.push({ layerId: layer.id, field: 'mediaUri', currentUri: layer.payload.mediaUri, layerType: 'media' });
        }
        if (layer.payload.thumbnailUri && isLocalUri(layer.payload.thumbnailUri)) {
          refs.push({ layerId: layer.id, field: 'thumbnailUri', currentUri: layer.payload.thumbnailUri, layerType: 'media' });
        }
      }
      if (layer.type === 'product' && layer.payload.snapshotImageUrl) {
        if (isLocalUri(layer.payload.snapshotImageUrl)) {
          refs.push({ layerId: layer.id, field: 'snapshotImageUrl', currentUri: layer.payload.snapshotImageUrl, layerType: 'product' });
        }
      }
      if (layer.type === 'look' && layer.payload.snapshotImageUrl) {
        if (isLocalUri(layer.payload.snapshotImageUrl)) {
          refs.push({ layerId: layer.id, field: 'snapshotImageUrl', currentUri: layer.payload.snapshotImageUrl, layerType: 'look' });
        }
      }
    }
  }
  return refs;
}

function replaceUriInDoc(doc: CreatorDocument, layerId: string, field: string, newUri: string): CreatorDocument {
  return {
    ...doc,
    pages: doc.pages.map((page) => ({
      ...page,
      layers: page.layers.map((layer): CreatorLayer => {
        if (layer.id !== layerId) return layer;
        if (layer.type === 'media' && (field === 'mediaUri' || field === 'thumbnailUri')) {
          return { ...layer, payload: { ...layer.payload, [field]: newUri } };
        }
        if (layer.type === 'product' && field === 'snapshotImageUrl') {
          return { ...layer, payload: { ...layer.payload, snapshotImageUrl: newUri } };
        }
        if (layer.type === 'look' && field === 'snapshotImageUrl') {
          return { ...layer, payload: { ...layer.payload, snapshotImageUrl: newUri } };
        }
        return layer;
      }),
    })),
    updatedAt: new Date().toISOString(),
  };
}

export interface UploadProgress {
  completed: number;
  total: number;
  currentLayerId: string;
}

const MAX_RETRIES = 2;

export async function uploadAllLocalMedia(
  doc: CreatorDocument,
  onProgress?: (progress: UploadProgress) => void,
): Promise<CreatorDocument> {
  const refs = scanDocumentForLocalUris(doc);
  if (refs.length === 0) return doc;

  let workingDoc = doc;
  const cache = new Map<string, string>();
  const folder = doc.type === 'look' ? 'looks' : 'posters';

  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i];
    onProgress?.({ completed: i, total: refs.length, currentLayerId: ref.layerId });

    let remoteUri: string;
    if (cache.has(ref.currentUri)) {
      remoteUri = cache.get(ref.currentUri)!;
    } else {
      let lastError: Error | null = null;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          remoteUri = await uploadMedia(ref.currentUri, folder);
          cache.set(ref.currentUri, remoteUri);
          lastError = null;
          break;
        } catch (err: any) {
          lastError = err;
          if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          }
        }
      }
      if (lastError) {
        throw new Error(`Failed to upload media for layer ${ref.layerId} after ${MAX_RETRIES + 1} attempts: ${lastError.message}`);
      }
      remoteUri = cache.get(ref.currentUri)!;
    }

    workingDoc = replaceUriInDoc(workingDoc, ref.layerId, ref.field, remoteUri);
  }

  onProgress?.({ completed: refs.length, total: refs.length, currentLayerId: '' });
  return workingDoc;
}

export function hasLocalUris(doc: CreatorDocument): boolean {
  return scanDocumentForLocalUris(doc).length > 0;
}
