# Co-Own Full Audit

## Score

Visual/UI: 7.0/10  
Media: 2.5/10  
Contract/state truth: 3.8/10  
Overall: 4.8/10

## Strengths

- Most distinctive family art direction.
- Settled-trade truth is separated from a reference price.
- Holdings/book failures are retained as partial-data states.
- Trading is blocked when mandatory rights data is incomplete.
- Issuer availability wording avoids an unsupported treasury inference.
- Dossier, risks and supply details use progressive disclosure.

## Critical findings

### Live contract cannot populate the screen

The backend asset response provides core asset fields, a snapshot and candles. The screen—using an untyped asset—reads many additional fields including rights, rights version, category, description, authentication, protection, storage, provenance, condition, custody and appraisal.

Because rights are absent, all canonical rights resolve to “TBC.” The safety logic then blocks trading for ordinary live non-issuer viewers. This is correct fail-closed behaviour exposing an incomplete backend contract, not a finished experience.

### Co-Own supports one image

The live Co-Own asset has a single `imageUrl`; the screen creates a one-item image array. There is no product video, evidence gallery, document media or canonical carousel.

### Public holdings privacy leak

A public asset-holdings route exposes user IDs, units, average entry price and realised P&L. It should be removed or restricted to authorized issuer/operator use with privacy-safe aggregation.

### Snapshot freshness is misleading

Snapshot version is hardcoded and `asOf` reflects response time, not necessarily market-change time. The client uses a generous staleness window and does not subscribe or poll. “Continuous · Open” can remain visible over a static book.

### Book watermarks can disagree

Grouped book data and sequence values are read separately rather than as one consistent snapshot. A single combined depth limit can also starve one side of the book.

## Required asset contract

Return a typed, versioned asset dossier:

- identity, category, description and media;
- offering/rights version and effective date;
- economic, voting, transfer, exit and fee rights;
- issuer/operator identity;
- custody/storage status;
- provenance and authentication evidence;
- appraisal with appraiser, methodology, currency and date;
- supply totals and authoritative availability;
- market status and trading schedule;
- risk and jurisdiction disclosures.

Return the viewer position separately and privately.

## Required market contract

- atomic book snapshot with sequence and per-side depth;
- last execution timestamp, snapshot generation timestamp and connection status;
- bid, ask, spread and last settled price with provenance;
- incremental realtime events;
- resume-from-sequence and forced resnapshot on gaps;
- explicit halted, closed, stale and degraded states.

## Target composition

1. Evidence-worthy multi-media stage.
2. Asset identity and categorical descriptor.
3. Market instrument: price label, change, bid/ask/spread and freshness.
4. Viewer position and primary Buy/Sell action.
5. Compact order book.
6. Ownership fundamentals.
7. Versioned rights, custody, appraisal and provenance.
8. Risks and documents.

## Acceptance examples

- A valid live asset with complete rights can be traded by an eligible viewer.
- Missing rights block only the affected action and explain the missing evidence.
- No public endpoint reveals another holder’s financial position.
- Book sequence gaps force a visible resync.
- Closed or stale markets never say “Continuous · Open.”
- Multi-media evidence opens at the active carousel item.

