import type { User } from '@/lib/contracts/domain';
import { DATA_MODE } from '@/lib/api/client';

export const USER_COLLECTIONS_KEY = ['user-collections'] as const;
export const LIVE = DATA_MODE === 'live';
export const EMPTY_IDS: string[] = [];

export interface ResolvedCollection {
  id: string;
  title: string;
  itemIds: string[];
  owner?: User | null;
  ownerId?: string;
  isPrivate?: boolean;
  description?: string | null;
  meta?: string;
  editable: boolean;
}
