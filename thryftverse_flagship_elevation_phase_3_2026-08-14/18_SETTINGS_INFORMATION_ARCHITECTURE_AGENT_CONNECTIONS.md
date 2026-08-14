# Settings IA — Agents & Connections

> Phase 3 audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `315a0760267354be46fec8a5f83ad8746badd392`

## Context

Previous work correctly hid experimental provider/agent routes under Advanced & developer.

Once Agents become a real product, that IA is no longer correct.

## Main product

`Agents` becomes a normal product destination reachable from:
- profile/account menu;
- Chat add menu;
- optionally a utility/create surface if usage justifies it.

## Settings

Add a normal section:
**Agents & connections**
- Agent permissions
- Connections
- Agent activity
- Memory & data use
- Default approval behavior

Do not put Create Agent in Settings.

## Developer mode

Keep only:
- raw MCP inspector
- local HTTP/custom endpoint debugging
- developer event logs
- experimental adapters/flags.

## Rename

- AI API Integration → Connections
- BotDirectory → Agents
- CustomBots → Your agents
- BotBuilder → Create agent

`AI Preferences` should be renamed by the user goal it controls.

## Search

Searching Claude/OpenAI/Codex/Hermes can route to Connections, but provider brands do not need to clutter the top-level Settings list.

## Privacy controls

Expose:
- what each agent can read;
- persistent memory;
- provider/runtime destination;
- activity deletion;
- disconnect connection;
- Pause all agents.
