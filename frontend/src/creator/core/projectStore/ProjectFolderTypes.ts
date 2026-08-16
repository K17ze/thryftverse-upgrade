/**
 * Project folder type definitions (Meta Edits August 2026 feature).
 *
 * Folders group projects for organization. Each folder owns a list of
 * projectIds — projects not in any folder are "root" (unfiled).
 *
 * The folder collection is persisted to AsyncStorage as a single JSON
 * blob via the ProjectFolderStore Zustand store.
 */

// ── Folder ──────────────────────────────────────────────────────────

/**
 * A project folder. `projectIds` is the authoritative list of projects
 * that belong to this folder. A project appears in at most one folder.
 */
export interface ProjectFolder {
  id: string;
  name: string;
  /** Epoch milliseconds. */
  createdAt: number;
  /** Project IDs assigned to this folder. */
  projectIds: string[];
}

// ── Collection ──────────────────────────────────────────────────────

/**
 * The persisted folder collection. Stored as a single JSON value in
 * AsyncStorage under `FOLDERS_STORAGE_KEY`.
 */
export interface FolderCollection {
  folders: ProjectFolder[];
  /** Epoch milliseconds of the last modification. */
  lastModified: number;
}

// ── Storage key ─────────────────────────────────────────────────────

/** AsyncStorage key for the persisted folder collection. */
export const FOLDERS_STORAGE_KEY = '@thryftverse/creator/project_folders';
