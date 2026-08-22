#!/usr/bin/env bash
#
# @file analyze-bundle.sh
# @summary Export the ThryftVerse bundles for iOS and Android, open the Expo
#          Atlas visualiser, print a per-platform bundle-size summary, and
#          fail CI when the bundle exceeds the recorded baseline by more than 5%.
#
# @description
#   This script is the CI gate for bundle-size regressions on the ThryftVerse
#   React Native app. It performs four jobs:
#
#     1. Exports both platform bundles with `npx expo export --platform all`,
#        which (with EXPO_UNSTABLE_ATLAS=true) emits `.expo/atlas.jsonl` — the
#        module graph that powers `expo-atlas`.
#     2. Launches `npx expo-atlas .expo/atlas.jsonl` so a developer can inspect
#        the bundle composition interactively. In CI this step is skipped when
#        the `CI` env var is set, because there is no browser to open.
#     3. Walks the export output directory, locates the largest JS bundle per
#        platform, and prints a summary table to stdout.
#     4. Compares each platform's measured size against `scripts/bundle-baseline.json`.
#        If a platform's bundle exceeds its baseline by more than 5%, the script
#        exits with code 1 so CI fails the build.
#
# @usage
#   # Local developer run (opens the Atlas visualiser in a browser):
#   bash scripts/analyze-bundle.sh
#
#   # CI run (skips the interactive Atlas server):
#   CI=1 bash scripts/analyze-bundle.sh
#
# @prerequisites
#   - Node.js and npm/npx available on PATH.
#   - `expo` and `expo-atlas` resolvable via npx (devDependencies in package.json).
#   - Run from the frontend project root (the directory containing app.json).
#   - `scripts/bundle-baseline.json` should exist; if absent the comparison is
#     skipped and only the summary is printed.
#
set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

# Resolve the project root from this script's location so it can be invoked
# from any working directory (CI runners, local shells, etc.).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# The Expo Atlas JSONL artifact is written here when EXPO_UNSTABLE_ATLAS=true.
ATLAS_FILE="${PROJECT_ROOT}/.expo/atlas.jsonl"

# Temporary directory used for the `expo export` output. Cleaned up on exit.
EXPORT_DIR="$(mktemp -d -t thryftverse-bundle-analysis-XXXXXX)"

# Baseline file used for the 5% regression gate.
BASELINE_FILE="${SCRIPT_DIR}/bundle-baseline.json"

# The allowed regression margin before CI fails. 1.05 == +5%.
MAX_REGRESSION_RATIO="1.05"

# -----------------------------------------------------------------------------
# Cleanup
# -----------------------------------------------------------------------------

# Remove the temporary export directory on exit so we never leak disk in CI.
cleanup() {
  if [[ -d "${EXPORT_DIR}" ]]; then
    rm -rf "${EXPORT_DIR}"
  fi
}
trap cleanup EXIT

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

# Convert bytes to a human-readable KB string with one decimal place.
bytes_to_kb() {
  local bytes="$1"
  awk "BEGIN { printf \"%.1f\", ${bytes} / 1024 }"
}

# Extract a numeric field from the baseline JSON for a given platform + key.
# Uses node so we don't depend on `jq` being installed in the CI image.
baseline_field() {
  local platform="$1"
  local key="$2"
  node -e "
    const fs = require('fs');
    const path = '${BASELINE_FILE}';
    if (!fs.existsSync(path)) { process.exit(2); }
    const data = JSON.parse(fs.readFileSync(path, 'utf8'));
    const value = data['${platform}'] && data['${platform}']['${key}'];
    if (typeof value !== 'number') { process.exit(2); }
    process.stdout.write(String(value));
  " 2>/dev/null
}

# Find the largest .js file under a directory tree and echo its byte size.
# `expo export` emits the bundle under `bundles/<platform>/index.js` on SDK 50+
# and at the root on older setups; picking the largest JS file is robust to both.
largest_js_size() {
  local dir="$1"
  find "${dir}" -type f -name '*.js' -printf '%s %p\n' 2>/dev/null \
    | sort -rn \
    | head -n 1 \
    | awk '{print $1}'
}

# -----------------------------------------------------------------------------
# 1. Export both platform bundles with the Atlas graph enabled
# -----------------------------------------------------------------------------

echo "==> Exporting bundles for all platforms (EXPO_UNSTABLE_ATLAS=true)..."
echo "    Output directory: ${EXPORT_DIR}"

# EXPO_UNSTABLE_ATLAS=true tells Metro to emit the atlas.jsonl module graph
# alongside the bundle so expo-atlas can render the dependency tree.
export EXPO_UNSTABLE_ATLAS=true

# `expo export --platform all` builds the JS bundle for every configured
# platform (ios + android) into the output directory. We pin --output-dir so
# we can inspect the artefacts deterministically afterwards.
( cd "${PROJECT_ROOT}" && npx expo export --platform all --output-dir "${EXPORT_DIR}" )

