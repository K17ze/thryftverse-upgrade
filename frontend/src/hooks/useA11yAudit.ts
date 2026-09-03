/**
 * useA11yAudit — dev-only accessibility audit hook.
 *
 * Wraps `auditAccessibility` in a useEffect so screens can opt-in with a
 * single line. In production the hook is a complete no-op — the import
 * is tree-shaken because `auditAccessibility` returns early when
 * `__DEV__` is false.
 *
 * Usage:
 *   const viewRef = useRef<View>(null);
 *   useA11yAudit(viewRef, 'HomeScreen');
 *
 * The audit logs warnings to console.warn in __DEV__ only. It does not
 * throw or fail the render — it is a diagnostic tool for developers.
 *
 * Static enforcement of labels/roles/hit-targets is handled by
 * `eslint-plugin-react-native-a11y` (see eslint.config.mjs). This hook
 * provides a complementary runtime diagnostic: it walks the React
 * element tree from the given ref and reports missing labels, roles,
 * and hit-targets to the dev console.
 */

import { useEffect, RefObject } from 'react';
import { auditAccessibility } from '../utils/accessibilityAudit';

export function useA11yAudit(
  _ref: RefObject<any>,
  _screenName: string
): void {
  useEffect(() => {
    if (!__DEV__) return;
    if (!_ref.current) return;
    const result = auditAccessibility(_ref.current, _screenName);
    if (result.issues.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[a11y-audit] ${_screenName}: ${result.issues.length} issue(s) found`,
        result.issues
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
