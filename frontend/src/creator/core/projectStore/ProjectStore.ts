/**
 * Durable project store backed by the device file system (expo-file-system).
 *
 * Each project lives in its own directory:
 *
 *   {baseDir}/{id}/project.json   — the full ProjectPackage
 *   {baseDir}/{id}/assets/        — copied media owned by the project
 *
 * Project data is NOT stored in AsyncStorage. AsyncStorage remains for small
 * key/value preferences; project packages (which can be large and reference
 * binary assets) are persisted as files so they survive gallery mutations.
 */

import { Directory, File, Paths } from 'expo-file-system';

import { createStableId } from '../../../utils/createStableId';
import type {
  ProjectIndexEntry,
  ProjectMigration,
  ProjectPackage,
  ProjectType,
} from './projectTypes';

/** Current on-disk shape version; bumped on breaking schema changes. */
export const CURRENT_RENDER_VERSION = '1';

/** Registered migrations keyed by the source version they upgrade from. */
const MIGRATIONS: Record<string, ProjectMigration> = {
  // Example: '0': (p) => ({ ...p, renderVersion: '1' })
};

/**
 * Applies any registered migrations to bring a loaded project up to the
 * current render version. Returns the migrated project (mutated in place
 * is avoided — a shallow clone is produced when a migration runs).
 */
export function migrateProject(project: ProjectPackage): ProjectPackage {
  let current = project;
  let guard = 0;
  while (current.renderVersion !== CURRENT_RENDER_VERSION && guard < 32) {
    const fn = MIGRATIONS[current.renderVersion];
    if (!fn) {
      // No migration path forward; stamp the current version so we don't loop.
      current = { ...current, renderVersion: CURRENT_RENDER_VERSION };
      break;
    }
    current = fn(current) as ProjectPackage;
    guard += 1;
  }
  return current;
}

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

  /** Initialize the store directory structure (idempotent). */
  async init(): Promise<void> {
    const base = new Directory(this.baseDir);
    if (!base.exists) {
      base.create({ intermediates: true, idempotent: true });
    }
  }

  /** Create a new project directory + empty package and persist it. */
  async createProject(type: ProjectType): Promise<ProjectPackage> {
    await this.init();
    const id = createStableId('proj');
    const now = new Date().toISOString();

    const project: ProjectPackage = {
      id,
      version: 1,
      type,
      title: undefined,
      document: null,
      assets: {},
      thumbnailUri: undefined,
      createdAt: now,
      updatedAt: now,
      renderVersion: CURRENT_RENDER_VERSION,
    };

    // Create the project directory + assets subdirectory.
    const projectDir = new Directory(this.getProjectDir(id));
    projectDir.create({ intermediates: true, idempotent: true });
    const assetsDir = new Directory(this.getAssetsDir(id));
    assetsDir.create({ intermediates: true, idempotent: true });

    await this.saveProject(project);
    return project;
  }

  /** Load a project package atomically (applies migrations). */
  async loadProject(id: string): Promise<ProjectPackage | null> {
    const jsonFile = new File(this.getProjectJsonPath(id));
    if (!jsonFile.exists) return null;
    try {
      const raw = await jsonFile.text();
      const parsed = JSON.parse(raw) as ProjectPackage;
      return migrateProject(parsed);
    } catch {
      return null;
    }
  }

  /**
   * Save a project package atomically: write to `project.json.tmp`, then
   * rename over `project.json`. This avoids leaving a half-written package
   * if the process is interrupted mid-write.
   */
  async saveProject(project: ProjectPackage): Promise<void> {
    const projectDir = new Directory(this.getProjectDir(project.id));
    if (!projectDir.exists) {
      projectDir.create({ intermediates: true, idempotent: true });
    }

    const finalFile = new File(projectDir, 'project.json');
    const tmpFile = new File(projectDir, 'project.json.tmp');

    const payload = JSON.stringify({
      ...project,
      updatedAt: new Date().toISOString(),
      renderVersion: CURRENT_RENDER_VERSION,
    });

    // Write the temp file (overwrite if a stale temp exists).
    if (tmpFile.exists) {
      tmpFile.delete();
    }
    tmpFile.create({ overwrite: true });
    tmpFile.write(payload);

    // Atomic rename: move temp → final.
    if (finalFile.exists) {
      finalFile.delete();
    }
    tmpFile.moveSync(finalFile, { overwrite: true });
  }

  /** List all projects as lightweight index entries. */
  async listProjects(): Promise<ProjectIndexEntry[]> {
    const base = new Directory(this.baseDir);
    if (!base.exists) return [];

    const entries: ProjectIndexEntry[] = [];
    for (const child of base.list()) {
      if (!(child instanceof Directory)) continue;
      const jsonFile = new File(child, 'project.json');
      if (!jsonFile.exists) continue;
      try {
        const raw = await jsonFile.text();
        const pkg = JSON.parse(raw) as ProjectPackage;
        entries.push({
          id: pkg.id,
          type: pkg.type,
          title: pkg.title,
          thumbnailUri: pkg.thumbnailUri,
          updatedAt: pkg.updatedAt,
          assetCount: Object.keys(pkg.assets ?? {}).length,
        });
      } catch {
        // Skip corrupt project directories.
      }
    }
    entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return entries;
  }

  /** Delete a project and its assets directory. */
  async deleteProject(id: string): Promise<void> {
    const projectDir = new Directory(this.getProjectDir(id));
    if (projectDir.exists) {
      projectDir.delete();
    }
  }

  /** Get the project directory path for an id. */
  getProjectDir(id: string): string {
    return `${this.baseDir}${id}/`;
  }

  /** Get the project.json path for an id. */
  getProjectJsonPath(id: string): string {
    return `${this.getProjectDir(id)}project.json`;
  }

  /** Get the assets directory path for a project. */
  getAssetsDir(id: string): string {
    return `${this.getProjectDir(id)}assets/`;
  }

  /** Get the base directory path. */
  getBaseDir(): string {
    return this.baseDir;
  }

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
      if (child.name === '.journal') continue;
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
}
