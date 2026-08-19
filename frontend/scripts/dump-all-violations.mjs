#!/usr/bin/env node
/**
 * Dumps ALL visual release gate violations to a JSON file for batch processing.
 * Unlike check-visual-release-gates.mjs which truncates output, this writes
 * every violation grouped by file to a structured JSON.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, resolve, extname, relative } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');

const SCAN_EXTENSIONS = new Set(['.tsx', '.ts']);
const EXCLUDE_DIRS = new Set(['__tests__', 'node_modules', '__mocks__', 'theme', 'constants']);

const ALLOWED_COLOR_FILES = new Set([
  join(SRC, 'theme', 'designTokens.ts'),
  join(SRC, 'theme', 'ThemeContext.tsx'),
  join(SRC, 'theme', 'gradients.ts'),
  join(SRC, 'constants', 'colors.ts'),
]);

const CAMERA_SURFACE_PATTERNS = [
  // Creator/camera surfaces
  /creator[\\/]/, /CreatorCamera/, /CreatorCanvas/, /CreatorToolDock/,
  /CreatorStudio/, /CreateCamera/,
  /LiveStreamViewer/, /LiveStreamSeller/, /LiveShoppingHome/, /FullscreenMediaViewer/,
  // Poster viewer/highlight surfaces
  /PosterViewer/, /PosterHighlight/,
  // Poster creative tools — colors ARE the content
  /poster[\\/]/,
  /PosterSticker/, /PosterReaction/, /GradientPresets/, /FilterStrip/, /FilterPreview/,
  /filterConfig/, /FontColorPicker/, /ColorSlider/, /ColorPickerPanel/, /DrawingCanvas/,
  /StickerPicker/, /TemplatePicker/, /LayoutPicker/, /BackgroundPicker/,
  /TextOverlayCanvas/, /TextEditSheet/, /DraggableText/, /DraggableLayer/,
  /MultiPhotoCollage/, /BottomControlBar/, /CreativeToolbar/, /PosterProgressSegments/,
  /DetailsDrawer/, /ContextMenu/, /PosterArchive/, /PosterStoryActivity/,
  /layerAccents/, /colorUtils/,
  // Media stage / overlay surfaces
  /MediaStage/, /MediaStudio/, /MediaGallery/, /MediaComposer/, /MediaPreview/,
  /MediaMosaic/, /MediaEditor/, /MediaRail/, /ListingMedia/, /ProductMedia/,
  /LookMedia/, /ChatMediaPreview/, /VisualSearchCamera/, /VisualSearchScreen/,
  /HeroCarousel/, /ImageEmptyGraphic/, /BoardEmptyGraphic/, /OrdersEmptyGraphic/,
  /SearchEmptyGraphic/, /LookPreviewCard/, /EditProfilePreview/,
  /FlagshipProfileMedia/, /ProfileVisualHeader/, /ProfileMediaEditor/,
  // Data files with domain color values
  /data[\\/]posters/, /data[\\/]stickerPresets/, /services[\\/]moodboardApi/,
  /orderCapabilities/,
];

const HEX_COLOR = /#[0-9A-Fa-f]{6}\b/g;
const HEX_COLOR_SHORT = /#[0-9A-Fa-f]{3}\b/g;
const RGB_COLOR = /rgba?\(\s*\d+/g;

function walk(dir) {
  const results = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return results; }
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) results.push(...walk(full));
    else if (SCAN_EXTENSIONS.has(extname(full))) results.push(full);
  }
  return results;
}

function isCameraSurface(filePath) {
  return CAMERA_SURFACE_PATTERNS.some((p) => p.test(filePath));
}

function relPath(filePath) {
  return relative(ROOT, filePath).replace(/\\/g, '/');
}

function checkHardcodedColors(files) {
  const byFile = {};
  for (const file of files) {
    if (ALLOWED_COLOR_FILES.has(file)) continue;
    if (isCameraSurface(file)) continue;
    const src = readFileSync(file, 'utf-8');
    const lines = src.split('\n');
    const violations = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
      const hasHex = HEX_COLOR.test(line) || HEX_COLOR_SHORT.test(line);
      const hasRgb = RGB_COLOR.test(line);
      HEX_COLOR.lastIndex = 0;
      HEX_COLOR_SHORT.lastIndex = 0;
      RGB_COLOR.lastIndex = 0;
      if (hasHex || hasRgb) {
        if (line.includes('gradient') && line.includes('[')) continue;
        violations.push({ line: i + 1, content: trimmed.substring(0, 200) });
      }
    }
    if (violations.length > 0) {
      byFile[relPath(file)] = violations;
    }
  }
  return byFile;
}

const files = walk(SRC);
const colorViolations = checkHardcodedColors(files);
const totalViolations = Object.values(colorViolations).reduce((sum, v) => sum + v.length, 0);

writeFileSync(
  join(ROOT, 'all-color-violations.json'),
  JSON.stringify({ totalViolations, fileCount: Object.keys(colorViolations).length, byFile: colorViolations }, null, 2)
);

console.log(`Total P0 color violations: ${totalViolations}`);
console.log(`Files with violations: ${Object.keys(colorViolations).length}`);
console.log('Written to: all-color-violations.json');

// Print file summary sorted by violation count
const sorted = Object.entries(colorViolations).sort((a, b) => b[1].length - a[1].length);
for (const [file, violations] of sorted) {
  console.log(`  ${file}: ${violations.length} violations`);
}
