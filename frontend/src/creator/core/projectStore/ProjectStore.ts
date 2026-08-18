/**
 * Canonical project store backed by the device file system (expo-file-system).
 *
 * The filesystem project package is the single source of truth. Each project
 * lives in its own directory:
 *
 *   {baseDir}/{projectId}/
 *     project.json        — the full ProjectPackage (source of truth)
 *     project.json.bak    — last known-good checkpoint (recovery)
 *     project.json.tmp    — in-flight write candidate (transient)
 *     assets/             — imported media owned by the project
 *     thumbnails/         — generated thumbnails
 *     proxies/            — video proxies (future)
 *     waveforms/          — waveform cache (future)
 *
 * AsyncStorage holds only a lightweight index for fast listing — it is never
 * the source of truth.
 *
 * Atomic checkpointing protocol (no data-loss window):
 *   1. Write payload to `project.json.tmp`.
 *   2. Verify the temp file by reading it back and schema-validating.
 *   3. If `project.json` exists, rename it → `project.json.bak`.
 *   4. Rename `project.json.tmp` → `project.json`.
 *   5. Delete `project.json.bak` only after the rename succeeds.
 *   6. On load, if `project.json` is missing/corrupt, recover from `.bak`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

import { createStableId } from '../../../utils/createStableId';
import type { CreatorDocument } from '../../composition';
import { createEmptyDocument } from '../../composition';
import { migrateProject } from './ProjectMigrations';
import { validateProject } from './ProjectSchema';
import type {
  ProjectIndexEntry,
  ProjectPackage,
  ProjectType,
} from './projectTypes';
import { PROJECT_SCHEMA_VERSION } from './projectTypes';

/** AsyncStorage key for the lightweight project index. */
const PROJECT_INDEX_KEY = '@thryftverse/creator/project_index';

export class ProjectStore {
  private baseDir: string;

  /**
   * @param baseDir Absolute `file://` URI of the creator projects root.
   *                Defaults to `{documentDirectory}creator_projects/`.
   */
  constructor(baseDir?: string) {
    const docDir = Paths.document.uri;
    this.baseDir = baseDir ?? `${docDir}${docDir.endsWith('/') ? '' : '/'}creator_projects/`;
  }

  // ── Initialization ────────────────────────────────────────────────

  /** Initialize the store directory structure (idempotent). */
  async init(): Promise<void> {
    const base = new Directory(this.baseDir);
    if (!base.exists) {
      base.create({ intermediates: true, idempotent: true });
    }
  }

  // ── Project lifecycle ─────────────────────────────────────────────

  /**
   * Create a new project directory + empty package and persist it.
   * The project is seeded with an empty CompositionDocument of the given
   * type and registered in the AsyncStorage index.
   */
  async createProject(
    type: ProjectType,
    options?: { name?: string; folderId?: string },
  ): Promise<ProjectPackage> {
    await this.init();
    const projectId = createStableId('proj');
    const now = Date.now();
    const composition: CreatorDocument = createEmptyDocument(type);
    // Use the composition's id as the projectId for traceability.
    composition.id = projectId;

    const name = options?.name ?? `Untitled ${type}`;

    const project: ProjectPackage = {
      version: PROJECT_SCHEMA_VERSION,
      projectId,
      name,
      createdAt: now,
      updatedAt: now,
      composition,
      assets: {},
      ...(options?.folderId ? { folderId: options.folderId } : {}),
    };

    // Create the project directory + subdirectories.
    this.ensureProjectDirs(projectId);

    await this.saveProject(project);
    await this.updateIndex(project);
    return project;
  }

  /**
   * Load a project package from disk with full recovery semantics.
   *
   * 1. Try `project.json` — parse, migrate, validate.
   * 2. If missing/corrupt/invalid, try `project.json.bak`.
   * 3. If both fail, return `null`.
   *
   * Every load runs schema validation. If migration returns `unsupported`,
   * the project is not loaded (the caller is informed via `null` and a
   * warning is logged).
   */
  async loadProject(projectId: string): Promise<ProjectPackage | null> {
    const jsonFile = new File(this.getProjectJsonPath(projectId));
    const bakFile = new File(this.getProjectBakPath(projectId));

    // Step 1: Try primary.
    const primary = await this.tryLoadFile(jsonFile);
    if (primary) return primary;

    // Step 2: Try backup.
    console.warn(
      `[ProjectStore] Primary project.json missing/corrupt for ${projectId}; attempting .bak recovery.`,
    );
    const backup = await this.tryLoadFile(bakFile);
    if (backup) {
      // Restore: write the recovered project back to project.json.
      await this.saveProject(backup);
      return backup;
    }

    return null;
  }

