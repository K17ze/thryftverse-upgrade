/**
 * Canonical project store type definitions.
 *
 * The filesystem project package is the single source of truth. Each project
 * is a self-contained directory bundling a CompositionDocument together with
 * the media assets it references. Assets are copied into the project's own
 * assets directory so that drafts never break when the original gallery media
 * is deleted.
 *
 * AsyncStorage holds only a lightweight index for fast listing — it is never
 * the source of truth.
 */

import type { CreatorDocument } from '../../composition';

// ── Schema versioning ──────────────────────────────────────────────

/** Current on-disk schema version. Bumped on breaking schema changes. */
export const PROJECT_SCHEMA_VERSION = 2;

/** Explicit, supported schema versions. */
export type ProjectVersion = 1 | 2;

// ── Project type (derived from composition) ────────────────────────

export type ProjectType = 'look' | 'poster';

// ── Asset index ─────────────────────────────────────────────────────

/** Supported media types for project-owned assets. */
export type AssetMediaType = 'image' | 'video' | 'audio' | 'mask';

/** Where the asset originated — tracked for provenance. */
export type AssetSource = 'camera' | 'gallery' | 'replace' | 'look' | 'generated';

/**
 * The asset index entry. `localPath` is relative to the project package
 * directory (e.g. `assets/{assetId}.{ext}`), making the package portable.
 */
export type ProjectAssetEntry = {
  type: AssetMediaType;
  originalFilename: string;
  localPath: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  durationMs?: number;
  importedAt: number;
  source: AssetSource;
};

/** Map of assetId → asset entry. */
export type ProjectAssetIndex = {
  [assetId: string]: ProjectAssetEntry;
};

// ── Project package ─────────────────────────────────────────────────

/**
 * A complete, durable project package persisted to disk as `project.json`.
 *
 * `composition` is the CompositionDocument (the authored creative document).
 * `assets` is the project-owned asset index. All media referenced by the
 * composition must have a corresponding entry in `assets` with a file copied
 * into the project's `assets/` directory.
 */
export type ProjectPackage = {
  version: ProjectVersion;
  projectId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  composition: CreatorDocument;
  assets: ProjectAssetIndex;
  thumbnailAssetId?: string;
  coverFrameAssetId?: string;
  folderId?: string;
  publishedAt?: number;
  publishId?: string;
};

// ── Migration result ────────────────────────────────────────────────

/**
 * Result of attempting to migrate a loaded project to the current schema
 * version.
 *
 * - `ok`               — migration succeeded (or was unnecessary); the
 *   validated project is returned.
 * - `unsupported`      — no migration path exists from `fromVersion` to
 *   `toVersion`. The original version is NOT stamped current; the caller
 *   must decide how to handle the gap.
 * - `recovery-needed`  — the data could not be validated even after
 *   migration attempts. The raw payload is included for recovery logic.
 */
export type MigrationResult =
  | { status: 'ok'; project: ProjectPackage }
  | { status: 'unsupported'; fromVersion: number; toVersion: number }
  | { status: 'recovery-needed'; reason: string; raw: unknown };

// ── Lightweight AsyncStorage index ──────────────────────────────────

/**
 * Lightweight index entry stored in AsyncStorage for fast project listing
 * without loading full packages from disk. The full project is always loaded
 * from the filesystem when opened.
 */
export type ProjectIndexEntry = {
  projectId: string;
  name: string;
  updatedAt: number;
  thumbnailAssetId?: string;
  folderId?: string;
};

// ── Crash journal ───────────────────────────────────────────────────

/**
 * A single crash-journal entry, written before risky operations and cleared
 * after successful completion.
 */
export type JournalEntry = {
  projectId: string;
  action: string;
  timestamp: number;
  data?: unknown;
};

// ── Legacy compatibility aliases ───────────────────────────────────
// These are retained so that files outside projectStore/ (which will be
// wired in the integration phase) continue to compile against the old
// surface. They are NOT used by the new canonical store.

/**
 * @deprecated Use {@link ProjectAssetEntry} instead. Retained for backward
 * compatibility with code that has not yet been migrated to the canonical
 * store.
 */
export type AssetRef = {
  id: string;
  sourceUri: string;
  localProjectUri?: string;
  remoteUri?: string;
  mediaType: AssetMediaType;
  width?: number;
  height?: number;
  durationMs?: number;
  contentHash?: string;
  proxyUri?: string;
  thumbnailUri?: string;
  uploadState: 'local' | 'queued' | 'uploading' | 'remote' | 'failed';
  createdAt: string;
};

/**
 * @deprecated Use {@link ProjectIndexEntry} instead. Retained for backward
 * compatibility.
 */
export type LegacyProjectIndexEntry = {
  id: string;
  type: ProjectType;
  title?: string;
  thumbnailUri?: string;
  updatedAt: string;
  assetCount: number;
};
