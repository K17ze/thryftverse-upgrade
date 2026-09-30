export type Tab =
  | 'all'
  | 'buying'
  | 'selling'
  | 'requests'
  | 'unread'
  | 'groups'
  | 'muted'
  | 'archived';

export const TABS: Tab[] = [
  'all',
  'buying',
  'selling',
  'requests',
  'unread',
  'groups',
  'muted',
  'archived',
];

export const SECONDARY_TABS: Tab[] = ['unread', 'groups', 'muted', 'archived'];

export const SECONDARY_LABELS: Record<'unread' | 'groups' | 'muted' | 'archived', string> = {
  unread: 'Unread',
  groups: 'Groups',
  muted: 'Muted',
  archived: 'Archived',
};

export function isTab(value: string | null): value is Tab {
  return !!value && (TABS as string[]).includes(value);
}