echo "==> Atlas graph written to ${ATLAS_FILE}"

# -----------------------------------------------------------------------------
# 2. Open the Atlas visualiser (interactive only — skipped in CI)
# -----------------------------------------------------------------------------

# In a CI environment there is no browser to open, so we skip launching the
# Atlas HTTP server. Locally, `npx expo-atlas` serves a web UI on port 9999
# that visualises which modules contribute to the bundle size.
if [[ "${CI:-}" == "1" || "${CI:-}" == "true" ]]; then
  echo "==> CI environment detected — skipping interactive Atlas server."
  echo "    To inspect locally, run: npx expo-atlas ${ATLAS_FILE}"
else
  echo "==> Launching expo-atlas visualiser (open http://localhost:9999)..."
  # Run in the background so the script can continue to the size summary.
  # The server stays up after the script exits; kill it manually if needed.
  ( cd "${PROJECT_ROOT}" && npx expo-atlas "${ATLAS_FILE}" >/dev/null 2>&1 & ) || true
fi

# -----------------------------------------------------------------------------
# 3. Summarise the per-platform bundle sizes
# -----------------------------------------------------------------------------

echo ""
echo "==> Bundle size summary"
echo "---------------------------------------------------------------"
printf "%-10s %-18s %-22s\n" "Platform" "JS Bundle" "Hermes Bytecode*"
echo "---------------------------------------------------------------"

# We record the measured sizes so the comparison step can reuse them without
# re-walking the export directory.
declare -A MEASURED_JS_KB

for platform in ios android; do
  platform_dir="${EXPORT_DIR}/bundles/${platform}"
  # Fallback to the root for older SDK layouts that don't create a per-platform
  # bundles subdirectory.
  if [[ ! -d "${platform_dir}" ]]; then
    platform_dir="${EXPORT_DIR}"
  fi

  js_bytes="$(largest_js_size "${platform_dir}")"
  if [[ -z "${js_bytes}" ]]; then
    echo "    WARNING: no JS bundle found for ${platform}; skipping."
    continue
  fi

  js_kb="$(bytes_to_kb "${js_bytes}")"
  MEASURED_JS_KB["${platform}"]="${js_kb}"

  # Hermes bytecode size is not emitted by `expo export` (it is produced by
  # the native build via `hermesc`). We surface the JS bundle size as the
  # primary CI signal and note that Hermes bytecode is measured separately.
  printf "%-10s %-18s %-22s\n" "${platform}" "${js_kb} KB" "(see native build)"
done

echo "---------------------------------------------------------------"
echo "* Hermes bytecode is generated during the native build (hermesc),"
echo "  not by expo export. Compare it against the baseline manually or"
echo "  via the EAS build artefacts."
echo ""

# -----------------------------------------------------------------------------
# 4. Compare against the baseline (fail CI if > 5% over baseline)
# -----------------------------------------------------------------------------

if [[ ! -f "${BASELINE_FILE}" ]]; then
  echo "==> No baseline file found at ${BASELINE_FILE}."
  echo "    Skipping regression comparison. To enable the gate, create the"
  echo "    baseline with scripts/bundle-baseline.json."
  exit 0
fi

echo "==> Comparing against baseline: ${BASELINE_FILE}"
echo ""

regression_detected=0

for platform in ios android; do
  measured_kb="${MEASURED_JS_KB["${platform}"]:-}"
  if [[ -z "${measured_kb}" ]]; then
    continue
  fi

  baseline_kb="$(baseline_field "${platform}" "jsBundleSizeKB")"
  if [[ -z "${baseline_kb}" ]]; then
    echo "    ${platform}: no jsBundleSizeKB baseline recorded — skipping."
    continue
  fi

  # Compute the ratio of measured / baseline. > 1.05 means > 5% regression.
  ratio="$(awk "BEGIN { printf \"%.4f\", ${measured_kb} / ${baseline_kb} }")"
  delta_pct="$(awk "BEGIN { printf \"%.2f\", (${ratio} - 1) * 100 }")"

  if awk "BEGIN { exit !(${ratio} > ${MAX_REGRESSION_RATIO}) }"; then
    echo "    FAIL  ${platform}: ${measured_kb} KB vs baseline ${baseline_kb} KB (${delta_pct}% over)"
    regression_detected=1
  else
    echo "    OK    ${platform}: ${measured_kb} KB vs baseline ${baseline_kb} KB (${delta_pct}% over)"
  fi
done

echo ""

if [[ "${regression_detected}" -ne 0 ]]; then
  echo "==> Bundle size regression detected: one or more platforms exceed the"
  echo "    baseline by more than 5%. Update the baseline only if the growth is"
  echo "    intentional and justified in the PR description."
  exit 1
fi

echo "==> All platforms within the 5% regression budget. CI gate passed."
exit 0
