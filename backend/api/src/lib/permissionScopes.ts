import type { FastifyReply, FastifyRequest } from 'fastify';

export const SCOPES = {
  LISTINGS_READ: 'listings:read',
  LISTINGS_WRITE: 'listings:write',
  ORDERS_READ: 'orders:read',
  ORDERS_WRITE: 'orders:write',
  AUCTIONS_READ: 'auctions:read',
  AUCTIONS_WRITE: 'auctions:write',
  MESSAGES_READ: 'messages:read',
  MESSAGES_WRITE: 'messages:write',
  WALLET_READ: 'wallet:read',
  WALLET_WRITE: 'wallet:write',
  SEARCH_READ: 'search:read',
  COMPLIANCE_READ: 'compliance:read',
  COMPLIANCE_WRITE: 'compliance:write',
  ADMIN_ALL: 'admin:*',
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

const READ_SCOPES: string[] = [
  SCOPES.LISTINGS_READ,
  SCOPES.ORDERS_READ,
  SCOPES.AUCTIONS_READ,
  SCOPES.MESSAGES_READ,
  SCOPES.WALLET_READ,
  SCOPES.SEARCH_READ,
  SCOPES.COMPLIANCE_READ,
];

const OWN_DATA_WRITE_SCOPES: string[] = [
  SCOPES.LISTINGS_WRITE,
  SCOPES.ORDERS_WRITE,
  SCOPES.AUCTIONS_WRITE,
  SCOPES.MESSAGES_WRITE,
  SCOPES.WALLET_WRITE,
];

const ALL_SCOPES: string[] = [
  ...READ_SCOPES,
  ...OWN_DATA_WRITE_SCOPES,
  SCOPES.COMPLIANCE_WRITE,
  SCOPES.ADMIN_ALL,
];

function scopeMatches(userScope: string, requiredScope: string): boolean {
  if (userScope === requiredScope) {
    return true;
  }

  if (userScope.endsWith(':*')) {
    const prefix = userScope.slice(0, -1);
    return requiredScope.startsWith(prefix);
  }

  if (userScope === SCOPES.ADMIN_ALL) {
    return true;
  }

  return false;
}

/**
 * Checks if the user has the required scope. Supports wildcards such as
 * `admin:*` which matches any scope within the admin namespace, and the
 * special `admin:*` scope which matches all scopes.
 */
export function hasScope(userScopes: string[], requiredScope: string): boolean {
  return userScopes.some((s) => scopeMatches(s, requiredScope));
}

/**
 * Checks if the user has any of the required scopes.
 */
export function hasAnyScope(userScopes: string[], requiredScopes: string[]): boolean {
  return requiredScopes.some((required) => hasScope(userScopes, required));
}

interface ScopeAwareRequest {
  authUser?: { userId: string; role: string };
  apiKey?: { keyId: string; scopes: string[] };
}

/**
 * Returns a Fastify preHandler that checks whether the authenticated
 * principal (JWT user or API key) has all of the required scopes. Sends
 * a 403 response if the scope check fails.
 */
export function requireScopes(scopes: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const scopedRequest = request as ScopeAwareRequest;
    const userScopes = resolveScopes(scopedRequest);

    const hasAll = scopes.every((required) => hasScope(userScopes, required));
    if (!hasAll) {
      reply.code(403);
      reply.send({ ok: false, error: 'Insufficient scope', requiredScopes: scopes });
    }
  };
}

function resolveScopes(request: ScopeAwareRequest): string[] {
  if (request.apiKey) {
    return request.apiKey.scopes;
  }

  if (request.authUser) {
    return mapRoleToScopes(request.authUser.role);
  }

  return [];
}

/**
 * Maps an existing role to a set of permission scopes. Users receive all
 * read scopes plus own-data write scopes. Admins receive all scopes.
 * Partners receive only the scopes assigned to their API key (handled
 * at the API key level, not here).
 */
export function mapRoleToScopes(role: string): string[] {
  if (role === 'admin') {
    return [...ALL_SCOPES];
  }

  if (role === 'user' || role === 'seller' || role === 'moderator') {
    const scopes = [...READ_SCOPES, ...OWN_DATA_WRITE_SCOPES];
    if (role === 'moderator') {
      scopes.push(SCOPES.COMPLIANCE_WRITE);
    }
    return scopes;
  }

  return [];
}
