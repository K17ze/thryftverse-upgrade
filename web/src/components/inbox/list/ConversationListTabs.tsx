'use client';

import { Tabs } from '@/components/ui/Tabs';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import {
  SECONDARY_LABELS,
  SECONDARY_TABS,
  type Tab,
} from './inboxListTypes';

interface ConversationListTabsProps {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  secondaryOpen: boolean;
  onToggleSecondary: () => void;
  buyingUnreadCount: number;
  sellingUnreadCount: number;
  requestsCount: number;
  unreadThreadsCount: number;
  groupThreadsCount: number;
  mutedThreadsCount: number;
  /** Tab↔tabpanel pairing base — the caller's useId() (see ui/Tabs). */
  idBase?: string;
  /** Live tabpanel id while a secondary chip owns the list — the active
   *  chip carries it as aria-controls (only the active panel exists, so
   *  inactive chips must not reference it). */
  panelId?: string;
}

export function ConversationListTabs({
  tab,
  onTabChange,
  secondaryOpen,
  onToggleSecondary,
  buyingUnreadCount,
  sellingUnreadCount,
  requestsCount,
  unreadThreadsCount,
  groupThreadsCount,
  mutedThreadsCount,
  idBase,
  panelId,
}: ConversationListTabsProps) {
  return (
    <>
      {/* Segment rail — the mobile primary grammar (All / Buying /
          Selling / Requests, badges = unread counts) as text tabs on
          one hairline baseline; the secondary filters sit behind the
          funnel affordance as subordinate chips. */}
      <div className="mt-3 -mx-4 flex items-center border-b border-border-subtle pl-1 pr-4">
        <Tabs<Tab>
          hairline={false}
          className="min-w-0 flex-1"
          tabs={[
            { key: 'all', label: 'All' },
            { key: 'buying', label: 'Buying', count: buyingUnreadCount },
            { key: 'selling', label: 'Selling', count: sellingUnreadCount },
            {
              key: 'requests',
              label: 'Requests',
              count: requestsCount,
            },
          ]}
          // A secondary-tab selection lights no primary segment
          active={tab}
          onChange={onTabChange}
          ariaLabel="Inbox sections"
          idBase={idBase}
        />
        <IconButton
          name="filter"
          size={16}
          aria-label={
            secondaryOpen ? 'Hide inbox filters' : 'Show inbox filters'
          }
          aria-expanded={secondaryOpen || SECONDARY_TABS.includes(tab)}
          onClick={onToggleSecondary}
          className={`shrink-0 ${SECONDARY_TABS.includes(tab) ? 'text-brand' : ''}`}
        />
      </div>
      {secondaryOpen || SECONDARY_TABS.includes(tab) ? (
        <div
          className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto pb-0.5"
          role="group"
          aria-label="More inbox filters"
        >
          {SECONDARY_TABS.map((key) => (
            <Chip
              key={key}
              selected={tab === key}
              aria-controls={tab === key ? panelId : undefined}
              onClick={() => {
                // Picking the active chip again returns to All
                onTabChange(tab === key ? 'all' : key);
              }}
            >
              {SECONDARY_LABELS[key as keyof typeof SECONDARY_LABELS]}
              {key === 'unread' && unreadThreadsCount > 0
                ? ` · ${unreadThreadsCount}`
                : key === 'groups' && groupThreadsCount > 0
                  ? ` · ${groupThreadsCount}`
                  : key === 'muted' && mutedThreadsCount > 0
                    ? ` · ${mutedThreadsCount}`
                    : ''}
            </Chip>
          ))}
        </div>
      ) : null}
    </>
  );
}
