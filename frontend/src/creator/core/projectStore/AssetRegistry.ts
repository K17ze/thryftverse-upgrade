/**
 * Asset registry: imports, tracks, and manages media assets owned by a
 * project.
 *
 * The key durability guarantee: when a media asset is imported, the file is
 * COPIED from the source URI into the project's own `assets/` directory. The
 * project's asset index then references `localPath` (relative to the project
 * package) instead of the transient source URI, so deleting the original
 * from the gallery never breaks the draft.
 *
 * All acquisition paths (camera, gallery, replace, look, generated) must
 * route through `importAsset()` to ensure media is project-owned.
 */

import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { createStableId } from '../../../utils/createStableId';
import type { ProjectStore } from './ProjectStore';
import type {
  AssetMediaType,
  AssetSource,
  ProjectAssetEntry,
} from './projectTypes';

/** Thumbnail target width (height auto-scaled to preserve aspect ratio). */
const THUMBNAIL_WIDTH = 256;

/** Options for importing an asset. */
export type ImportAssetOptions = {
  type: AssetMediaType;
  source: AssetSource;
  originalFilename?: string;
  mimeType?: string;
};

export class AssetRegistry {
  private projectStore: ProjectStore;

  constructor(projectStore: ProjectStore) {
    this.projectStore = projectStore;
  }

  /**
   * Import a media asset into a project by copying the source file into the
   * project's `assets/` directory. Returns the registered assetId, or `null`
   * if the import failed.
   *
   * The asset entry is persisted into the project package's `assets` index
   * with a `localPath` relative to the project directory.
   */
  async importAsset(
    projectId: string,
    sourceUri: string,
    options: ImportAssetOptions,
  ): Promise<string | null> {
    const assetsDir = this.projectStore.getAssetsDir(projectId);
    const assetId = createStableId('asset');
    const now = Date.now();

    // Derive a file extension and filename from the source URI.
    const ext = extractExtension(sourceUri, options.type);
    const localFileName = `${assetId}.${ext}`;
    const localPath = `assets/${localFileName}`; // relative to project dir
    const absolutePath = `${assetsDir}${localFileName}`;

    // Ensure the assets directory exists.
    const destFile = new File(absolutePath);
    if (destFile.parentDirectory && !destFile.parentDirectory.exists) {
      destFile.parentDirectory.create({ intermediates: true, idempotent: true });
    }

    // Copy the source media into project-owned storage.
    const sourceFile = new File(sourceUri);
    try {
      await sourceFile.copy(destFile, { overwrite: true });
    } catch (err) {
      console.warn(`[AssetRegistry] Failed to copy asset from ${sourceUri}:`, err);
      return null;
    }

    // Verify file integrity after copy.
    if (!destFile.exists) {
      console.warn(`[AssetRegistry] Copied asset file does not exist at ${absolutePath}`);
      return null;
    }

    // Gather file metadata.
    const sizeBytes = getFileSize(destFile);
    const originalFilename = options.originalFilename ?? extractFilename(sourceUri);
    const mimeType = options.mimeType ?? defaultMimeType(options.type, ext);

    const entry: ProjectAssetEntry = {
      type: options.type,
      originalFilename,
      localPath,
      mimeType,
      sizeBytes,
      importedAt: now,
      source: options.source,
    };

    // Persist the asset entry into the project package.
    const project = await this.projectStore.loadProject(projectId);
    if (!project) {
      // Clean up the copied file if the project can't be loaded.
      try {
        if (destFile.exists) destFile.delete();
      } catch {
        // Non-fatal.
      }
      console.warn(`[AssetRegistry] Could not load project ${projectId} to register asset.`);
      return null;
    }

    project.assets[assetId] = entry;
    const saved = await this.projectStore.saveProject(project);
    if (!saved) {
      console.warn(`[AssetRegistry] Failed to persist asset entry for ${assetId}.`);
      // The file is copied but not indexed — caller should retry or the
      // file will be orphaned. We still return the assetId so the caller
      // can track it.
    }

    return assetId;
  }

  /**
   * Get an asset entry by ID (async — loads the project package).
   */
  async getAssetAsync(
    projectId: string,
    assetId: string,
  ): Promise<ProjectAssetEntry | null> {
    const project = await this.projectStore.loadProject(projectId);
    if (!project) return null;
    return project.assets[assetId] ?? null;
  }

  /**
   * Get the absolute URI for an asset's local file, given its relative
   * `localPath` within the project package.
   */
  getAssetUri(projectId: string, localPath: string): string {
    return `${this.projectStore.getProjectDir(projectId)}${localPath}`;
  }

