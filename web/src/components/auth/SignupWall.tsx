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
 * action per session — dismissed once, repeat taps answer with a quiet
 * "Sign up" toast (rate-limited) rather than nagging the wall again.
 */

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { useSession } from '@/lib/session/SessionProvider';
import { useToast } from '@/components/ui/Toast';

/** Account-bound actions that raise the wall — mirrors the mobile set. */
export type SignupAction =
  | 'save_item'
  | 'follow_seller'
  | 'message_seller'
  | 'place_bid'
  | 'purchase'
  | 'create_listing'
  | 'create_board';

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
  create_board: {
    title: 'Join ThryftVerse to build boards',
    body: 'Create moodboards and collections to plan your next find.',
    icon: 'images',
  },
};

/**
 * Session memory — actions the wall has already covered. Module scope
 * means once per SPA session across every callsite, matching mobile.
 */
const shownActions = new Set<SignupAction>();

/** Short per-action lines for the quiet re-entry toast — the wall's full
 *  value sentence would shout; these just answer the tap. */
const NUDGE_COPY: Record<SignupAction, string> = {
  save_item: 'Sign up to save items',
  follow_seller: 'Sign up to follow sellers',
  message_seller: 'Sign up to message sellers',
  place_bid: 'Sign up to place bids',
  purchase: 'Sign up to buy securely',
  create_listing: 'Sign up to sell',
  create_board: 'Sign up to build boards',
};

/**
 * Per-action nudge cooldown — a repeat tap must always get an answer (a
 * dead control is a dead end), but rapid re-taps shouldn't stack toasts.
 * Longer than the toast's ~3s lifetime so pills never queue.
 */
const nudgedAt = new Map<SignupAction, number>();
const NUDGE_COOLDOWN_MS = 6000;

interface SignupWallProps {
  action: SignupAction | null;
  onClose: () => void;
}

/** The wall sheet itself — value sentence, two CTAs, quiet exit. */
export function SignupWall({ action, onClose }: SignupWallProps) {
  const router = useRouter();
  const copy = action ? ACTION_COPY[action] : null;

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <Sheet open={copy != null} onClose={onClose} title={copy?.title} ariaLabel="Create your account" maxWidth={400}>
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

// ── App-level provider ──────────────────────────────────────────────────
// One provider at the app root owns the wall sheet and the gate. Per-item
// consumers (every ProductTile, follow button, dock) read `requireAuth`
// from context — a stable callback, so opening/closing the wall
// re-renders the provider (the sheet) only, never the tile grid, and no
// consumer registers into module state on mount/unmount.

interface SignupWallContextValue {
  requireAuth: (action: SignupAction) => boolean;
}

const SignupWallContext = createContext<SignupWallContextValue | null>(null);

export function SignupWallProvider({ children }: { children: React.ReactNode }) {
  const { isGuest } = useSession();
  const { show } = useToast();
  const router = useRouter();
  const [action, setAction] = useState<SignupAction | null>(null);

  const requireAuth = useCallback(
    (requested: SignupAction): boolean => {
      if (!isGuest) return true;
      if (shownActions.has(requested)) {
        // The wall covered this action once and stayed quiet — but a
        // repeat tap is an intent signal, so answer it with a restrained
        // re-entry affordance rather than leaving the control dead.
        const last = nudgedAt.get(requested) ?? 0;
        if (Date.now() - last >= NUDGE_COOLDOWN_MS) {
          nudgedAt.set(requested, Date.now());
          show(NUDGE_COPY[requested], 'info', {
            label: 'Sign up',
            onPress: () => router.push('/auth/signup'),
          });
        }
        return false;
      }
      shownActions.add(requested);
      setAction(requested);
      return false;
    },
    [isGuest, show, router],
  );

  const close = useCallback(() => setAction(null), []);

  // Stable context value — the wall's open/close state lives in the
  // provider's own render, outside the context object.
  const value = useMemo(() => ({ requireAuth }), [requireAuth]);

  return (
    <SignupWallContext.Provider value={value}>
      {children}
      {/* The sheet — mounted exactly once, here. Sheet portals to
          document.body, so its position in the tree is invisible. */}
      <SignupWall action={action} onClose={close} />
    </SignupWallContext.Provider>
  );
}

/**
 * Gate an account-bound action behind the soft signup wall.
 *
 *   const { requireAuth } = useSignupWall();
 *   const handleSave = () => {
 *     if (!requireAuth('save_item')) return;
 *     // ... proceed
 *   };
 *
 * The wall sheet is owned by the app-level SignupWallProvider — callers
 * render nothing. The `wall` key stays in the return shape so existing
 * `{wall}` renders keep compiling; it is always null.
 */
export function useSignupWall() {
  const ctx = useContext(SignupWallContext);
  if (!ctx) throw new Error('useSignupWall must be used within SignupWallProvider');
  return { requireAuth: ctx.requireAuth, wall: null };
}
