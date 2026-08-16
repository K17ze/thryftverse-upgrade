# Source integrity, audit boundary and Phase 3.1 freeze

## Remote-state finding

At audit time, GitHub's remote ref for:

`feat/product-detail-contract-media-device-closure`

still resolved to:

`5ac0573530a641f5a05a196ae009c931b0ce668f`

The two Phase 3.1 commits reported by the implementation session:

- `f5bfbd8c`
- `f69668c8`

were not yet retrievable through the GitHub repository API or public commit lookup at the time this folder was generated.

This means there are **two evidence classes** in this audit.

### Class A — independently inspected remote source
Current remote source at `5ac05735` was inspected in detail for visual/product architecture.

### Class B — frozen Phase 3.1 user-reported closures
The following are accepted as **do-not-regress constraints** for Phase 4 and must not be reopened merely because the remote connector lagged:

1. Agent execution through Capability Broker.
2. Agent drafts ephemeral until canonical confirmation.
3. Real `AgentDefinition`.
4. Provider endpoint hardening / safe capability defaults.
5. Poster truthfully labels trim/mute as unavailable rather than faking the tool; legacy CreatorStudioInner removed.
6. Look `Cutout` renamed truthfully to `Manual Crop`.
7. Dedicated Wallet Convert flow.
8. `check:residue` wired into CI and feature-branch trigger.

## Rule for the implementation agent

Before changing any file:

1. Fetch remote branch again.
2. Confirm Phase 3.1 SHAs are visible.
3. If they are visible, rebase this plan onto those files.
4. If a recommendation conflicts with a Phase 3.1 closure, **keep the closure and adapt the visual recommendation**.
5. Never reintroduce:
   - fake video trim;
   - fake background removal;
   - agent auto-send;
   - unsafe provider endpoints;
   - inline Wallet Convert;
   - legacy shared Poster/Look editor;
   - runtime bypass of capability approvals.

## What “Phase 4” means in this folder

Phase 4 is **not** another feature-addition wave.

It is a product-art-direction wave:

- reduce visible machinery;
- make media and human intent dominant;
- reorganize features around moments of need;
- use platform-native navigation/search/material semantics;
- make commerce truth visually calm;
- make expert information progressively available;
- replace repeated cards/pills with hierarchy and whitespace;
- build visual rhythm;
- improve gesture/motion continuity;
- establish native screenshot proof.

The work can still include code architecture when code architecture is causing visible complexity, but every change must have a user-facing reason.
