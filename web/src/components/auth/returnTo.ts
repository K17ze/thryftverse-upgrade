/**
 * Post-auth return destination — the auth stack accepts `?next=<path>`
 * so gated surfaces (group invites, deep links shared to signed-out
 * sessions) can resume after sign-in. Same internal-path contract as the
 * onboarding stash: absolute path only, never protocol-relative, so the
 * param can't be turned into an open redirect.
 */
export function sanitizeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

/** Appends `?next=` to an auth href, preserving any existing query. */
export function withReturnTo(href: string, next: string | null): string {
  if (!next) return href;
  const sep = href.includes('?') ? '&' : '?';
  return `${href}${sep}next=${encodeURIComponent(next)}`;
}
