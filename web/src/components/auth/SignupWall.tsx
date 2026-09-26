'use client';

/**
 * SignupWall — the soft signup wall from the mobile app, ported to the
 * Sheet primitive (bottom sheet on touch, centered dialog on desktop).
 * Raised when a guest attempts an account-bound action: one icon, one
 * value sentence, "Create account" / "Log in" CTAs, and an easy
 * "Maybe later" exit — never a hard redirect to /auth.
 *
 * `useSignupWall()` is the callsite hook — `requireAuth(action)` gates
 * the write action (`true` lets the caller proceed, `false` means the
 * guest was walled) and `wall` is the sheet element to render once in
 * the component tree. Like mobile, the wall shows at most once per
 * action per session — dismissed once, the action stays quietly
 * blocked rather than nagging again.
 */

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { useSession } from '@/lib/session/SessionProvider';

/** Account-bound actions that raise the wall — mirrors the mobile set. */
export type SignupAction =
  | 'save_item'
  | 'follow_seller'
  | 'message_seller'
  | 'place_bid'
  | 'purchase'
  | 'create_listing';

/** One title + one sentence per action — a value prop, never a hard sell. */
const ACTION_COPY: Record<SignupAction, { title: string; body: string; icon: AppIconName }> = {
  save_item: {
    title: 'Join ThryftVerse to save items',
    body: 'Create a free account to keep a closet of everything you love and come back to it anytime.',
    icon: 'bookmark',
  },
  follow_seller: {
    title: 'Join ThryftVerse to follow',
    body: 'Follow your favourite sellers and creators and see their new listings first.',
    icon: 'follow',
  },
  message_seller: {
    title: 'Join ThryftVerse to message sellers',
    body: 'Ask sellers questions and negotiate offers before you buy.',
    icon: 'chat',
  },
  place_bid: {
    title: 'Join ThryftVerse to place bids',
    body: 'Bid on live auctions and win the pieces everyone is watching.',
    icon: 'trending',
  },
  purchase: {
    title: 'Join ThryftVerse to buy',
    body: 'Check out securely — Buyer Protection covers every order.',
    icon: 'cart',
  },
  create_listing: {
    title: 'Join ThryftVerse to sell',
    body: 'List your own pieces and reach thousands of buyers.',
    icon: 'store',
  },
};

/**
 * Session memory — actions the wall has already covered. Module scope
 * means once per SPA session across every callsite, matching mobile.
 */
const shownActions = new Set<SignupAction>();

interface SignupWallProps {
  action: SignupAction | null;
  onClose: () => void;
}

export function SignupWall({ action, onClose }: SignupWallProps) {
  const router = useRouter();
  const copy = action ? ACTION_COPY[action] : null;

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <Sheet open={copy != null} onClose={onClose} title={copy?.title} maxWidth={400}>
      {copy ? (
        <div className="flex flex-col px-5 pb-6 pt-4">
          <div className="flex items-start gap-3">
            <Icon name={copy.icon} size={24} className="mt-0.5 shrink-0 text-brand" />
            <p className="text-body text-text-secondary">{copy.body}</p>
          </div>
          <div className="mt-6 flex flex-col gap-2">
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => go('/auth/signup')}
            >
              Create account
            </Button>
            <Button
              variant="secondary"
              size="md"
              fullWidth
              onClick={() => go('/auth/login')}
            >
              Log in
            </Button>
            <Button variant="quiet" size="md" fullWidth onClick={onClose}>
              Maybe later
            </Button>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}

/**
 * Gate an account-bound action behind the soft signup wall.
 *
 *   const { requireAuth, wall } = useSignupWall();
 *   const handleSave = () => {
 *     if (!requireAuth('save_item')) return;
 *     // ... proceed
 *   };
 *   // render {wall} once near the end of the component's JSX
 */
export function useSignupWall() {
  const { isGuest } = useSession();
  const [action, setAction] = useState<SignupAction | null>(null);

  const requireAuth = useCallback(
    (requested: SignupAction): boolean => {
      if (!isGuest) return true;
      // Already dismissed this action once this session — stay blocked
      // quietly rather than re-opening the same prompt.
      if (shownActions.has(requested)) return false;
      shownActions.add(requested);
      setAction(requested);
      return false;
    },
    [isGuest],
  );

  const close = useCallback(() => setAction(null), []);

  const wall = <SignupWall action={action} onClose={close} />;
  return { requireAuth, wall };
}
