import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "..");
const ROOT = path.resolve(__dirname, "../../..");

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(SRC, relativePath), "utf8");
}

describe("neutral flagship production detail pass", () => {
  it("keeps the neutral palette canonical in the design contract", () => {
    const design = fs.readFileSync(path.join(ROOT, "Design.md"), "utf8");
    expect(design).toContain("Neutral Flagship Native Design System");
    expect(design).toContain("do not introduce decorative champagne or gold");
  });

  it("uses real media metadata with an honest portrait 3:4 fallback (2026 Poshmark standard)", () => {
    const geometry = readSource("utils/listingMediaGeometry.ts");
    const mapper = readSource("services/listingMapper.ts");
    // 2026 standard: portrait 3:4 imagery (Poshmark March 2026 redesign).
    // The fallback uses AspectRatio.portrait; real media geometry is still honoured.
    expect(geometry).toContain("AspectRatio.portrait");
    expect(geometry).toContain("listing.mediaAspectRatio");
    expect(geometry).not.toContain("charCodeAt");
    expect(mapper).toContain("mediaAspectRatio:");
    expect(mapper).toContain("mediaWidth:");
    expect(mapper).toContain("mediaHeight:");
  });

  it("does not fabricate masonry shapes from listing IDs", () => {
    const masonry = readSource("components/discover/PinterestMasonryGrid.tsx");
    const home = readSource("screens/HomeScreen.tsx");
    const vm = readSource("presentation/homeDiscoveryViewModel.ts");
    expect(masonry).toContain("resolveListingMediaAspectRatio(item)");
    expect(masonry).toContain("useWindowDimensions");
    expect(masonry).toContain("useReducedMotion");
    expect(masonry).not.toContain("charCodeAt");
    // Phase 5: aspect ratio resolution moved to the presentation view model
    expect(vm).toContain("resolveListingMediaHeightRatio(listing)");
    expect(home).not.toContain("resolveTileAspectRatio");
  });

  it("keeps product cards legible, truthful and accessible", () => {
    const card = readSource("components/ProductCard.tsx");
    const heart = readSource("components/AnimatedHeart.tsx");
    // Sustainability chip must never appear when sold or when a price drop
    // is shown. The consolidated badge cascade enforces this through priority
    // ordering: price drop > sold > condition > sustainability.
    expect(card).toContain("price drop > sold > condition > sustainability");
    expect(card).toContain("showSustainabilityChip");
    expect(card).not.toContain("Thryftverse seller");
    expect(card).not.toContain("item.likes > 0 ? item.likes : '—'");
    expect(card).toContain('accessibilityHint="Opens item details"');
    expect(heart).toContain(
      "accessibilityLabel={isActive ? 'Remove from wishlist' : 'Add to wishlist'}",
    );
  });

  it("labels filter-based visual-search results without simulating image matching", () => {
    const visualSearch = readSource("screens/VisualSearchScreen.tsx");
    expect(visualSearch).toContain("Showing matches from your category, brand, and description filters.");
    expect(visualSearch).not.toContain("coming soon");
    expect(visualSearch).not.toContain("setInterval");
    expect(visualSearch).not.toContain("Analysing image");
    // The endpoint is called via the listingsApi client, not directly via fetchJson in the screen.
    expect(visualSearch).not.toContain("fetchJson('/visual-search'");
    expect(visualSearch).toContain('onError={() => setPreviewFailed(true)}');
    expect(visualSearch.match(/setPreviewFailed\(false\)/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
