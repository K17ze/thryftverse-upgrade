# ADR — Native Agent Bridge & Background Execution

> Phase 3 audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `315a0760267354be46fec8a5f83ad8746badd392`

## Decision

Thryftverse is an **Agent Host UI + Capability Broker**. Execution varies by runtime.

- Native local → platform bridge.
- Direct cloud → provider adapter.
- Managed cloud → managed adapter.
- External harness → paired remote host.

This avoids promising a permanent local daemon.

## iOS bridge

Swift module exposes:
- availability;
- model/runtime descriptor;
- start/cancel session;
- stream events;
- tool request;
- generation failure;
- memory/thermal/resource state where useful.

Do not put every streamed token into global React state.

## Android bridge

Kotlin ADK adapter exposes:
- runtime availability;
- local model availability;
- session Flow events;
- cancellation;
- tool calls.

## Background

Local:
- foreground by default;
- bounded OS-permitted continuation only;
- no indefinite invisible worker.

Remote:
- provider/host continues;
- app stores session cursor;
- push for approval/result;
- resume stream on open.

## Failure states

Design:
- host offline
- provider offline
- mobile offline
- key revoked
- rate limit
- model removed
- approval expired
- app killed
- remote completion while mobile offline.

Every state has a specific recovery action.
