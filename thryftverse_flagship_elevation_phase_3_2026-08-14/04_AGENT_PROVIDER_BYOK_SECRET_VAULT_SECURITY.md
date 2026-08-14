# Agent BYOK, Connections & Secret Vault Security

> Phase 3 audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `315a0760267354be46fec8a5f83ad8746badd392`

## P0 — remove AsyncStorage secret fallback

Current behavior in `aiProviderApi.ts`:
- SecureStore when available;
- AsyncStorage otherwise.

Required:
- secure store available → persist;
- secure store unavailable → session-memory-only option;
- if user requests persistence but secure storage is unavailable → refuse persistence with truthful explanation.

There is no general-storage fallback for secrets.

## Secret Vault

Create:
- `AgentSecretVault.ts`
- `SessionSecretStore.ts`

Rules:
- no raw secret in persisted Zustand state;
- no raw secret in navigation params;
- no raw secret in logs/crash payloads/analytics;
- clear key input after save;
- mask display with a fingerprint;
- Replace/Disconnect actions require user intent.

## Connection UX

A Connection is not “connected” until a real adapter probe succeeds.

Statuses:
- Not connected
- Checking
- Connected
- Authentication failed
- Rate limited
- Provider unavailable
- Endpoint unreachable
- Unsupported response
- Re-authentication required

Store `lastVerifiedAt`.

## Dynamic model discovery

Delete hardcoded consumer model catalogues. Providers change faster than app releases.

Adapter returns provider-authoritative IDs and capabilities:

```ts
interface DiscoveredModel {
  providerModelId: string;
  displayName: string;
  capabilities: {
    text: boolean;
    vision: boolean;
    toolCalling: boolean;
    structuredOutput: boolean;
    reasoning?: boolean;
  };
  deprecated?: boolean;
}
```

Cache responsibly.

## Custom endpoints

Production:
- HTTPS by default;
- HTTP only for explicit localhost/developer mode;
- validate redirect host;
- never forward credential across unexpected redirect;
- cap response size;
- redact URL queries from logs;
- clear “Local network” vs “Internet endpoint” labeling.

## Background sessions

Do not silently upload the user’s long-lived provider API key to Thryftverse backend just so a remote task can continue.

Prefer provider-owned managed sessions, scoped tokens/OAuth where available, or user-hosted remote execution.
