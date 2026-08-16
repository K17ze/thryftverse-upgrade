/**
 * Asset registry: imports, tracks, and manages media assets owned by a
 * project.
 *
 * The key durability guarantee: when a media asset is imported, the file is
 * COPIED from the source gallery URI into the project's own assets directory.
 * The project then references `localProjectUri` (the durable copy) instead of
 * the transient gallery URI, so deleting the original from the gallery never
 * breaks the draft.
 */

import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { createStableId } from '../../../utils/createStableId';
import type { ProjectStore } from './ProjectStore';
import type { AssetMediaType, AssetRef, AssetUploadState } from './projectTypes';

/** Thumbnail target width (height auto-scaled to preserve aspect ratio). */
const THUMBNAIL_WIDTH = 256;

export class AssetRegistry {
  private projectStore: ProjectStore;

  constructor(projectStore: ProjectStore) {
    this.projectStore = projectStore;
  }

  /**
   * Import a media asset into a project by copying the source file into the
   * project's assets directory. Returns the registered AssetRef.
   */
  async importAsset(
    projectId: string,
    sourceUri: string,
    mediaType: AssetMediaType,
  ): Promise<AssetRef> {
    const assetsDir = this.projectStore.getAssetsDir(projectId);
    const assetId = createStableId('asset');
    const now = new Date().toISOString();

    // Derive a file extension from the source URI (best-effort).
    const ext = extractExtension(sourceUri, mediaType);
    const localFileName = `${assetId}.${ext}`;
    const localProjectUri = `${assetsDir}${localFileName}`;

    // Copy the source media into project-owned storage.
    const sourceFile = new File(sourceUri);
    const destFile = new File(localProjectUri);
    // Ensure the assets directory exists.
    if (destFile.parentDirectory && !destFile.parentDirectory.exists) {
      destFile.parentDirectory.create({ intermediates: true, idempotent: true });
    }
    await sourceFile.copy(destFile, { overwrite: true });

    // Compute a simple content hash from file size + modification time.
    const contentHash = computeSimpleHash(destFile);

    const asset: AssetRef = {
      id: assetId,
      sourceUri,
      localProjectUri,
      mediaType,
      contentHash,
      uploadState: 'local',
      createdAt: now,
    };

    // Persist the asset ref into the project package.
    const project = await this.projectStore.loadProject(projectId);
    if (project) {
      project.assets[assetId] = asset;
      await this.projectStore.saveProject(project);
    }

    return asset;
  }

  /** Get an asset by ID (reads from the in-memory project package). */
  getAsset(projectId: string, assetId: string): AssetRef | null {
    // Synchronous read of the project package is not available with the new
    // expo-file-system API; callers should prefer getAssetAsync. We perform
    // a best-effort synchronous text read.
    const jsonFile = new File(this.projectStore.getProjectJsonPath(projectId));
    if (!jsonFile.exists) return null;
    try {
      const raw = jsonFile.textSync();
      const pkg = JSON.parse(raw) as { assets?: Record<string, AssetRef> };
      return pkg.assets?.[assetId] ?? null;
    } catch {
      return null;
    }
  }

  /** Async variant of getAsset (preferred). */
  async getAssetAsync(projectId: string, assetId: string): Promise<AssetRef | null> {
    const project = await this.projectStore.loadProject(projectId);
    if (!project) return null;
    return project.assets[assetId] ?? null;
  }

  /**
   * Update an asset's upload state (and optionally record its remote URI).
   * Persists the change to the project package.
   */
  async updateAssetState(
    projectId: string,
    assetId: string,
    uploadState: AssetUploadState,
    remoteUri?: string,
  ): Promise<void> {
    const project = await this.projectStore.loadProject(projectId);
    if (!project) return;
    const asset = project.assets[assetId];
    if (!asset) return;
    asset.uploadState = uploadState;
    if (remoteUri !== undefined) {
      asset.remoteUri = remoteUri;
    }
    await this.projectStore.saveProject(project);
  }

