# Agent Product Model — One Agent Platform

> Phase 3 audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `315a0760267354be46fec8a5f83ad8746badd392`

## Objective

The user should be able to bring an agent into Thryftverse, connect a runtime/provider they trust, grant narrow access to Thryftverse data and actions, and invoke the agent from relevant places such as Chat, Search, Closet or Sell.

It should feel like installing a trusted collaborator, not configuring an LLM playground.

## One vocabulary

Consumer-facing terms:

- **Agents** — reusable definitions.
- **Connections** — model/runtime/provider credentials or paired hosts.
- **Access** — app capabilities an agent may use.
- **Sessions** — running work.
- **Activity** — auditable actions and approvals.
- **Skills** — reusable behavior packs.
- **Tools** — typed Thryftverse/MCP actions.

Remove consumer-facing “Bot”, “Custom Bot”, “AI API Integration” and “Intelligence” terminology.

## Canonical domain

```ts
type AgentRuntimeKind =
  | 'native_on_device'
  | 'provider_api'
  | 'managed_agent'
  | 'remote_host';

interface AgentDefinition {
  id: string;
  ownerUserId: string;
  name: string;
  description?: string;
  runtimeConnectionId: string;
  instructions: string;
  capabilityGrants: CapabilityGrant[];
  invocationSurfaces: AgentSurface[];
  approvalPolicy: ApprovalPolicy;
  memoryPolicy: AgentMemoryPolicy;
  budgetPolicy: AgentBudgetPolicy;
  status: 'draft'|'ready'|'paused'|'needs_connection'|'error';
  version: number;
}

interface AgentSession {
  id: string;
  agentId: string;
  runtimeKind: AgentRuntimeKind;
  state: 'starting'|'idle'|'running'|'waiting_approval'|'paused'|'failed'|'completed';
  lastEventSequence: number;
}
```

## Agents Home

Do not begin with bot-category filters.

Hierarchy:
1. Continue — active/recent sessions.
2. Your agents.
3. Create / Connect.
4. Starter agents.
5. Recent Activity.

## Create Agent

Four progressive steps:
1. **Purpose** — what should it help with?
2. **Connection** — which runtime/provider?
3. **Access** — which data/actions?
4. **Where it appears** — Agents, Chat, Search, Sell, Closet.

Advanced:
- full system instructions;
- model override;
- MCP servers;
- budgets;
- custom approval rules.

## Built-in helpers

Convert whimsical built-in bot personalities into skills or starter templates.

Examples:
- shopping research;
- offer drafting;
- style matching;
- listing drafting.

Safety should be platform policy, not a decorative “Safety Shield” personality.

## Flagship psychology

Users think in **purpose, trust, place and permission**. Provider internals should only become visible when the user intentionally configures them.
