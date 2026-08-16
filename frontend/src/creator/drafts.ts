import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CreatorDocument } from './composition';
import { migrateDocument } from './composition';
import { createStableId } from '../utils/createStableId';

const DRAFT_PREFIX = 'creator_draft_';
const DRAFT_INDEX_KEY = 'creator_draft_index';
const FOLDERS_KEY = '@thryftverse/creator/folders';

export interface DraftMeta {
  id: string;
  type: 'look' | 'poster';
  title: string;
  updatedAt: string;
  thumbnailUri?: string;
  folderId?: string;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: string;
  draftCount?: number;
}

export class CreatorDraftService {
  static async saveDraft(doc: CreatorDocument): Promise<void> {
    const key = `${DRAFT_PREFIX}${doc.id}`;
    await AsyncStorage.setItem(key, JSON.stringify(doc));
    await this.updateDraftIndex(doc);
  }

  static async loadDraft(id: string): Promise<CreatorDocument | null> {
    const key = `${DRAFT_PREFIX}${id}`;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as CreatorDocument;
      // Apply migrations (e.g. legacy 16:9 Poster ratio → 9:16)
      const migrated = migrateDocument(parsed);
      // If migration changed the document, persist the corrected version
      if (JSON.stringify(migrated) !== JSON.stringify(parsed)) {
        await AsyncStorage.setItem(key, JSON.stringify(migrated));
      }
      return migrated;
    } catch {
      return null;
    }
  }

  static async deleteDraft(id: string): Promise<void> {
    const key = `${DRAFT_PREFIX}${id}`;
    await AsyncStorage.removeItem(key);
    await this.removeFromDraftIndex(id);
  }

  static async listDrafts(): Promise<DraftMeta[]> {
    const raw = await AsyncStorage.getItem(DRAFT_INDEX_KEY);
    if (!raw) return [];
    try {
      const items = JSON.parse(raw) as DraftMeta[];
      return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch {
      return [];
    }
  }

  private static async updateDraftIndex(doc: CreatorDocument): Promise<void> {
    const raw = await AsyncStorage.getItem(DRAFT_INDEX_KEY);
    const items: DraftMeta[] = raw ? JSON.parse(raw) : [];
    const existingIdx = items.findIndex((i) => i.id === doc.id);
    const meta: DraftMeta = {
      id: doc.id,
      type: doc.type,
      title: doc.metadata.title || doc.metadata.caption.slice(0, 40) || `Untitled ${doc.type}`,
      updatedAt: doc.updatedAt,
      // Preserve existing folder assignment when re-saving a draft
      folderId: existingIdx >= 0 ? items[existingIdx].folderId : undefined,
    };
    if (existingIdx >= 0) {
      items[existingIdx] = meta;
    } else {
      items.push(meta);
    }
    await AsyncStorage.setItem(DRAFT_INDEX_KEY, JSON.stringify(items));
  }

  private static async removeFromDraftIndex(id: string): Promise<void> {
    const raw = await AsyncStorage.getItem(DRAFT_INDEX_KEY);
    if (!raw) return;
    const items: DraftMeta[] = JSON.parse(raw);
    const filtered = items.filter((i) => i.id !== id);
    await AsyncStorage.setItem(DRAFT_INDEX_KEY, JSON.stringify(filtered));
  }

  // ── Folders ────────────────────────────────────────────────────────
  // Folders are stored under `@thryftverse/creator/folders` as a JSON
  // array of Folder records. Drafts reference a folder via `folderId`
  // on their DraftMeta entry in the draft index. Existing drafts without
  // a folderId remain visible under "All Projects" (backward compatible).

  static async getFolders(): Promise<Folder[]> {
    const raw = await AsyncStorage.getItem(FOLDERS_KEY);
    if (!raw) return [];
    try {
      const folders = JSON.parse(raw) as Folder[];
      // Hydrate draft counts from the current draft index
      const drafts = await this.listDrafts();
      return folders
        .map((f) => ({
          ...f,
          draftCount: drafts.filter((d) => d.folderId === f.id).length,
        }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } catch {
      return [];
    }
  }

  static async createFolder(name: string): Promise<Folder> {
    const trimmed = name.trim();
    const folder: Folder = {
      id: createStableId('folder'),
      name: trimmed || 'New Folder',
      createdAt: new Date().toISOString(),
    };
    const folders = await this.getFoldersRaw();
    folders.push(folder);
    await AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
    return { ...folder, draftCount: 0 };
  }

  static async renameFolder(id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    const folders = await this.getFoldersRaw();
    const idx = folders.findIndex((f) => f.id === id);
    if (idx < 0) return;
    folders[idx] = { ...folders[idx], name: trimmed };
    await AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
  }

  static async deleteFolder(id: string): Promise<void> {
    // Remove the folder record and unfile any drafts that belonged to it
    const folders = await this.getFoldersRaw();
    const filtered = folders.filter((f) => f.id !== id);
    await AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(filtered));

    const drafts = await this.listDrafts();
    const updated = drafts.map((d) =>
      d.folderId === id ? { ...d, folderId: undefined } : d,
    );
    // Persist the unfiled state back to the index
    await AsyncStorage.setItem(DRAFT_INDEX_KEY, JSON.stringify(updated));
  }

  static async moveDraftToFolder(draftId: string, folderId: string | null): Promise<void> {
    const raw = await AsyncStorage.getItem(DRAFT_INDEX_KEY);
    if (!raw) return;
    const items: DraftMeta[] = JSON.parse(raw);
    const idx = items.findIndex((i) => i.id === draftId);
    if (idx < 0) return;
    items[idx] = {
      ...items[idx],
      folderId: folderId ?? undefined,
    };
    await AsyncStorage.setItem(DRAFT_INDEX_KEY, JSON.stringify(items));
  }

  private static async getFoldersRaw(): Promise<Folder[]> {
    const raw = await AsyncStorage.getItem(FOLDERS_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as Folder[];
    } catch {
      return [];
    }
  }
}
