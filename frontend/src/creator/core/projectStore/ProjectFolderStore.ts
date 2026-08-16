/**
 * ProjectFolderStore — Zustand store for project folder management.
 *
 * (Meta Edits August 2026 feature)
 *
 * The store is the single source of truth for folder CRUD and project-
 * to-folder assignment. It persists the entire FolderCollection to
 * AsyncStorage on every mutation, so the UI always reflects durable
 * state.
 *
 * API:
 *   - folders: ProjectFolder[]
 *   - createFolder(name): create a new folder
 *   - renameFolder(id, name): rename
 *   - deleteFolder(id): delete (projects move back to root)
 *   - moveProjectToFolder(projectId, folderId | null): assign
 *   - getProjectsInFolder(folderId | null): read
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { createStableId } from '../../../utils/createStableId';
import type { ProjectFolder, FolderCollection } from './ProjectFolderTypes';
import { FOLDERS_STORAGE_KEY } from './ProjectFolderTypes';

// ── Store interface ─────────────────────────────────────────────────

interface ProjectFolderState {
  folders: ProjectFolder[];

  // ── Mutations ──
  createFolder: (name: string) => ProjectFolder;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  moveProjectToFolder: (projectId: string, folderId: string | null) => void;

  // ── Queries ──
  getProjectsInFolder: (folderId: string | null) => string[];
}

// ── Store implementation ────────────────────────────────────────────

export const useProjectFolderStore = create<ProjectFolderState>()(
  persist(
    (set, get) => ({
      folders: [],

      createFolder: (name: string) => {
        const trimmed = name.trim();
        const folder: ProjectFolder = {
          id: createStableId('folder'),
          name: trimmed || 'New Folder',
          createdAt: Date.now(),
          projectIds: [],
        };
        set((state) => ({
          folders: [...state.folders, folder],
        }));
        return folder;
      },

      renameFolder: (id: string, name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        set((state) => ({
          folders: state.folders.map((f) =>
            f.id === id ? { ...f, name: trimmed } : f,
          ),
        }));
      },

      deleteFolder: (id: string) => {
        // Deleting a folder moves its projects back to root (unfiled).
        // Since projectIds are stored on the folder, simply removing the
        // folder record is sufficient — projects are no longer referenced.
        set((state) => ({
          folders: state.folders.filter((f) => f.id !== id),
        }));
      },

      moveProjectToFolder: (projectId: string, folderId: string | null) => {
        set((state) => {
          // Remove the project from any existing folder, then add it to
          // the target folder (if folderId is not null).
          const folders = state.folders.map((f) => ({
            ...f,
            projectIds: f.projectIds.filter((pid) => pid !== projectId),
          }));
          if (folderId) {
            const target = folders.find((f) => f.id === folderId);
            if (target) {
              target.projectIds = [...target.projectIds, projectId];
            }
          }
          return { folders };
        });
      },

      getProjectsInFolder: (folderId: string | null) => {
        const { folders } = get();
        if (folderId === null) {
          // Root: all project IDs that are NOT in any folder.
          const inFolders = new Set<string>();
          for (const f of folders) {
            for (const pid of f.projectIds) {
              inFolders.add(pid);
            }
          }
          // The caller is expected to pass the full project list and
          // filter; here we return the set of IDs that are filed.
          // For root, we return an empty array — the caller should
          // compute root projects by excluding all filed IDs.
          // This is documented behaviour: getProjectsInFolder(null)
          // returns [] because root membership is the complement.
          void inFolders;
          return [];
        }
        const folder = folders.find((f) => f.id === folderId);
        return folder ? [...folder.projectIds] : [];
      },
    }),
    {
      name: FOLDERS_STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      // Persist only the folders array; the lastModified is derived.
      partialize: (state): FolderCollection => ({
        folders: state.folders,
        lastModified: Date.now(),
      }),
      // On rehydrate, extract the folders array from the persisted
      // FolderCollection shape.
      merge: (persisted, currentState) => {
        const collection = persisted as Partial<FolderCollection> | undefined;
        return {
          ...currentState,
          folders: collection?.folders ?? [],
        };
      },
    },
  ),
);

// ── Selectors ───────────────────────────────────────────────────────

/**
 * Get the count of projects in a folder (or root).
 * For root (null), the caller must provide the total project count
 * so we can subtract the filed projects.
 */
export function getFolderProjectCount(
  folders: ProjectFolder[],
  folderId: string | null,
  totalProjectCount: number,
): number {
  if (folderId === null) {
    const filedCount = folders.reduce(
      (sum, f) => sum + f.projectIds.length,
      0,
    );
    return Math.max(0, totalProjectCount - filedCount);
  }
  const folder = folders.find((f) => f.id === folderId);
  return folder ? folder.projectIds.length : 0;
}

/**
 * Find which folder a project belongs to (if any).
 */
export function findFolderForProject(
  folders: ProjectFolder[],
  projectId: string,
): ProjectFolder | null {
  return folders.find((f) => f.projectIds.includes(projectId)) ?? null;
}
