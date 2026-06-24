import type { CreatorDocument, CreatorLayer } from './composition';
import { uploadMedia } from '../services/mediaUpload';

const LOCAL_URI_PREFIXES = ['file://', 'ph://', 'asset://', 'data:'];

function isLocalUri(uri: string): boolean {
  return LOCAL_URI_PREFIXES.some((prefix) => uri.startsWith(prefix));
}

interface MediaLayerRef {
  layerId: string;
  field: 'mediaUri' | 'thumbnailUri';
  currentUri: string;
}

function scanDocumentForLocalUris(doc: CreatorDocument): MediaLayerRef[] {
  const refs: MediaLayerRef[] = [];
  for (const page of doc.pages) {
    for (const layer of page.layers) {
      if (layer.type === 'media') {
        if (layer.payload.mediaUri && isLocalUri(layer.payload.mediaUri)) {
          refs.push({ layerId: layer.id, field: 'mediaUri', currentUri: layer.payload.mediaUri });
        }
        if (layer.payload.thumbnailUri && isLocalUri(layer.payload.thumbnailUri)) {
          refs.push({ layerId: layer.id, field: 'thumbnailUri', currentUri: layer.payload.thumbnailUri });
        }
      }
    }
  }
  return refs;
}

function replaceUriInDoc(doc: CreatorDocument, layerId: string, field: 'mediaUri' | 'thumbnailUri', newUri: string): CreatorDocument {
  return {
    ...doc,
    pages: doc.pages.map((page) => ({
      ...page,
      layers: page.layers.map((layer): CreatorLayer => {
        if (layer.id !== layerId || layer.type !== 'media') return layer;
        return {
          ...layer,
          payload: { ...layer.payload, [field]: newUri },
        };
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

export async function uploadAllLocalMedia(
  doc: CreatorDocument,
  onProgress?: (progress: UploadProgress) => void,
): Promise<CreatorDocument> {
  const refs = scanDocumentForLocalUris(doc);
  if (refs.length === 0) return doc;

  let workingDoc = doc;
  const cache = new Map<string, string>();

  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i];
    onProgress?.({ completed: i, total: refs.length, currentLayerId: ref.layerId });

    let remoteUri: string;
    if (cache.has(ref.currentUri)) {
      remoteUri = cache.get(ref.currentUri)!;
    } else {
      const folder = doc.type === 'look' ? 'looks' : 'posters';
      remoteUri = await uploadMedia(ref.currentUri, folder);
      cache.set(ref.currentUri, remoteUri);
    }

    workingDoc = replaceUriInDoc(workingDoc, ref.layerId, ref.field, remoteUri);
  }

  onProgress?.({ completed: refs.length, total: refs.length, currentLayerId: '' });
  return workingDoc;
}

export function hasLocalUris(doc: CreatorDocument): boolean {
  return scanDocumentForLocalUris(doc).length > 0;
}
