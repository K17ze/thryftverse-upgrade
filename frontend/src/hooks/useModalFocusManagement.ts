import { useEffect, useRef } from 'react';
import { findNodeHandle, AccessibilityInfo } from 'react-native';

/**
 * Focus management for modal/sheet components (WCAG 2.2 §2.4.3).
 *
 * On open:
 *   - Moves screen reader focus to the modal content so the user
 *     immediately hears the sheet's purpose instead of the obscured
 *     content behind it.
 *
 * On close:
 *   - Restores screen reader focus to the trigger element (if a ref is
 *     provided) so the user returns to where they were before opening
 *     the modal — not to an arbitrary element at the top of the screen.
 *
 * Usage:
 *   const triggerRef = useRef<View>(null);
 *   const contentRef = useRef<View>(null);
 *   useModalFocusManagement({ visible, contentRef, triggerRef });
 *
 * Note: `accessibilityViewIsModal` on the container view (already set on
 * BottomSheet) traps VoiceOver focus on iOS. This hook complements that by
 * managing *where* focus lands when the modal appears and disappears.
 */
interface UseModalFocusManagementOptions {
  /** Whether the modal/sheet is currently visible. */
  visible: boolean;
  /** Ref to the modal content view — receives focus on open. */
  contentRef: React.RefObject<any>;
  /** Optional ref to the element that triggered the modal — receives focus on close. */
  triggerRef?: React.RefObject<any>;
}

export function useModalFocusManagement({
  visible,
  contentRef,
  triggerRef,
}: UseModalFocusManagementOptions): void {
  // Track the previous visibility so we only act on transitions.
  const wasVisibleRef = useRef(false);

  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    wasVisibleRef.current = visible;

    if (visible && !wasVisible) {
      // Modal just opened — move screen reader focus to the content.
      // Small delay so the view has mounted and the native node handle is
      // available before we request focus.
      const timeoutId = setTimeout(() => {
        const node = findNodeHandle(contentRef.current);
        if (node) {
          AccessibilityInfo.setAccessibilityFocus(node);
        }
      }, 100);

      return () => clearTimeout(timeoutId);
    }

    if (!visible && wasVisible) {
      // Modal just closed — restore focus to the trigger if available.
      if (triggerRef?.current) {
        const node = findNodeHandle(triggerRef.current);
        if (node) {
          AccessibilityInfo.setAccessibilityFocus(node);
        }
      }
    }
  }, [visible, contentRef, triggerRef]);
}
