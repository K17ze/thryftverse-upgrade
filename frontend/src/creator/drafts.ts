import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CreatorDocument } from './composition';

const DRAFT_PREFIX = 'creator_draft_';
const DRAFT_INDEX_KEY = 'creator_draft_index';

export interface DraftMeta {
  id: string;
  type: 'look' | 'poster';
  title: string;
  updatedAt: string;
  thumbnailUri?: string;
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
      return JSON.parse(raw) as CreatorDocument;
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
}
