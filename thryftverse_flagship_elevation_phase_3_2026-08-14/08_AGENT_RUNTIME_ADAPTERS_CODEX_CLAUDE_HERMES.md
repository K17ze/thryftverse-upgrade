# Runtime Adapters — Codex, Claude, Hermes & MCP

> Phase 3 audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `315a0760267354be46fec8a5f83ad8746badd392`

## One adapter contract

Provider/harness SDK event shapes must not leak into Agent Home, Chat, permissions or Activity.

## Codex

Use a remote-host model aligned with official mobile behavior:
- pair trusted host;
- list/resume sessions;
- stream progress;
- surface approvals;
- host online/offline;
- artifacts/diffs where relevant.

Never label remote Codex as “On device”.

## Claude

Support two modes where useful:

### Messages/tool runner
Thryftverse owns the loop and tool execution.

### Managed Agents
Provider owns agent/session sandbox lifecycle; Thryftverse still controls custom app-tool permission and approval.

Anthropic’s explicit permission policy model reinforces the need for Thryftverse’s own capability broker.

## Hermes

Expose:
- Hermes profile;
- runtime host;
- selected model/provider;
- memory mode;
- skills;
- host state.

Connect to a real Hermes runtime/gateway. Do not clone its terminal dashboard into Thryftverse.

## MCP 2026-07-28

New remote tool integrations should target the current stateless MCP core:
- explicit protocol version;
- discovery when needed;
- header-routable calls;
- cache hints for list results;
- hardened authorization;
- Tasks extension where long-running work fits.

Do not build new architecture around deprecated legacy session assumptions.

## Custom host

Provide a stable connector envelope so future runtimes do not require new screen families:

```ts
interface RemoteAgentHostDescriptor {
  protocol: 'thryft-agent-v1'|'mcp-2026-07-28'|'custom';
  endpoint: string;
  authRef: string;
  displayName: string;
}
```
