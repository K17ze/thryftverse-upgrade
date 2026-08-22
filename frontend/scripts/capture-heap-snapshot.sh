#!/usr/bin/env bash
#
# @file capture-heap-snapshot.sh
# @summary Capture a Hermes heap snapshot from a running ThryftVerse dev build
#          and save it to scripts/heap-snapshots/ with a timestamped filename.
#
# @description
#   A Hermes heap snapshot (.heapsnapshot) is a full graph of every JavaScript
#   object alive in the Hermes VM at a point in time. It is the primary tool for
#   diagnosing memory leaks and retained-object regressions in a React Native
#   app. This script automates the capture workflow so it can be run on demand
#   from a developer machine or as a CI step after a memory-stress scenario.
#
#   The capture path depends on what is available in the toolchain:
#
#     A. `npx react-native heap-snapshot` — the first-class CLI shipped with
#        recent versions of `@react-native-community/cli`. When available this
#        is the preferred path because it handles the Hermes inspector session
#        and file download in one command.
#     B. Hermes instrumentation API — for older toolchains, the script falls
#        back to invoking the Hermes sampling/profiling endpoint exposed via
#        the Chrome DevTools Protocol over the Metro / inspector socket. The
#        snapshot is requested via `HeapProfiler.takeHeapSnapshot` and the
#        resulting payload is written to disk.
#
#   In both cases the snapshot is saved to:
#       scripts/heap-snapshots/heap-<platform>-<timestamp>.heapsnapshot
#
#   After capture, the script prints instructions for loading the snapshot
#   into Chrome DevTools (Memory tab > Load) for analysis.
#
# @usage
#   # Capture from a running iOS simulator dev build:
#   bash scripts/capture-heap-snapshot.sh --platform ios
#
#   # Capture from a running Android emulator dev build:
#   bash scripts/capture-heap-snapshots.sh --platform android
#
#   # Capture with an explicit app package (Android only):
#   bash scripts/capture-heap-snapshot.sh --platform android --package com.thryftverse.app
#
# @prerequisites
#   - A ThryftVerse dev build running on a simulator or emulator with Metro
#     connected. Start it with `npx expo start` or `npx react-native run-ios`.
#   - Hermes must be enabled (it is the default engine for RN 0.70+).
#   - For path A: `@react-native-community/cli` with the heap-snapshot command.
#   - For path B: `node` (used to drive the inspector WebSocket) and the
#     `ws` package, which is a transitive dependency of Metro.
#   - Run from the frontend project root.
#
set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SNAPSHOT_DIR="${SCRIPT_DIR}/heap-snapshots"

# Ensure the snapshot output directory exists (it is kept in git via .gitkeep).
mkdir -p "${SNAPSHOT_DIR}"

# -----------------------------------------------------------------------------
# Argument parsing
# -----------------------------------------------------------------------------

platform="ios"
package_name="com.thryftverse.app"

usage() {
  cat <<EOF
Usage: bash scripts/capture-heap-snapshot.sh [options]

Options:
  --platform <ios|android>   Target platform (default: ios)
  --package <name>           Android application package (default: ${package_name})
  -h, --help                 Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform)
      platform="${2:?--platform requires a value}"
      shift 2
      ;;
    --package)
      package_name="${2:?--package requires a value}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "${platform}" != "ios" && "${platform}" != "android" ]]; then
  echo "ERROR: --platform must be 'ios' or 'android' (got '${platform}')" >&2
  exit 1
fi

# Timestamp used in the snapshot filename. ISO 8601, filesystem-safe.
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
snapshot_file="${SNAPSHOT_DIR}/heap-${platform}-${timestamp}.heapsnapshot"

# -----------------------------------------------------------------------------
# Prerequisite checks
# -----------------------------------------------------------------------------

echo "==> ThryftVerse Hermes heap snapshot capture"
echo "    Platform:   ${platform}"
echo "    Package:    ${package_name}"
echo "    Output:     ${snapshot_file}"
echo ""

# Confirm a dev build is reachable. We do this by checking that Metro is
# listening on its default port (8081). This is a heuristic — the real
# connectivity check happens when the inspector session is opened.
if ! curl -sf "http://localhost:8081/status" >/dev/null 2>&1; then
  echo "ERROR: Metro does not appear to be running on http://localhost:8081." >&2
  echo "       Start a dev build with 'npx expo start' or 'npx react-native run-${platform}'" >&2
  echo "       and re-run this script once the app is loaded." >&2
  exit 1
fi

echo "==> Metro is reachable on http://localhost:8081"
echo ""

# -----------------------------------------------------------------------------
# Capture the heap snapshot
# -----------------------------------------------------------------------------

