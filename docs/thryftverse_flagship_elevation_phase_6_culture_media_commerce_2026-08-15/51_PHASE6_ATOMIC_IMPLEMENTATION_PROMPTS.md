# Phase 6 Atomic Implementation Prompts

> Audit date: 2026-08-15  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `12cf718d2f4f3c4547044b4e5efcf06890ea4cba`

## P6-01 — DPR media delivery
Audit every `downscaleWidth`/thumbnail request. Replace logical-DP requests with physical-pixel target calculation and derivative bucket selection. Add tests for 1×/2×/3× devices.

## P6-02 — Media asset view model
Propagate mediaAssetId, dimensions, blurhash, focal point and derivatives through Listing/Creator payloads. Do not collapse to one URL.

## P6-03 — Fullscreen zoom quality
Implement progressive detail→zoom resolution. Keep grid downscaling. Measure memory.

## P6-04 — Gallery source fidelity
Remove unnecessary 0.92 destructive quality reduction after device testing. Preserve original source and let backend create delivery variants.

## P6-05 — Creator typography
Replace faux Inter-based creator font personalities with licensed real families/presets. Keep UI typography separate.

## P6-06 — Creator Session
Refactor CreateCamera→CreatorStudio navigation into one persistent CreatorSession with acquisition overlays.

## P6-07 — Poster ergonomics
Recompose controls around direct media. Frame overview contextual. Do not expose document/page terminology.

## P6-08 — Poster video timeline
Implement only with real clip model, trim/split/reorder/speed/volume pipeline. Otherwise keep unavailable.

## P6-09 — Look source drawer
For You/Saved/Closet/Marketplace/Camera Roll with direct insert and search.

## P6-10 — Look swap
Preserve transform and product semantic role.

## P6-11 — True cutout R&D
Prototype segmentation. Ship only after alpha-edge QA on bags/shoes/watches/people. Keep Manual Crop until then.

## P6-12 — Production media worker
Implement/operate image/video derivative processor against existing media job contract.

## P6-13 — Storefront V2
Build cultural seller profile with Shop/Looks/Drops/Collections/About.

## P6-14 — Store collections/drops
Inventory-linked editorial collections and scheduled drop model.

## P6-15 — Seller media library
Reuse listing assets in Creator safely.

## P6-16 — Luxury bag flow
Category attributes, shot list, authentication/evidence states.

## P6-17 — Watch/jewellery flow
Reference/service/full-set/evidence + specialist trust.

## P6-18 — Car flow
Vehicle schema + media checklist + enquiry/inspection transaction.

## P6-19 — Yacht flow
Broker/private seller schema + enquiry/viewing/survey/offer/closing states.

## P6-20 — Art flow
Provenance/condition/evidence.

## P6-21 — Home V6
Preserve identity floor; increase media sharpness and authored semantic interruptions.

## P6-22 — Profile grid fidelity
Near-edge 3-column cultural grid with physical-pixel thumbnails; store/shop remains distinct.

## P6-23 — Visual Search
Object/region query + refinement; no AI branding.

## P6-24 — Chat concierge
High-value roles/actions without polluting normal chat.

## P6-25 — High-value payment capability
Category/value/jurisdiction-based payment/inspection/deposit path. Never falsely label escrow.

## P6-26 — Native visual release
Create blocking visual-release workflow independent of feature CI skip behaviour.

## P6-27 — Long-tail microflow sweep
Re-run every Phase 5 microflow under new store/high-value/creator roles.