  /**
   * Generate a low-res thumbnail for an asset and store it next to the asset.
   * Only supported for `image` assets (video/audio thumbnails require a
   * platform-specific frame extractor and are skipped here).
   *
   * Returns the thumbnail URI, or an empty string if generation was skipped.
   */
  async generateThumbnail(projectId: string, assetId: string): Promise<string> {
    const asset = await this.getAssetAsync(projectId, assetId);
    if (!asset || !asset.localProjectUri) return '';
    if (asset.mediaType !== 'image') return '';

    const assetsDir = this.projectStore.getAssetsDir(projectId);
    const thumbName = `${assetId}_thumb.jpg`;
    const thumbUri = `${assetsDir}${thumbName}`;

    try {
      const context = ImageManipulator.manipulate(asset.localProjectUri);
      context.resize({ width: THUMBNAIL_WIDTH });
      const rendered = await context.renderAsync();
      const result = await rendered.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.7,
      });

      // saveAsync writes to the cache directory; copy into project storage.
      const cacheFile = new File(result.uri);
      const destFile = new File(thumbUri);
      if (destFile.parentDirectory && !destFile.parentDirectory.exists) {
        destFile.parentDirectory.create({ intermediates: true, idempotent: true });
      }
      await cacheFile.copy(destFile, { overwrite: true });
      // Clean up the cache copy.
      try {
        cacheFile.delete();
      } catch {
        // Non-fatal.
      }

      // Record dimensions + thumbnail URI on the asset.
      const project = await this.projectStore.loadProject(projectId);
      if (project) {
        const a = project.assets[assetId];
        if (a) {
          a.thumbnailUri = thumbUri;
          a.width = a.width ?? result.width;
          a.height = a.height ?? result.height;
          await this.projectStore.saveProject(project);
        }
      }
      return thumbUri;
    } catch {
      return '';
    }
  }

  /** Remove an asset (and its file + thumbnail). */
  async removeAsset(projectId: string, assetId: string): Promise<void> {
    const project = await this.projectStore.loadProject(projectId);
    if (!project) return;
    const asset = project.assets[assetId];
    if (!asset) return;

    // Delete the copied media file.
    if (asset.localProjectUri) {
      const f = new File(asset.localProjectUri);
      if (f.exists) {
        try {
          f.delete();
        } catch {
          // Non-fatal.
        }
      }
    }
    // Delete the thumbnail.
    if (asset.thumbnailUri) {
      const t = new File(asset.thumbnailUri);
      if (t.exists) {
        try {
          t.delete();
        } catch {
          // Non-fatal.
        }
      }
    }
    // Delete the proxy.
    if (asset.proxyUri) {
      const p = new File(asset.proxyUri);
      if (p.exists) {
        try {
          p.delete();
        } catch {
          // Non-fatal.
        }
      }
    }

    delete project.assets[assetId];
    await this.projectStore.saveProject(project);
  }

  /** List all assets for a project (synchronous best-effort read). */
  listAssets(projectId: string): AssetRef[] {
    const jsonFile = new File(this.projectStore.getProjectJsonPath(projectId));
    if (!jsonFile.exists) return [];
    try {
      const raw = jsonFile.textSync();
      const pkg = JSON.parse(raw) as { assets?: Record<string, AssetRef> };
      return Object.values(pkg.assets ?? {});
    } catch {
      return [];
    }
  }
}

/**
 * Extract a file extension from a URI, falling back to a sensible default per
 * media type.
 */
function extractExtension(uri: string, mediaType: AssetMediaType): string {
  const clean = uri.split('?')[0].split('#')[0];
  const dot = clean.lastIndexOf('.');
  if (dot >= 0 && dot > clean.lastIndexOf('/')) {
    const ext = clean.slice(dot + 1).toLowerCase();
    if (/^[a-z0-9]{1,8}$/.test(ext)) return ext;
  }
  switch (mediaType) {
    case 'image':
      return 'jpg';
    case 'video':
      return 'mp4';
    case 'audio':
      return 'm4a';
    default:
      return 'bin';
  }
}

/**
 * Compute a simple, stable content hash from file size + modification time.
 * This avoids a full-file hash pass on every import while still detecting
 * most accidental re-imports of the same file. When the platform exposes an
 * md5 via `info({ md5: true })`, that is preferred.
 */
function computeSimpleHash(file: File): string {
  try {
    const info = file.info({ md5: true });
    if (info.md5) return `md5:${info.md5}`;
    const size = info.size ?? file.size ?? 0;
    const mtime = info.modificationTime ?? file.modificationTime ?? 0;
    return `size:${size}:mtime:${mtime}`;
  } catch {
    return '';
  }
}
