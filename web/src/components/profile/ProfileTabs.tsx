'use client';

/**
 * ProfileTabs — sticky underline tab rail (Items | Sold | Reviews | …).
 * Thin wrapper over the shared ui/Tabs primitive: the strip sticks under
 * the header with a blurred canvas, tabs toggle local state (buttons, no
 * history/hash pollution) or navigate (href → route links) — one grammar
 * for both.
 */

import { Tabs, type TabItem } from '@/components/ui/Tabs';

interface ProfileTabsProps<T extends string> {
  tabs: TabItem<T>[];
  active: T;
  onChange?: (tab: T) => void;
  /** Accessible label for the tablist/nav landmark. */
  ariaLabel?: string;
}

export function ProfileTabs<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel = 'Sections',
}: ProfileTabsProps<T>) {
  return (
    <div className="sticky top-16 z-elevated bg-background/95 backdrop-blur-sm">
      <Tabs
        tabs={tabs}
        active={active}
        onChange={onChange}
        ariaLabel={ariaLabel}
        railClassName="px-1 sm:px-3"
      />
    </div>
  );
}
