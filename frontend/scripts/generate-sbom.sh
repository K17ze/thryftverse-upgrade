#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${1:-sbom}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

mkdir -p "$OUT_DIR"

echo "Generating SBOM for frontend..."
cd "$ROOT_DIR"

if npx --yes @cyclonedx/cyclonedx-npm --output-file "$OUT_DIR/frontend.json" --output-format JSON 2>/dev/null; then
  echo "  -> $OUT_DIR/frontend.json"
else
  echo "  cyclonedx-npm not available, trying npm sbom..."
  if npm sbom --sbom-format=cyclonedx-1b > "$OUT_DIR/frontend.json" 2>/dev/null; then
    echo "  -> $OUT_DIR/frontend.json"
  else
    echo "  WARNING: Could not generate frontend SBOM. Install @cyclonedx/cyclonedx-npm."
  fi
fi

BACKEND_DIR="$ROOT_DIR/../backend/api"
if [ -d "$BACKEND_DIR" ]; then
  echo "Generating SBOM for backend..."
  cd "$BACKEND_DIR"
  if npx --yes @cyclonedx/cyclonedx-npm --output-file "$ROOT_DIR/$OUT_DIR/backend.json" --output-format JSON 2>/dev/null; then
    echo "  -> $OUT_DIR/backend.json"
  else
    if npm sbom --sbom-format=cyclonedx-1b > "$ROOT_DIR/$OUT_DIR/backend.json" 2>/dev/null; then
      echo "  -> $OUT_DIR/backend.json"
    else
      echo "  WARNING: Could not generate backend SBOM."
    fi
  fi
fi

echo "SBOM generation complete."
