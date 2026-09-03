/**
 * ProjectFolderOrganizeMode — thin adapter wrapper that bridges the
 * project folder store (Zustand) to the generic FolderOrganizeSheet
 * surface.
 *
 * Preserves the original export name and prop interface so consumers
 * are unaffected.
 */
import React, { useMemo } from 'react';
import {
  useProjectFolderStore,
  findFolderForProject,
} from './core/projectStore/ProjectFolderStore';
import type { ProjectFolder } from './core/projectStore/ProjectFolderTypes';
import {
  FolderOrganizeSheet,
  type FolderOrganizeAdapter,
  type OrganizeFolder,
  type OrganizeItem,
} from './surfaces/FolderOrganizeSheet';

// ── Props ───────────────────────────────────────────────────────────

export interface ProjectOrganizeItem {
  id: string;
  title: string;
  type: 'look' | 'poster';
}

interface ProjectFolderOrganizeModeProps {
  visible: boolean;
  onClose: () => void;
  projects: ProjectOrganizeItem[];
}

// ── Component ───────────────────────────────────────────────────────

export function ProjectFolderOrganizeMode({
  visible,
  onClose,
  projects,
}: ProjectFolderOrganizeModeProps) {
  const folders = useProjectFolderStore((s) => s.folders);
  const createFolder = useProjectFolderStore((s) => s.createFolder);
  const renameFolder = useProjectFolderStore((s) => s.renameFolder);
  const deleteFolder = useProjectFolderStore((s) => s.deleteFolder);
  const moveProjectToFolder = useProjectFolderStore((s) => s.moveProjectToFolder);

  // ── Map domain models to generic organize models ──
  const organizeFolders: OrganizeFolder[] = useMemo(
    () =>
      folders.map((f: ProjectFolder) => ({
        id: f.id,
        name: f.name,
        itemCount: f.projectIds.length,
      })),
    [folders],
  );

  const organizeItems: OrganizeItem[] = useMemo(
    () =>
      projects.map((p) => {
        const folder = findFolderForProject(folders, p.id);
        return {
          id: p.id,
          title: p.title,
          type: p.type,
          folderId: folder?.id ?? null,
        };
      }),
    [projects, folders],
  );

  // ── Adapter: delegates to the Zustand store ──
  const adapter: FolderOrganizeAdapter = useMemo(
    () => ({
      folders: organizeFolders,
      items: organizeItems,
      createFolder(name: string) {
        createFolder(name);
      },
      renameFolder(id: string, name: string) {
        renameFolder(id, name);
      },
      deleteFolder(id: string) {
        deleteFolder(id);
      },
      moveItem(itemId: string, folderId: string | null) {
        moveProjectToFolder(itemId, folderId);
      },
    }),
    [organizeFolders, organizeItems, createFolder, renameFolder, deleteFolder, moveProjectToFolder],
  );

  return (
    <FolderOrganizeSheet
      visible={visible}
      onClose={onClose}
      adapter={adapter}
      container="modal"
      interaction="drag"
      itemNoun={{ singular: 'project', plural: 'projects' }}
      title="Organize"
      closeLabel="Done organizing"
      hint="Drag projects into folders. Tap a folder name to rename. Long-press a folder for more options."
    />
  );
}
