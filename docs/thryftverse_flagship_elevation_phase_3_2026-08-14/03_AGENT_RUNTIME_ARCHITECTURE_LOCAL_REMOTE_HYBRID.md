# Agent Runtime Architecture — Local, Remote & Hybrid

> Phase 3 audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `315a0760267354be46fec8a5f83ad8746badd392`

## Truth constraint

“Runs on my phone” must have a precise meaning.

A mobile app can:
- run a native on-device model/agent loop;
- call a cloud provider directly;
- control a managed or remote agent.

It cannot honestly claim that every arbitrary desktop/CLI harness is executing locally inside an iOS sandbox.

Every Connection must show Runtime location:
- On this device
- Provider cloud
- Managed sandbox
- Connected machine
- Self-hosted server

## Normalized runtime interface

Create `frontend/src/platform/agents/runtime/AgentRuntimeAdapter.ts`.

```ts
interface AgentRuntimeAdapter {
  descriptor(): RuntimeDescriptor;
  validateConnection(input: RuntimeConnectionInput): Promise<ConnectionProbe>;
  discoverCapabilities(): Promise<RuntimeCapabilities>;
  startSession(input: StartAgentSessionInput): Promise<AgentSessionHandle>;
  sendUserEvent(id: string, event: AgentUserEvent): Promise<void>;
  streamEvents(id: string, cursor?: string): AsyncIterable<AgentRuntimeEvent>;
  approveToolCall(id: string, approval: ToolApproval): Promise<void>;
  interrupt(id: string): Promise<void>;
  resume(id: string): Promise<void>;
  close(id: string): Promise<void>;
}
```

Normalize events to:
- message.delta / completed
- reasoning.status
- tool.requested / running / completed
- approval.requested / resolved
- artifact.created
- session.paused / failed / completed

## Runtime mode 1 — native on-device

### iOS 27+
Build a Swift native module around Foundation Models / `LanguageModelSession`. Use feature detection. Expose local availability truthfully.

### Android
Build a Kotlin module around ADK for Android. Support on-device Gemini Nano where the device/runtime actually supports it.

Do not simulate native availability from JavaScript.

## Runtime mode 2 — direct provider

Examples:
- OpenAI API
- Anthropic Messages API
- OpenAI-compatible custom endpoint

Thryftverse owns the agent loop and Capability Broker.

## Runtime mode 3 — managed agent

Examples:
- Claude Managed Agents;
- future provider-hosted agent APIs.

Provider owns long-running environment/session. Thryftverse still owns user consent, app tool exposure, approval UI and local activity history.

## Runtime mode 4 — remote harness

Examples:
- Codex on laptop/devbox;
- Hermes on server/desktop/Termux environment;
- user-hosted harness.

The phone is the control surface and permission boundary. Execution stays on the paired host.

## Codex

Official 2026 Codex mobile architecture keeps files, credentials and permissions on the trusted machine and lets mobile steer/approve via secure relay. Therefore implement a **Codex Remote Host adapter**, not a fake “Codex local on iPhone” switch.

## Hermes

Treat Hermes as a harness, not a model. Support a remote/self-hosted connector first. Android/companion local execution is valid only where packaging and platform policy genuinely support it.

## Background execution

A phone app is not a permanent daemon.

Local sessions are foreground/system-bounded work. Tasks that must outlive app suspension should run in a managed/remote runtime and wake the user with push when approval or a result is ready.
