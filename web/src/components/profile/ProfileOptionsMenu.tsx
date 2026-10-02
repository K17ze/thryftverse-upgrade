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
import { useQueryClient } from '@tanstack/react-query';
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
import {
  blockUser,
  unblockUser,
  muteUser,
  unmuteUser,
  restrictUser,
  unrestrictUser,
} from '@/lib/api/services/users';
import {
  applyFixtureModeration,
  PROFILE_AGGREGATE_ROOT,
} from '@/lib/hooks/profile-queries';
import type { User } from '@/lib/contracts/domain';
import type { ProfileViewerState } from './ProfileHero';

interface ProfileOptionsMenuProps {
  user: User;
  /** Viewer-scoped flags from the profile aggregate — live truth for the
   *  mute/restrict labels; block also reads the local safety stores. */
  viewer?: ProfileViewerState;
  /** Opens the share-passport sheet — the hero owns it so the menu's
   *  share row lands on the same card the share button raises. */
  onShareProfile: () => void;
}

export function ProfileOptionsMenu({ user, viewer, onShareProfile }: ProfileOptionsMenuProps) {
  const { show } = useToast();
  const qc = useQueryClient();
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

  // Local stores are the fixture truth; the aggregate's viewer flags are
  // the live truth — either saying "blocked" is honoured.
  const blocked =
    viewer?.isBlocked === true ||
    (hydrated &&
      (blockedIds.includes(user.id) || prefBlockedIds.includes(user.id)));
  const muted = viewer?.isMuted === true;
  const restricted = viewer?.isRestricted === true;

  /** Re-read the profile aggregate after a moderation write so every
   *  consumer (blocked view, menu labels) settles on server truth. */
  const invalidateAggregate = () =>
    void qc.invalidateQueries({ queryKey: PROFILE_AGGREGATE_ROOT });

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
        invalidateAggregate();
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

  // Mute + restrict are the silent rungs of the moderation ladder (mobile
  // ProfileMoreSheet) — the member is never told. Fixture mode writes the
  // session overlay the aggregate derivation reads back.
  const applyModeration = (
    kind: 'mute' | 'restrict',
    next: boolean,
  ) => {
    setMenuOpen(false);
    setBusy(true);
    const write =
      DATA_MODE === 'live'
        ? kind === 'mute'
          ? next
            ? muteUser(user.id)
            : unmuteUser(user.id)
          : next
            ? restrictUser(user.id)
            : unrestrictUser(user.id)
        : Promise.resolve();
    void write
      .then(() => {
        if (DATA_MODE !== 'live') {
          applyFixtureModeration(
            user.id,
            kind === 'mute' ? { isMuted: next } : { isRestricted: next },
          );
        }
        invalidateAggregate();
        show(
          next
            ? `@${user.username} ${kind === 'mute' ? 'muted' : 'restricted'}`
            : `@${user.username} ${kind === 'mute' ? 'unmuted' : 'unrestricted'}`,
          'info',
        );
      })
      .catch(() => {
        show(`Could not update ${kind} for this member`, 'error');
      })
      .finally(() => setBusy(false));
  };

  const askToggleRestrict = () => {
    setMenuOpen(false);
    if (restricted) {
      applyModeration('restrict', false);
      return;
    }
    setConfirm({
      title: `Restrict @${user.username}?`,
      message:
        "Their messages move to your requests and they won't see when you've read them or when you're typing. They won't know they're restricted.",
      confirmLabel: 'Restrict',
      onConfirm: () => {
        setConfirm(null);
        applyModeration('restrict', true);
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
        aria-label={`Profile options for @${user.username}`}
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
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
                  onShareProfile();
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
            {/* Graduated moderation ladder — mute → restrict → block, the
                mobile more-sheet ordering. */}
            <li>
              <button
                type="button"
                onClick={() => applyModeration('mute', !muted)}
                disabled={busy}
                className="pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left text-text-primary"
              >
                <Icon name={muted ? 'notifications' : 'notificationsOff'} size={20} />
                <span className="flex-1 text-body-emphasis font-medium">
                  {muted ? `Unmute @${user.username}` : `Mute @${user.username}`}
                </span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={askToggleRestrict}
                disabled={busy}
                className="pressable flex min-h-12 w-full items-center gap-3.5 py-3 text-left text-text-primary"
              >
                <Icon name={restricted ? 'eye' : 'eyeOff'} size={20} />
                <span className="flex-1 text-body-emphasis font-medium">
                  {restricted ? `Unrestrict @${user.username}` : `Restrict @${user.username}`}
                </span>
              </button>
            </li>
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