# Path A — first-class CLI. `npx react-native heap-snapshot` was added to the
# community CLI to wrap the Hermes inspector session and download the .heapsnapshot
# file in one shot. We try it first because it is the most reliable path.
capture_via_cli() {
  echo "==> Attempting capture via 'npx react-native heap-snapshot'..."
  ( cd "${PROJECT_ROOT}" && \
    npx react-native heap-snapshot \
      --platform "${platform}" \
      --output "${snapshot_file}" \
      ${package_name:+--packageName "${package_name}"} )
}

# Path B — Hermes instrumentation API via the Chrome DevTools Protocol.
# When the first-class CLI is unavailable, we drive the Hermes inspector
# directly. Metro exposes the CDP endpoint over a WebSocket; we send the
# `HeapProfiler.takeHeapSnapshot` method, which causes Hermes to serialise
# the live heap graph and stream it back as a sequence of CDP events. The
# node script below handles the WebSocket handshake, the request, and the
# reassembly of the streamed chunks into a single .heapsnapshot file.
capture_via_cdp() {
  echo "==> Falling back to Hermes instrumentation API (CDP HeapProfiler)..."
  echo "    This requires the 'ws' package (a transitive dependency of Metro)."

  node -e '
    const fs = require("fs");
    const path = process.argv[1];
    const WebSocket = require("ws");

    // Metro exposes the Hermes inspector endpoint. The exact URL is printed
    // by Metro when the app connects; for a single connected app it is
    // typically ws://localhost:8081/inspector/device?device=...&page=1.
    // We attempt the common local endpoints in order.
    const endpoints = [
      process.env.HERMES_INSPECTOR_WS,
      "ws://localhost:8081/inspector/device?device=1&page=1",
    ].filter(Boolean);

    function tryEndpoint(idx) {
      if (idx >= endpoints.length) {
        console.error("Could not connect to a Hermes inspector endpoint.");
        console.error("Set HERMES_INSPECTOR_WS to the WebSocket URL printed by Metro.");
        process.exit(1);
      }
      const ws = new WebSocket(endpoints[idx]);
      let chunks = [];
      let msgId = 1;

      ws.on("open", () => {
        // Enable the HeapProfiler domain so we receive heap-snapshot events.
        ws.send(JSON.stringify({ id: msgId++, method: "HeapProfiler.enable" }));
        // Request the snapshot. Hermes will stream it back via
        // `HeapProfiler.addHeapSnapshotChunk` events.
        ws.send(JSON.stringify({ id: msgId++, method: "HeapProfiler.takeHeapSnapshot" }));
      });

      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.method === "HeapProfiler.addHeapSnapshotChunk" && msg.params) {
          chunks.push(msg.params.chunk);
        }
        if (msg.id === 2) {
          // Response to takeHeapSnapshot — snapshot is complete.
          fs.writeFileSync(path, chunks.join(""));
          console.log("Heap snapshot written to " + path);
          ws.close();
          process.exit(0);
        }
      });

      ws.on("error", () => tryEndpoint(idx + 1));
    }

    tryEndpoint(0);
  ' "${snapshot_file}"
}

# Prefer the first-class CLI; fall back to the CDP driver if it is missing or
# errors out. This keeps the script portable across toolchain versions.
if ! capture_via_cli 2>&1; then
  echo "    'npx react-native heap-snapshot' unavailable or failed."
  capture_via_cdp
fi

# -----------------------------------------------------------------------------
# Verify the output and print follow-up instructions
# -----------------------------------------------------------------------------

if [[ ! -s "${snapshot_file}" ]]; then
  echo "ERROR: snapshot file was not written or is empty: ${snapshot_file}" >&2
  exit 1
fi

size_kb="$(awk "BEGIN { printf \"%.1f\", $(stat -c%s "${snapshot_file}" 2>/dev/null || stat -f%z "${snapshot_file}") / 1024 }")"

echo ""
echo "==> Heap snapshot captured successfully"
echo "    File: ${snapshot_file}"
echo "    Size: ${size_kb} KB"
echo ""
echo "==> How to analyse the snapshot"
echo "    1. Open Chrome / Edge and navigate to chrome://inspect (or edge://inspect)."
echo "    2. Open DevTools (F12) and switch to the 'Memory' tab."
echo "    3. Right-click in the left pane and choose 'Load...' (or click"
echo "       'Load' in the profiling toolbar)."
echo "    4. Select the .heapsnapshot file at:"
echo "         ${snapshot_file}"
echo "    5. Use the 'Summary' view to find retained objects by constructor name,"
echo "       and the 'Comparison' view to diff against a baseline snapshot taken"
echo "       before the suspected leak."
echo ""
echo "==> Tip: capture a baseline snapshot before exercising the suspect flow,"
echo "    then a second one afterwards. Diffing the two in DevTools isolates the"
echo "    objects that leaked."
echo ""
echo "==> Done."
