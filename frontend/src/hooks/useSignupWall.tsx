import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useStore } from '../store/useStore';
import { useHaptic } from './useHaptic';
import { SignupWallSheet } from '../components/SignupWallSheet';
import type { RootStackParamList } from '../navigation/types';

/**
 * The set of account-bound actions that trigger the soft signup wall when
 * a guest user attempts them. Each action maps to a value-proposition
 * message in `SignupWallSheet`.
 */
export type SignupAction =
  | 'save_item'
  | 'follow_seller'
  | 'message_seller'
  | 'place_bid'
  | 'purchase'
  | 'create_listing';

interface SignupWallContextValue {
  /**
   * Call before performing an account-bound action.
   *
   * - If the user is authenticated, returns `true` immediately — the
   *   caller proceeds with the action.
   * - If the user is a guest, shows the soft signup wall and returns
   *   `false`. The caller must abort the action.
   * - If the wall has already been shown for this action type in the
   *   current session, it is not shown again (no nagging). The action is
   *   still blocked (`false`).
   */
  requireAuth: (action: SignupAction) => boolean;
}

const SignupWallContext = createContext<SignupWallContextValue | null>(null);

/**
 * Provider that mounts the SignupWallSheet at a high level in the tree
 * (inside the navigation container so it can navigate to AuthLanding).
 * Any descendant can call `useSignupWall().requireAuth(action)` to gate
 * an account-bound action behind the soft signup wall.
 */
export function SignupWallProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [action, setAction] = useState<SignupAction | null>(null);
  // Track which actions have already shown the wall this session so we
  // never nag the user with the same prompt twice (AGENTS.md §4 restraint).
  const shownActionsRef = useRef<Set<SignupAction>>(new Set());

  const currentUser = useStore((state) => state.currentUser);
  const isAuthenticated = useStore((state) => state.isAuthenticated);
  const isGuest = !currentUser && !isAuthenticated;

  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const haptic = useHaptic();

  const requireAuth = useCallback(
    (requestedAction: SignupAction): boolean => {
      if (!isGuest) {
        return true;
      }

      // Don't show the wall more than once per session per action type.
      // The action is still blocked — the user dismissed it once already.
      if (shownActionsRef.current.has(requestedAction)) {
        return false;
      }

      shownActionsRef.current.add(requestedAction);
      setAction(requestedAction);
      setVisible(true);
      haptic.light();
      return false;
    },
    [isGuest, haptic],
  );

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setAction(null);
  }, []);

  const handleSignUp = useCallback(() => {
    haptic.medium();
    setVisible(false);
    setAction(null);
    navigation.navigate('AuthLanding');
  }, [haptic, navigation]);

  return (
    <SignupWallContext.Provider value={{ requireAuth }}>
      {children}
      <SignupWallSheet
        visible={visible}
        action={action}
        onDismiss={handleDismiss}
        onSignUp={handleSignUp}
      />
    </SignupWallContext.Provider>
  );
}

/**
 * Hook to gate account-bound actions behind the soft signup wall.
 *
 * Usage:
 *   const { requireAuth } = useSignupWall();
 *   const handleSave = () => {
 *     if (!requireAuth('save_item')) return;
 *     // ... proceed with saving
 *   };
 *
 * If called outside a `SignupWallProvider`, the hook returns a no-op
 * `requireAuth` that always allows the action — defensive so a wiring
 * mistake never blocks a logged-in user.
 */
export function useSignupWall(): SignupWallContextValue {
  const ctx = useContext(SignupWallContext);
  if (!ctx) {
    return { requireAuth: () => true };
  }
  return ctx;
}
