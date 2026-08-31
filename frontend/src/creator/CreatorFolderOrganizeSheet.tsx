/**
 * CreatorFolderOrganizeSheet — thin adapter wrapper that bridges the
 * draft data model to the generic FolderOrganizeSheet surface.
 *
 * Preserves the original export name and prop interface so consumers
 * (CreatorDraftListScreen) are unaffected.
 */
import React, { useMemo } from 'react';
import { CreatorDraftService, type Folder, type DraftMeta } from './drafts';
import {
  FolderOrganizeSheet,
  type FolderOrganizeAdapter,
  type OrganizeFolder,
  type OrganizeItem,
} from './surfaces/FolderOrganizeSheet';

interface CreatorFolderOrganizeSheetProps {
  visible: boolean;
  onClose: () => void;
  drafts: DraftMeta[];
  folders: Folder[];
  onFoldersChanged: () => void;
  onDraftsChanged: () => void;
}

export function CreatorFolderOrganizeSheet({
  visible,
  onClose,
  drafts,
  folders,
  onFoldersChanged,
  onDraftsChanged,
}: CreatorFolderOrganizeSheetProps) {
  // ── Map domain models to generic organize models ──
  const organizeFolders: OrganizeFolder[] = useMemo(
    () =>
      folders.map((f) => ({
        id: f.id,
        name: f.name,
        itemCount: f.draftCount ?? 0,
      })),
    [folders],
  );

  const organizeItems: OrganizeItem[] = useMemo(
    () =>
      drafts.map((d) => ({
        id: d.id,
        title: d.title,
        type: d.type,
        folderId: d.folderId ?? null,
        updatedAt: d.updatedAt,
      })),
    [drafts],
  );

  // ── Adapter: delegates to CreatorDraftService and notifies callers ──
  const adapter: FolderOrganizeAdapter = useMemo(
    () => ({
      folders: organizeFolders,
      items: organizeItems,
      async createFolder(name: string) {
        await CreatorDraftService.createFolder(name);
        onFoldersChanged();
      },
      async renameFolder(id: string, name: string) {
        await CreatorDraftService.renameFolder(id, name);
        onFoldersChanged();
      },
      async deleteFolder(id: string) {
        await CreatorDraftService.deleteFolder(id);
        onFoldersChanged();
        onDraftsChanged();
      },
      async moveItem(itemId: string, folderId: string | null) {
        await CreatorDraftService.moveDraftToFolder(itemId, folderId);
        onDraftsChanged();
      },
    }),
    [organizeFolders, organizeItems, onFoldersChanged, onDraftsChanged],
  );

  return (
    <FolderOrganizeSheet
      visible={visible}
      onClose={onClose}
      adapter={adapter}
      container="sheet"
      interaction="tap"
      itemNoun={{ singular: 'draft', plural: 'drafts' }}
      title="Folders"
      closeLabel="Close organize sheet"
    />
  );
}
