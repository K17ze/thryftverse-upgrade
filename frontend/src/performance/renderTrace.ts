/**
 * useRenderTrace — lightweight dev-only re-render tracker.
 *
 * Why this exists instead of whyDidYouRender:
 *   The project uses `babel-plugin-react-compiler` (React Compiler), which is
 *   explicitly incompatible with whyDidYouRender (the library monkey-patches
 *   React, which the compiler also transforms). Instead, this hook provides a
 *   minimal, non-invasive render counter that logs when a component re-renders
 *   and how many times it has rendered in the current session.
 *
 * Usage (dev only — no-op in production):
 *   function MyComponent(props) {
 *     useRenderTrace('MyComponent', props);
 *     ...
 *   }
 *
 * The hook counts renders and logs every render in __DEV__. It does NOT
 * monkey-patch React, does NOT slow down production, and works alongside
 * React Compiler. For deep prop-diff analysis, use React DevTools Profiler.
 */
import { useRef } from 'react';

export function useRenderTrace<T extends Record<string, unknown>>(
  componentName: string,
  props?: T,
): void {
  // Hooks must be called unconditionally (Rules of Hooks).
  const renderCount = useRef(0);
  const prevProps = useRef<T | undefined>(undefined);

  if (!__DEV__) {
    return;
  }

  renderCount.current += 1;

  if (renderCount.current === 1) {
    console.info(`[render-trace] ${componentName}: first render`);
  } else {
    // Log the render count and changed props (if props were provided)
    const changed: string[] = [];
    if (props && prevProps.current) {
      for (const key of Object.keys(props)) {
        if (prevProps.current[key] !== props[key]) {
          changed.push(key);
        }
      }
    }
    const changedSummary = changed.length > 0 ? ` changed: [${changed.join(', ')}]` : '';
    console.info(`[render-trace] ${componentName}: render #${renderCount.current}${changedSummary}`);
  }

  prevProps.current = props;
}
