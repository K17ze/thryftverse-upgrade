/**
 * accessibilityAudit — dev-only utility for scanning component trees
 * for common WCAG 2.2 accessibility issues.
 *
 * This module is designed to run exclusively in __DEV__ mode. It has zero
 * runtime cost in production — the main export is a no-op when __DEV__ is
 * false, and the tree-walking functions are never called.
 *
 * Usage:
 *   import { auditAccessibility } from '../utils/accessibilityAudit';
 *
 *   // Inside a screen component:
 *   useEffect(() => {
 *     auditAccessibility(viewRef.current, 'HomeScreen');
 *   }, []);
 *
 * Checks:
 *  - Pressable / TouchableOpacity without accessibilityLabel (icon-only controls)
 *  - Touch targets smaller than 24×24 CSS pixels without hitSlop
 *  - Interactive elements without accessibilityRole
 *  - Stateful controls (switch, checkbox) without accessibilityState
 */

import { Platform } from 'react-native';

/* ──────────────────────────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────────────────────────── */

interface AccessibilityIssue {
  level: 'error' | 'warning';
  message: string;
  componentType?: string;
}

interface AuditResult {
  screenName: string;
  issues: AccessibilityIssue[];
  issueCount: number;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Constants — WCAG 2.2 touch-target thresholds
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * WCAG 2.2 SC 2.5.8 Target Size (Minimum): 24×24 CSS pixels.
 * The AA recommendation is 44×44pt for comfortable touch targets.
 */
const MIN_TOUCH_TARGET_CSS = 24;
const RECOMMENDED_TOUCH_TARGET = 44;

/**
 * Interactive component type names that require accessibility labels.
 * These are React Native primitive and community component names.
 */
const INTERACTIVE_TYPES = new Set([
  'Pressable',
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
  'TouchableNativeFeedback',
  'Button',
  'Switch',
  'TextInput',
  'Checkbox',
]);

/**
 * Components that are inherently interactive but may render as icon-only.
 */
const ICON_ONLY_INDICATORS = new Set([
  'Ionicons',
  'MaterialIcons',
  'FontAwesome',
  'MaterialCommunityIcons',
  'Entypo',
  'EvilIcons',
  'Feather',
  'Fontisto',
  'Foundation',
  'Octicons',
  'SimpleLineIcons',
  'Zocial',
]);

/* ──────────────────────────────────────────────────────────────────────────
 * Dev-only audit logic
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Scan a React element tree for common accessibility issues.
 *
 * This function walks the React fiber tree (or props tree) to find:
 * 1. Interactive elements (Pressable, TouchableOpacity) without accessibilityLabel
 * 2. Interactive elements without accessibilityRole
 * 3. Small touch targets without hitSlop
 * 4. Switch/checkbox controls without accessibilityState
 *
 * Results are logged to the console in dev mode only.
 *
 * @param element - The root React element to audit (e.g. from a ref or render output)
 * @param screenName - Name of the screen being audited (for logging)
 * @returns The audit result with any issues found
 */
export function auditAccessibility(
  _element: unknown,
  _screenName: string
): AuditResult {
  // No-op in production — this entire function body is dev-only.
  if (!__DEV__) {
    return { screenName: _screenName, issues: [], issueCount: 0 };
  }

  const issues: AccessibilityIssue[] = [];

  // Walk the element tree if we received a valid React element
  if (_element && typeof _element === 'object') {
    try {
      walkElementTree(_element, issues, _screenName, new Set());
    } catch {
      // Auditing must never crash the app — silently absorb errors.
    }
  }

  // Log results
  if (issues.length > 0) {
    const errors = issues.filter((i) => i.level === 'error');
    const warnings = issues.filter((i) => i.level === 'warning');

    if (errors.length > 0) {
      console.group(`%c[Accessibility Audit] ${_screenName} — ${errors.length} error(s)`, 'color: #d32f2f; font-weight: bold');
      errors.forEach((issue) => {
        console.error(`  ✗ ${issue.message}`);
      });
      console.groupEnd();
    }

    if (warnings.length > 0) {
      console.group(`%c[Accessibility Audit] ${_screenName} — ${warnings.length} warning(s)`, 'color: #f9a825; font-weight: bold');
      warnings.forEach((issue) => {
        console.warn(`  ⚠ ${issue.message}`);
      });
      console.groupEnd();
    }
  }

  return {
    screenName: _screenName,
    issues,
    issueCount: issues.length,
  };
}

/**
 * Recursively walk a React element tree, checking each node for accessibility issues.
 * Uses a visited set to prevent infinite loops on circular references.
 */
function walkElementTree(
  element: any,
  issues: AccessibilityIssue[],
  screenName: string,
  visited: Set<any>,
  depth: number = 0
): void {
  // Prevent infinite recursion and limit depth
  if (depth > 50 || visited.has(element)) return;
  visited.add(element);

  // Check if this element is a React element with props
  if (!element || typeof element !== 'object' || !element.props) return;

  const elementType = getComponentName(element.type || element.$$typeof);
  const props = element.props;

  // Check interactive elements
  if (elementType && INTERACTIVE_TYPES.has(elementType)) {
    checkInteractiveElement(elementType, props, issues, screenName);
  }

  // Recurse into children
  const children = props.children;
  if (children) {
    if (Array.isArray(children)) {
      children.forEach((child) => {
        if (child && typeof child === 'object') {
          walkElementTree(child, issues, screenName, visited, depth + 1);
        }
      });
    } else if (typeof children === 'object') {
      walkElementTree(children, issues, screenName, visited, depth + 1);
    }
  }
}

/**
 * Check an interactive element for accessibility issues.
 */
function checkInteractiveElement(
  componentType: string,
  props: any,
  issues: AccessibilityIssue[],
  screenName: string
): void {
  const hasLabel = Boolean(props.accessibilityLabel);
  const hasRole = Boolean(props.accessibilityRole);
  const hasHint = Boolean(props.accessibilityHint);
  const hasHitSlop = Boolean(props.hitSlop);
  const isAccessible = props.accessible !== false;

  // Skip if the element is explicitly marked as not accessible
  if (!isAccessible) return;

  // Skip if disabled (disabled elements don't need labels as urgently)
  if (props.disabled) return;

  // Determine if this is likely an icon-only control
  const isIconOnly = isIconOnlyControl(props);

  // 1. Missing accessibilityLabel on interactive elements
  //    Error for icon-only controls, warning for text-bearing controls
  if (!hasLabel) {
    if (isIconOnly) {
      issues.push({
        level: 'error',
        message: `[${screenName}] ${componentType} appears to be an icon-only control without accessibilityLabel. Icon-only controls MUST have an accessible label (WCAG 2.2, AGENTS.md §13).`,
        componentType,
      });
    } else if (!hasRole && componentType !== 'TextInput' && componentType !== 'Button') {
      // Text-bearing controls without a label are less critical but still flagged
      issues.push({
        level: 'warning',
        message: `[${screenName}] ${componentType} is missing accessibilityLabel. Consider adding a descriptive label for screen readers.`,
        componentType,
      });
    }
  }

  // 2. Missing accessibilityRole
  if (!hasRole && componentType !== 'Button' && componentType !== 'Switch' && componentType !== 'TextInput') {
    // AnimatedPressable defaults to 'button', so this is a warning, not an error
    issues.push({
      level: 'warning',
      message: `[${screenName}] ${componentType} is missing accessibilityRole. Default roles may not convey the correct semantic intent.`,
      componentType,
    });
  }

  // 3. Missing accessibilityHint on controls where the action isn't obvious
  if (hasLabel && !hasHint && isIconOnly) {
    issues.push({
      level: 'warning',
      message: `[${screenName}] ${componentType} has an accessibilityLabel but no accessibilityHint. Icon-only controls benefit from a hint describing the action.`,
      componentType,
    });
  }

  // 4. Small touch target without hitSlop
  if (!hasHitSlop) {
    const { width, height } = extractDimensions(props.style);
    if (width !== undefined && height !== undefined) {
      const minDim = Math.min(width, height);
      if (minDim < MIN_TOUCH_TARGET_CSS) {
        issues.push({
          level: 'error',
          message: `[${screenName}] ${componentType} has a touch target of ${width}×${height}pt which is below the WCAG 2.2 SC 2.5.8 minimum of ${MIN_TOUCH_TARGET_CSS}×${MIN_TOUCH_TARGET_CSS} CSS pixels. Add hitSlop to expand the tappable area.`,
          componentType,
        });
      } else if (minDim < RECOMMENDED_TOUCH_TARGET) {
        issues.push({
          level: 'warning',
          message: `[${screenName}] ${componentType} has a touch target of ${width}×${height}pt. WCAG recommends ${RECOMMENDED_TOUCH_TARGET}×${RECOMMENDED_TOUCH_TARGET}pt. Consider adding hitSlop.`,
          componentType,
        });
      }
    }
  }

  // 5. Switch/checkbox without accessibilityState
  if (componentType === 'Switch' || props.accessibilityRole === 'switch') {
    if (!props.accessibilityState || props.accessibilityState.checked === undefined) {
      issues.push({
        level: 'error',
        message: `[${screenName}] ${componentType} with role "switch" is missing accessibilityState.checked. Screen readers need to announce the on/off state.`,
        componentType,
      });
    }
  }
}

/**
 * Determine if a control is likely icon-only (no text children, has icon children).
 */
function isIconOnlyControl(props: any): boolean {
  const children = props.children;

  // If children is a single icon component, it's icon-only
  if (children && typeof children === 'object' && !Array.isArray(children)) {
    const childName = getComponentName(children.type || children.$$typeof);
    if (childName && ICON_ONLY_INDICATORS.has(childName)) {
      return true;
    }
    // If the child is a View containing only an icon
    if (childName === 'View' && children.props?.children) {
      const innerChild = children.props.children;
      if (innerChild && typeof innerChild === 'object' && !Array.isArray(innerChild)) {
        const innerName = getComponentName(innerChild.type || innerChild.$$typeof);
        if (innerName && ICON_ONLY_INDICATORS.has(innerName)) {
          return true;
        }
      }
    }
  }

  // If children is an array, check if all children are icons (no Text)
  if (Array.isArray(children)) {
    const hasText = children.some(
      (child) => typeof child === 'string' || (typeof child === 'object' && getComponentName(child?.type) === 'Text')
    );
    const hasIcon = children.some(
      (child) => typeof child === 'object' && ICON_ONLY_INDICATORS.has(getComponentName(child?.type) ?? '')
    );
    if (hasIcon && !hasText) return true;
  }

  return false;
}

/**
 * Extract width and height from a style object or array of styles.
 */
function extractDimensions(style: any): { width?: number; height?: number } {
  if (!style) return {};
  let width: number | undefined;
  let height: number | undefined;

  const styles = Array.isArray(style) ? style : [style];
  for (const s of styles) {
    if (!s) continue;
    if (typeof s === 'object' && !Array.isArray(s)) {
      if (typeof s.width === 'number') width = s.width;
      if (typeof s.height === 'number') height = s.height;
    }
  }

  return { width, height };
}

/**
 * Get the component name from a React component type.
 */
function getComponentName(type: any): string | undefined {
  if (!type) return undefined;
  if (typeof type === 'string') return type;
  if (typeof type === 'function') return type.displayName || type.name || undefined;
  if (typeof type === 'object' && type.displayName) return type.displayName;
  // Handle React Native internal types
  if (typeof type === 'object' && type.name) return type.name;
  return undefined;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Color contrast audit helper (dev-only)
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Audit a set of color pairs for WCAG 2.2 contrast compliance.
 * Uses the contrast ratio calculation from accessibility.ts.
 *
 * @param pairs - Array of { name, foreground, background, isLargeText } objects
 * @param screenName - Name of the screen being audited
 * @returns Array of failing pairs with their contrast ratios
 */
export function auditColorContrast(
  pairs: Array<{ name: string; foreground: string; background: string; isLargeText?: boolean }>,
  _screenName: string
): Array<{ name: string; ratio: number; required: number; foreground: string; background: string }> {
  if (!__DEV__) return [];

  // Lazy-load to avoid circular imports in production
  const { getContrastRatio } = require('./accessibility') as typeof import('./accessibility');

  const failures: Array<{ name: string; ratio: number; required: number; foreground: string; background: string }> = [];

  for (const pair of pairs) {
    const ratio = getContrastRatio(pair.foreground, pair.background);
    const required = pair.isLargeText ? 3 : 4.5;
    if (ratio < required) {
      failures.push({
        name: pair.name,
        ratio: Math.round(ratio * 100) / 100,
        required,
        foreground: pair.foreground,
        background: pair.background,
      });
    }
  }

  if (failures.length > 0) {
    console.group(
      `%c[Contrast Audit] ${_screenName} — ${failures.length} failing pair(s)`,
      'color: #d32f2f; font-weight: bold'
    );
    failures.forEach((f) => {
      console.error(
        `  ✗ ${f.name}: ${f.foreground} on ${f.background} = ${f.ratio}:1 (required ${f.required}:1)`
      );
    });
    console.groupEnd();
  }

  return failures;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Screen reader status helper
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Log whether a screen reader is currently active.
 * Useful for development testing.
 */
export function logScreenReaderStatus(): void {
  if (!__DEV__) return;

  const { AccessibilityInfo } = require('react-native');
  AccessibilityInfo.isScreenReaderEnabled().then((enabled: boolean) => {
    console.log(
      `%c[Accessibility] Screen reader is ${enabled ? 'ENABLED' : 'disabled'}`,
      enabled ? 'color: #4caf50; font-weight: bold' : 'color: #9e9e9e'
    );
  });
}

/* ──────────────────────────────────────────────────────────────────────────
 * Platform info
 * ──────────────────────────────────────────────────────────────────────── */

export const AccessibilityPlatform = {
  isIOS: Platform.OS === 'ios',
  isAndroid: Platform.OS === 'android',
  /** VoiceOver is the iOS screen reader; TalkBack is Android's. */
  screenReaderName: Platform.OS === 'ios' ? 'VoiceOver' : 'TalkBack',
};