  /**
   * Generate a low-res thumbnail for an asset and store it in the project's
   * `thumbnails/` directory.
   *
   * Supported for `image` assets (via expo-image-manipulator). Video
   * thumbnails require a platform-specific frame extractor and are skipped
   * (returns empty string). Audio/mask assets do not support thumbnails.
   *
   * Returns the thumbnail's relative path (e.g. `thumbnails/{assetId}_thumb.jpg`),
   * or an empty string if generation was skipped/failed.
   */
  async generateThumbnail(projectId: string, assetId: string): Promise<string> {
    const asset = await this.getAssetAsync(projectId, assetId);
    if (!asset) return '';
    if (asset.type !== 'image') return '';

    const thumbsDir = this.projectStore.getThumbnailsDir(projectId);
    const thumbName = `${assetId}_thumb.jpg`;
    const thumbRelPath = `thumbnails/${thumbName}`;
    const thumbAbsPath = `${thumbsDir}${thumbName}`;

    const sourceAbsPath = this.getAssetUri(projectId, asset.localPath);

    try {
      const context = ImageManipulator.manipulate(sourceAbsPath);
      context.resize({ width: THUMBNAIL_WIDTH });
      const rendered = await context.renderAsync();
      const result = await rendered.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.7,
      });

      // saveAsync writes to the cache directory; copy into project storage.
      const cacheFile = new File(result.uri);
      const destFile = new File(thumbAbsPath);
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

      // Record dimensions on the asset entry.
      const project = await this.projectStore.loadProject(projectId);
      if (project) {
        const a = project.assets[assetId];
        if (a) {
          a.width = a.width ?? result.width;
          a.height = a.height ?? result.height;
          await this.projectStore.saveProject(project);
        }
      }
      return thumbRelPath;
    } catch (err) {
      console.warn(`[AssetRegistry] Thumbnail generation failed for ${assetId}:`, err);
      return '';
    }
  }

  /**
   * Update an asset entry's dimensions (e.g. after probing video metadata).
   * Persists the change to the project package.
   */
  async updateAssetMetadata(
    projectId: string,
    assetId: string,
    updates: Partial<Pick<ProjectAssetEntry, 'width' | 'height' | 'durationMs'>>,
  ): Promise<void> {
    const project = await this.projectStore.loadProject(projectId);
    if (!project) return;
    const asset = project.assets[assetId];
    if (!asset) return;
    project.assets[assetId] = { ...asset, ...updates };
    await this.projectStore.saveProject(project);
  }

  /** Remove an asset (and its file + thumbnail). */
  async removeAsset(projectId: string, assetId: string): Promise<void> {
    const project = await this.projectStore.loadProject(projectId);
    if (!project) return;
    const asset = project.assets[assetId];
    if (!asset) return;

    // Delete the copied media file.
    const assetAbsPath = this.getAssetUri(projectId, asset.localPath);
    const assetFile = new File(assetAbsPath);
    if (assetFile.exists) {
      try {
        assetFile.delete();
      } catch {
        // Non-fatal.
      }
    }

    // Delete the thumbnail if it follows the convention.
    const thumbRelPath = `thumbnails/${assetId}_thumb.jpg`;
    const thumbAbsPath = this.getAssetUri(projectId, thumbRelPath);
    const thumbFile = new File(thumbAbsPath);
    if (thumbFile.exists) {
      try {
        thumbFile.delete();
      } catch {
        // Non-fatal.
      }
    }

    delete project.assets[assetId];
    await this.projectStore.saveProject(project);
  }

  /**
   * List all asset entries for a project (loads the full package).
   */
  async listAssets(projectId: string): Promise<ProjectAssetEntry[]> {
    const project = await this.projectStore.loadProject(projectId);
    if (!project) return [];
    return Object.values(project.assets);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Extract a file extension from a URI, falling back to a sensible default
 * per media type.
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
    case 'mask':
      return 'png';
    default:
      return 'bin';
  }
}

/**
 * Extract a filename from a URI (best-effort).
 */
function extractFilename(uri: string): string {
  const clean = uri.split('?')[0].split('#')[0];
  const slash = clean.lastIndexOf('/');
  if (slash >= 0 && slash < clean.length - 1) {
    return clean.slice(slash + 1);
  }
  return 'unknown';
}

/**
 * Default MIME type per media type + extension.
 */
function defaultMimeType(mediaType: AssetMediaType, ext: string): string {
  const e = ext.toLowerCase();
  switch (mediaType) {
    case 'image':
      if (e === 'png') return 'image/png';
      if (e === 'webp') return 'image/webp';
      if (e === 'gif') return 'image/gif';
      return 'image/jpeg';
    case 'video':
      if (e === 'mov') return 'video/quicktime';
      if (e === 'webm') return 'video/webm';
      return 'video/mp4';
    case 'audio':
      if (e === 'mp3') return 'audio/mpeg';
      if (e === 'wav') return 'audio/wav';
      return 'audio/m4a';
    case 'mask':
      return 'image/png';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Get the file size in bytes (best-effort).
 */
function getFileSize(file: File): number {
  try {
    return file.size ?? 0;
  } catch {
    return 0;
  }
}
