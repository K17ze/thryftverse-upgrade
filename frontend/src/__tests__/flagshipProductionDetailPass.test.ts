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

  it("uses real media metadata with an honest 4:5 fallback", () => {
    const geometry = readSource("utils/listingMediaGeometry.ts");
    const mapper = readSource("services/listingMapper.ts");
    expect(geometry).toContain("DEFAULT_LISTING_MEDIA_ASPECT_RATIO = 4 / 5");
    expect(geometry).toContain("listing.mediaAspectRatio");
    expect(geometry).not.toContain("charCodeAt");
    expect(mapper).toContain("mediaAspectRatio:");
    expect(mapper).toContain("mediaWidth:");
    expect(mapper).toContain("mediaHeight:");
  });

  it("does not fabricate masonry shapes from listing IDs", () => {
    const masonry = readSource("components/discover/PinterestMasonryGrid.tsx");
    const home = readSource("screens/HomeScreen.tsx");
    expect(masonry).toContain("resolveListingMediaAspectRatio(item)");
    expect(masonry).toContain("useWindowDimensions");
    expect(masonry).toContain("useReducedMotion");
    expect(masonry).not.toContain("charCodeAt");
    expect(home).toContain("resolveListingMediaHeightRatio(item)");
    expect(home).not.toContain("resolveTileAspectRatio");
  });

  it("keeps product cards legible, truthful and accessible", () => {
    const card = readSource("components/ProductCardV2.tsx");
    const heart = readSource("components/AnimatedHeart.tsx");
    expect(card).toContain("!item.isSold && !hasPriceDrop");
    expect(card).not.toContain("Thryftverse seller");
    expect(card).not.toContain("item.likes > 0 ? item.likes : '—'");
    expect(card).toContain('accessibilityHint="Opens item details"');
    expect(heart).toContain(
      "accessibilityLabel={isActive ? 'Remove from wishlist' : 'Add to wishlist'}",
    );
  });

  it("does not simulate a visual-search scan when the service is unavailable", () => {
    const visualSearch = readSource("screens/VisualSearchScreen.tsx");
    // Honest rolling-out note instead of a fake scan/analysis simulation.
    expect(visualSearch).toContain("AI image matching is coming soon");
    expect(visualSearch).not.toContain("setInterval");
    expect(visualSearch).not.toContain("Analysing image");
    // The endpoint is called via the listingsApi client, not directly via fetchJson in the screen.
    expect(visualSearch).not.toContain("fetchJson('/visual-search'");
    expect(visualSearch).toContain('onError={() => setPreviewFailed(true)}');
    expect(visualSearch.match(/setPreviewFailed\(false\)/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
