import { Agent, setGlobalDispatcher } from 'undici';
import https from 'node:https';

/**
 * Shared undici agent with HTTP keep-alive for all outbound HTTP calls.
 *
 * Reuses TCP connections across requests, reducing latency by 30-100ms per
 * call by avoiding repeated TLS handshakes.  Installed as the global undici
 * dispatcher so that every `fetch()` call — as well as the Stripe SDK and
 * AWS SDK when they use native fetch — benefits from connection reuse.
 *
 * Per 2026 Node.js production best practices:
 * - keepAliveTimeout: 1000ms (matches Node default)
 * - keepAliveMaxTimeout: 30_000ms
 * - connections: 128 (max concurrent connections per origin)
 */
export const sharedHttpAgent = new Agent({
  keepAliveTimeout: 1_000,
  keepAliveMaxTimeout: 30_000,
  connections: 128,
});

// Install the shared agent as the global dispatcher so that all undici-powered
// fetch() calls reuse TCP connections.  This is a process-wide, one-time
// configuration performed at module load time.
setGlobalDispatcher(sharedHttpAgent);

/**
 * Shared `https.Agent` with keep-alive for SDKs that use Node's classic
 * `http`/`https` module (e.g. the Stripe Node SDK's `NodeHttpClient`).
 *
 * In Node 19+ `https.globalAgent.keepAlive` defaults to `true`, but passing
 * an explicit agent makes the configuration intentional and tunable.
 */
export const sharedHttpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1_000,
  maxSockets: 128,
});

/**
 * Fetch wrapper that uses the shared keep-alive agent.
 *
 * Use this instead of global `fetch()` for outbound HTTP calls where you
 * need to pass an explicit dispatcher (e.g. when the global dispatcher has
 * been overridden by test harnesses).
 */
export async function fetchWithKeepAlive(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(url, {
    ...init,
    // @ts-expect-error - dispatcher is a Node.js/undici extension
    dispatcher: sharedHttpAgent,
  });
}