  /**
   * Save a project package using the atomic checkpointing protocol.
   *
   * This is the ONLY write path. It guarantees:
   * - No window where both the primary and backup are missing.
   * - The temp file is verified before promotion.
   * - The previous good checkpoint is preserved as `.bak` until the new
   *   one is confirmed.
   *
   * @returns `true` if the save succeeded, `false` if verification failed
   *          (the previous checkpoint is left intact).
   */
  async saveProject(project: ProjectPackage): Promise<boolean> {
    const projectDir = new Directory(this.getProjectDir(project.projectId));
    if (!projectDir.exists) {
      projectDir.create({ intermediates: true, idempotent: true });
    }

    const finalFile = new File(projectDir, 'project.json');
    const tmpFile = new File(projectDir, 'project.json.tmp');
    const bakFile = new File(projectDir, 'project.json.bak');

    const now = Date.now();
    const payload = JSON.stringify({
      ...project,
      version: PROJECT_SCHEMA_VERSION,
      updatedAt: now,
    });

    // Step 1: Write to temp file (overwrite any stale temp).
    if (tmpFile.exists) {
      tmpFile.delete();
    }
    tmpFile.create({ overwrite: true });
    tmpFile.write(payload);

    // Step 2: Verify the temp file by reading it back and validating.
    const verified = this.verifyTempFile(tmpFile);
    if (!verified) {
      // Verification failed — clean up the temp, leave the primary intact.
      try {
        if (tmpFile.exists) tmpFile.delete();
      } catch {
        // Non-fatal.
      }
      console.warn(
        `[ProjectStore] Temp file verification failed for ${project.projectId}; save aborted, primary intact.`,
      );
      return false;
    }

    // Step 3: Rename current primary → backup (if it exists).
    if (finalFile.exists) {
      try {
        finalFile.moveSync(bakFile, { overwrite: true });
      } catch (err) {
        // If we can't move the primary to backup, the primary is still
        // intact. Abort the save rather than risk losing it.
        console.warn(
          `[ProjectStore] Failed to checkpoint primary→bak for ${project.projectId}:`,
          err,
        );
        try {
          if (tmpFile.exists) tmpFile.delete();
        } catch {
          // Non-fatal.
        }
        return false;
      }
    }

    // Step 4: Rename temp → primary.
    try {
      tmpFile.moveSync(finalFile, { overwrite: true });
    } catch (err) {
      // Critical: temp→primary failed. Try to restore from backup.
      console.error(
        `[ProjectStore] CRITICAL: temp→primary rename failed for ${project.projectId}:`,
        err,
      );
      if (bakFile.exists) {
        try {
          bakFile.moveSync(finalFile, { overwrite: true });
          console.warn(
            `[ProjectStore] Restored primary from .bak after failed rename for ${project.projectId}.`,
          );
        } catch {
          // Both primary and backup are now missing — data loss.
          console.error(
            `[ProjectStore] FATAL: Could not restore from .bak for ${project.projectId}.`,
          );
        }
      }
      return false;
    }

    // Step 5: Delete the backup (only after successful rename).
    if (bakFile.exists) {
      try {
        bakFile.delete();
      } catch {
        // Non-fatal — a stale .bak is harmless and will be cleaned on
        // the next save.
      }
    }

    // Step 6: Update the AsyncStorage index.
    await this.updateIndex({ ...project, updatedAt: now });

    return true;
  }

  // ── Listing & deletion ────────────────────────────────────────────

  /**
   * List all projects from the AsyncStorage index (fast, no disk reads).
   * The index is kept in sync on every save/create/delete.
   */
  async listProjects(): Promise<ProjectIndexEntry[]> {
    const raw = await AsyncStorage.getItem(PROJECT_INDEX_KEY);
    if (!raw) return [];
    try {
      const items = JSON.parse(raw) as ProjectIndexEntry[];
      return items.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  }

  /**
   * Rebuild the AsyncStorage index from disk by scanning all project
   * directories. Use this on startup if the index is suspected to be
   * stale or after a crash recovery.
   */
  async rebuildIndex(): Promise<ProjectIndexEntry[]> {
    const base = new Directory(this.baseDir);
    if (!base.exists) return [];

    const entries: ProjectIndexEntry[] = [];
    for (const child of base.list()) {
      if (!(child instanceof Directory)) continue;
      const jsonFile = new File(child, 'project.json');
      if (!jsonFile.exists) continue;
      try {
        const raw = await jsonFile.text();
        const parsed = JSON.parse(raw) as Partial<ProjectPackage>;
        if (
          parsed &&
          typeof parsed.projectId === 'string' &&
          typeof parsed.name === 'string' &&
          typeof parsed.updatedAt === 'number'
        ) {
          entries.push({
            projectId: parsed.projectId,
            name: parsed.name,
            updatedAt: parsed.updatedAt,
            thumbnailAssetId: parsed.thumbnailAssetId,
            folderId: parsed.folderId ?? undefined,
          });
        }
      } catch {
        // Skip corrupt project directories.
      }
    }
    entries.sort((a, b) => b.updatedAt - a.updatedAt);
    await AsyncStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(entries));
    return entries;
  }

  /** Delete a project and its entire directory. Removes from the index. */
  async deleteProject(projectId: string): Promise<void> {
    const projectDir = new Directory(this.getProjectDir(projectId));
    if (projectDir.exists) {
      projectDir.delete();
    }
    await this.removeFromIndex(projectId);
  }

