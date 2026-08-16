# Agent Library, Builder, Launch & Session UX

> Phase 3 audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `315a0760267354be46fec8a5f83ad8746badd392`

## Agents Home

Header: `Agents`.

First actions:
- New agent
- Connect

Then:
- Continue
- Your agents
- Starter agents
- Activity

Search/categories only after scale justifies them.

## Connect flow

1. **Where should it run?**
   - On this device
   - Provider API
   - Connected machine/server

2. **Choose connection**
   - Apple on-device where supported
   - Android on-device where supported
   - OpenAI
   - Anthropic
   - Custom compatible endpoint
   - Codex connected host
   - Hermes/self-hosted
   - Custom host

3. Authenticate/pair.

4. Verify capabilities and show runtime location.

## Create Agent flow

Do not start with an 8,000-character prompt.

1. What should this agent help you do?
2. Which Connection?
3. What can it access?
4. Where can you use it?

Advanced contains instructions/model/MCP/budgets/custom policies.

## Agent Session

A session is not a generic chat clone.

Top:
- Agent identity
- runtime location
- Stop

Body:
- user requests
- agent output
- tool/activity cards
- approval cards
- artifacts

Long work uses semantic stages, not invented percentages.

## Copy

Avoid:
“Unleash AI”
“Powerful intelligent agents”

Use:
“Create an agent for the work you repeat.”
“Connect a model or a machine to get started.”
