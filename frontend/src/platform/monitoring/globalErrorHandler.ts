/**
 * Global JS error handler setup.
 *
 * React Native already installs a default global handler via
 * `setUpErrorHandling.js` (ErrorUtils.setGlobalHandler -> ExceptionsManager),
 * which shows the dev redbox in development and reports to the native crash
 * layer in production. This module wraps that default handler to add:
 *
 *  - a structured console log for development visibility
 *  - a Sentry breadcrumb + captureException call for production observability
 *
 * The original handler is always forwarded to so dev redbox behaviour and
 * native crash reporting are preserved exactly.
 *
 * Promise rejection tracking is already enabled by React Native in __DEV__
 * (see Libraries/Promise.js). In production, unhandled rejections surface as
 * regular errors through the global handler installed here, so they are logged
 * and forwarded to Sentry via the same path.
 */

import { Sentry, isSentryAvailable } from './sentry';
import { trackTelemetryEvent } from '../../lib/telemetry';

let installed = false;

/**
 * Install the global error handler wrapper. Safe to call multiple times —
 * only the first call wraps the existing handler; subsequent calls are no-ops.
 */
export function installGlobalErrorHandler(): void {
  if (installed) return;

  // ErrorUtils is a React Native global. Guard against environments where it
  // is unavailable (e.g. tests / web) so this never crashes startup.
  type GlobalErrorHandler = (error: unknown, isFatal: boolean) => void;
  const ErrorUtilsGlobal = (global as unknown as {
    ErrorUtils?: {
      getGlobalHandler?: () => GlobalErrorHandler;
      setGlobalHandler?: (handler: GlobalErrorHandler) => void;
    };
  }).ErrorUtils;

  if (!ErrorUtilsGlobal?.getGlobalHandler || !ErrorUtilsGlobal?.setGlobalHandler) {
    return;
  }

  const defaultHandler = ErrorUtilsGlobal.getGlobalHandler();

  const wrappedHandler: GlobalErrorHandler = (error, isFatal) => {
    // Structured dev log so the error is visible in the console / Metro logs.
    console.error(
      '[GlobalError]',
      isFatal ? 'FATAL' : 'NON-FATAL',
      error,
    );

    // Telemetry + Sentry capture (best-effort, never crashes the app).
    try {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      trackTelemetryEvent('global_js_error', {
        error_name: errorObj.name,
        error_message: errorObj.message,
        is_fatal: isFatal,
      });

      if (isSentryAvailable()) {
        Sentry.addBreadcrumb?.({
          category: 'global_error',
          message: `${isFatal ? 'FATAL' : 'NON-FATAL'}: ${errorObj.message}`,
          level: 'error',
          data: { name: errorObj.name, isFatal },
        });
        Sentry.captureException?.(error);
      }
    } catch {
      // Observability must never crash the app.
    }

    // Forward to the original handler so dev redbox and native crash reporting
    // continue to work exactly as before.
    try {
      defaultHandler?.(error, isFatal);
    } catch {
      // If the default handler itself throws, re-throw the original error so
      // the runtime still surfaces it rather than silently swallowing it.
      throw error;
    }
  };

  ErrorUtilsGlobal.setGlobalHandler(wrappedHandler);
  installed = true;
}