  // ── Path helpers ──────────────────────────────────────────────────

  /** Get the project directory path for a projectId. */
  getProjectDir(projectId: string): string {
    return `${this.baseDir}${projectId}/`;
  }

  /** Get the project.json path for a projectId. */
  getProjectJsonPath(projectId: string): string {
    return `${this.getProjectDir(projectId)}project.json`;
  }

  /** Get the project.json.bak path for a projectId. */
  getProjectBakPath(projectId: string): string {
    return `${this.getProjectDir(projectId)}project.json.bak`;
  }

  /** Get the assets directory path for a project. */
  getAssetsDir(projectId: string): string {
    return `${this.getProjectDir(projectId)}assets/`;
  }

  /** Get the thumbnails directory path for a project. */
  getThumbnailsDir(projectId: string): string {
    return `${this.getProjectDir(projectId)}thumbnails/`;
  }

  /** Get the video proxies directory path for a project. */
  getProxiesDir(projectId: string): string {
    return `${this.getProjectDir(projectId)}proxies/`;
  }

  /** Get the waveforms directory path for a project. */
  getWaveformsDir(projectId: string): string {
    return `${this.getProjectDir(projectId)}waveforms/`;
  }

  /** Get the base directory path. */
  getBaseDir(): string {
    return this.baseDir;
  }

  // ── Garbage collection ────────────────────────────────────────────

  /**
   * Garbage collection: remove project directories that are not in the
   * provided keep-list of ids. Returns the ids that were removed.
   *
   * If `keepIds` is omitted, no projects are removed (safety default —
   * callers must explicitly opt in by passing the live set).
   */
  async gc(keepIds?: string[]): Promise<string[]> {
    if (!keepIds) return [];
    const base = new Directory(this.baseDir);
    if (!base.exists) return [];

    const keep = new Set(keepIds);
    const removed: string[] = [];
    for (const child of base.list()) {
      if (!(child instanceof Directory)) continue;
      if (keep.has(child.name)) continue;
      try {
        child.delete();
        removed.push(child.name);
      } catch {
        // Ignore individual failures; report what we removed.
      }
    }
    return removed;
  }

  // ── Internal helpers ──────────────────────────────────────────────

  /**
   * Attempt to load, migrate, and validate a project from a single file.
   * Returns the validated project or `null`.
   */
  private async tryLoadFile(file: File): Promise<ProjectPackage | null> {
    if (!file.exists) return null;
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      const result = migrateProject(parsed);
      if (result.status === 'ok') {
        return result.project;
      }
      if (result.status === 'unsupported') {
        console.warn(
          `[ProjectStore] Project unsupported: v${result.fromVersion}→v${result.toVersion}. Not loading.`,
        );
        return null;
      }
      if (result.status === 'recovery-needed') {
        console.warn(
          `[ProjectStore] Project recovery-needed: ${result.reason}`,
        );
        return null;
      }
      return null;
    } catch (err) {
      console.warn(
        `[ProjectStore] Failed to parse project file:`,
        err,
      );
      return null;
    }
  }

  /**
   * Verify a temp file by reading it back and running schema validation.
   * Returns `true` if the file is valid.
   */
  private verifyTempFile(tmpFile: File): boolean {
    try {
      const raw = tmpFile.textSync();
      const parsed = JSON.parse(raw);
      return validateProject(parsed) !== null;
    } catch (err) {
      console.warn('[ProjectStore] Temp file verification error:', err);
      return false;
    }
  }

  /**
   * Ensure all project subdirectories exist.
   */
  private ensureProjectDirs(projectId: string): void {
    const dirs = [
      this.getProjectDir(projectId),
      this.getAssetsDir(projectId),
      this.getThumbnailsDir(projectId),
      this.getProxiesDir(projectId),
      this.getWaveformsDir(projectId),
    ];
    for (const dirPath of dirs) {
      const dir = new Directory(dirPath);
      if (!dir.exists) {
        dir.create({ intermediates: true, idempotent: true });
      }
    }
  }

  // ── AsyncStorage index management ──────────────────────────────────

  /**
   * Update (or insert) a single entry in the AsyncStorage index.
   */
  private async updateIndex(project: ProjectPackage): Promise<void> {
    const entries = await this.listProjects();
    const entry: ProjectIndexEntry = {
      projectId: project.projectId,
      name: project.name,
      updatedAt: project.updatedAt,
      thumbnailAssetId: project.thumbnailAssetId,
      folderId: project.folderId ?? undefined,
    };
    const idx = entries.findIndex((e) => e.projectId === entry.projectId);
    if (idx >= 0) {
      entries[idx] = entry;
    } else {
      entries.push(entry);
    }
    await AsyncStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(entries));
  }

  /**
   * Remove a project from the AsyncStorage index.
   */
  private async removeFromIndex(projectId: string): Promise<void> {
    const entries = await this.listProjects();
    const filtered = entries.filter((e) => e.projectId !== projectId);
    await AsyncStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(filtered));
  }
}
