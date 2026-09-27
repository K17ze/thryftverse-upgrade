'use client';

/**
 * ProfileOptionsMenu — the public profile's overflow affordance. Rows:
 * Report (staged ReportSheet) and Block/Unblock. Block writes the same
 * safety store the inbox reads (useInboxSafety — ChatPanel and the
 * conversation panel block/unblock through it), and in live mode also
 * posts the account action (POST/DELETE /users/:id/block). Destructive
 * action gets a confirm sheet; success copy matches the inbox toast
 * grammar so the state reads identically on both surfaces.
 */

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { ConfirmSheet, type ConfirmSheetState } from '@/components/orders/ConfirmSheet';
import { ReportSheet } from '@/components/report/ReportSheet';
import { useInboxSafety } from '@/components/inbox/inboxSafety';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';
import { useHydrated } from '@/lib/store/useStore';
import { useSession } from '@/lib/session/SessionProvider';
import { DATA_MODE } from '@/lib/api/client';
import { blockUser, unblockUser } from '@/lib/api/services/users';
import type { User } from '@/lib/contracts/domain';
import { useShare } from './useShare';

interface ProfileOptionsMenuProps {
  user: User;
}

export function ProfileOptionsMenu({ user }: ProfileOptionsMenuProps) {
  const { show } = useToast();
  const share = useShare();
  const { user: me } = useSession();
  const hydrated = useHydrated();
  const blockedIds = useInboxSafety((s) => s.blockedUserIds);
  const toggleBlocked = useInboxSafety((s) => s.toggleBlocked);
  // Settings → Privacy keeps its own blocked list — writes land in both
  // stores so the profile action and the settings surface never disagree.
  const prefBlockedIds = useSettingsPrefs((s) => s.blockedIds);
  const prefBlock = useSettingsPrefs((s) => s.blockUser);
  const prefUnblock = useSettingsPrefs((s) => s.unblockUser);

  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmSheetState | null>(null);
  const [busy, setBusy] = useState(false);

  const blocked =
    hydrated &&
    (blockedIds.includes(user.id) || prefBlockedIds.includes(user.id));

  const applyBlock = (next: boolean) => {
    setBusy(true);
    const write =
      DATA_MODE === 'live'
        ? next
          ? blockUser(user.id)
          : unblockUser(user.id)
        : Promise.resolve();
    void write
      .then(() => {
        // inboxSafety is toggle-shaped; call it only when it disagrees so
        // the two stores converge rather than flip past each other.
        if (blockedIds.includes(user.id) !== next) toggleBlocked(user.id);
        if (next) prefBlock(user.id);
        else prefUnblock(user.id);
        show(
          next
            ? `@${user.username} blocked — they can't message you`
            : `@${user.username} unblocked`,
          'info',
        );
      })
      .catch(() => {
        show(
          next ? 'Could not block this member' : 'Could not unblock this member',
          'error',
        );
      })
      .finally(() => setBusy(false));
  };

  const askToggleBlock = () => {
    setMenuOpen(false);
    if (blocked) {
      applyBlock(false);
      return;
    }
    setConfirm({
      title: `Block @${user.username}?`,
      message:
        "They won't be able to message you, and you won't see their items. They aren't told.",
      confirmLabel: 'Block',
      variant: 'destructive',
      onConfirm: () => {
        setConfirm(null);
        applyBlock(true);
      },
    });
  };

  // Blocking yourself is meaningless — the menu only mounts on public
  // profiles, but guard anyway for stale own-profile renders.
  if (!me || me.id === user.id) return null;

  return (
    <>
      <IconButton
        name="more"
        aria-label="Profile options"
        aria-haspopup="dialog"
        onClick={() => setMenuOpen(true)}
      />
      <Sheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Profile options"
        maxWidth={400}
      >
        <div className="px-5 pb-5">
          <ul className="flex flex-col">
            {/* Share + copy first — the mobile more-sheet leads with
                distribution actions before safety rows. */}
            <li>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  void share({
                    url: `${window.location.origin}/u/${user.username}`,
                    title: `@${user.username} on ThryftVerse`,
                    copiedLabel: 'Profile link copied',
                  });
                }}
                className="pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left text-text-primary"
              >
                <Icon name="share" size={20} />
                <span className="flex-1 text-body-emphasis font-medium">Share profile</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  void navigator.clipboard
                    .writeText(`${window.location.origin}/u/${user.username}`)
                    .then(() => show('Profile link copied', 'success'))
                    .catch(() => show('Could not copy link', 'error'));
                }}
                className="pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left text-text-primary"
              >
                <Icon name="link" size={20} />
                <span className="flex-1 text-body-emphasis font-medium">Copy link</span>
              </button>
            </li>
            <li aria-hidden className="my-1 border-b border-border-subtle" />
            <li>
              <button
                type="button"
                onClick={askToggleBlock}
                disabled={busy}
                className="pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left text-text-primary"
              >
                <Icon name={blocked ? 'personAdd' : 'ban'} size={20} />
                <span className="flex-1 text-body-emphasis font-medium">
                  {blocked ? `Unblock @${user.username}` : `Block @${user.username}`}
                </span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setReportOpen(true);
                }}
                className="pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left text-text-primary"
              >
                <Icon name="flag" size={20} />
                <span className="flex-1 text-body-emphasis font-medium">
                  Report @{user.username}
                </span>
                <Icon name="forward" size={16} className="text-text-muted" />
              </button>
            </li>
          </ul>
        </div>
      </Sheet>
      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        target={{ type: 'user', id: user.id, label: `@${user.username}` }}
      />
      <ConfirmSheet sheet={confirm} busy={busy} onDismiss={() => setConfirm(null)} />
    </>
  );
}
