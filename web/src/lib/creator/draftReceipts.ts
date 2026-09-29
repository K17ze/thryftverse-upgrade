/**
 * Poster-draft upload receipts — small localStorage side-channel keyed by
 * draft id.
 *
 * Why this exists: a poster draft is a `posters` row with status 'draft'
 * (POST /posters). That row stores media_url but not the upload
 * finalization id, and publishing to a real story (POST /poster-stories)
 * requires the receipt — the backend refuses frames without
 * mediaFinalizationId. Native solves this by keeping drafts fully local;
 * web keeps the row server-side (so the draft list is real) and caches the
 * receipt here. If the cache is gone (other device, cleared storage) the
 * composer asks to re-add the media — an honest edge, never a silent drop.
 */

import type { StagedMediaReceipt } from '@/lib/api/services/creator';

const STORAGE_KEY = 'thryftverse.create.poster-receipts.v1';

type ReceiptMap = Record<string, StagedMediaReceipt>;

function readMap(): ReceiptMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed as ReceiptMap;
  } catch {
    return {};
  }
}

function writeMap(map: ReceiptMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage full/blocked — the draft row still persists server-side; the
    // publish path degrades to "re-add media" honestly.
  }
}

export function saveDraftReceipt(draftId: string, receipt: StagedMediaReceipt): void {
  const map = readMap();
  map[draftId] = receipt;
  writeMap(map);
}

export function readDraftReceipt(draftId: string): StagedMediaReceipt | null {
  const receipt = readMap()[draftId];
  return receipt && typeof receipt.finalizationId === 'string' && receipt.finalizationId.length > 0
    ? receipt
    : null;
}

export function dropDraftReceipt(draftId: string): void {
  const map = readMap();
  if (!(draftId in map)) return;
  delete map[draftId];
  writeMap(map);
}
