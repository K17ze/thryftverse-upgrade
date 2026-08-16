/**
 * Durable project store + asset registry type definitions.
 *
 * These types describe a self-contained "project package" that bundles a
 * CreatorDocument together with the media assets it references. Each asset is
 * copied into the project's own assets directory so that drafts never break
 * when the original gallery media is deleted.
 */

export type AssetMediaType = 'image' | 'video' | 'audio';

export type AssetUploadState = 'local' | 'queued' | 'uploading' | 'remote' | 'failed';

export type ProjectType = 'look' | 'poster';

/**
 * A reference to a media asset owned by a project.
 *
 * The asset file is copied from `sourceUri` (the original gallery URI, kept
 * for provenance) into the project's assets directory at `localProjectUri`.
 * After a successful upload, `remoteUri` is populated and `uploadState`
 * transitions to `'remote'`.
 */
export interface AssetRef {
  id: string;
  /** Original gallery URI (provenance — never mutated). */
  sourceUri: string;
  /** Copied into project storage; the durable, editable copy. */
  localProjectUri?: string;
  /** Populated after a successful upload. */
  remoteUri?: string;
  mediaType: AssetMediaType;
  width?: number;
  height?: number;
  durationMs?: number;
  /** Simple content hash (size + mtime, or md5 when available). */
  contentHash?: string;
  /** Low-res proxy for editing. */
  proxyUri?: string;
  thumbnailUri?: string;
  uploadState: AssetUploadState;
  createdAt: string;
}

/**
 * A complete, durable project package persisted to disk.
 *
 * `document` is the CreatorDocument (typed as `unknown` here to avoid a hard
 * dependency on the composition module's evolving schema; consumers cast as
 * needed).
 */
export interface ProjectPackage {
  id: string;
  version: number;
  type: ProjectType;
  title?: string;
  /** The CreatorDocument. */
  document: unknown;
  assets: Record<string, AssetRef>;
  thumbnailUri?: string;
  createdAt: string;
  updatedAt: string;
  /** Bumped whenever the on-disk shape changes; drives migrations. */
  renderVersion: string;
}

/**
 * Lightweight index entry used to list projects without loading full packages.
 */
export interface ProjectIndexEntry {
  id: string;
  type: ProjectType;
  title?: string;
  thumbnailUri?: string;
  updatedAt: string;
  assetCount: number;
}

/**
 * A migration function applied to a loaded project package to bring it up to
 * the current `renderVersion`.
 */
export type ProjectMigration = (project: any) => any;

/**
 * A single append-only crash-journal entry.
 */
export interface JournalEntry {
  projectId: string;
  action: string;
  timestamp: string;
  data?: unknown;
}
