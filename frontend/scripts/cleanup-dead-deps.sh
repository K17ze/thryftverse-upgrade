#!/usr/bin/env bash
set -euo pipefail

DRY_RUN="${1:---dry-run}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== ThryftVerse Dead Dependency Cleanup ==="
echo "Mode: $DRY_RUN"
echo ""

CHANGES=0

echo "--- Checking @react-navigation/stack ---"
if grep -r "@react-navigation/stack" "$ROOT_DIR/src" --include="*.ts" --include="*.tsx" -l 2>/dev/null | head -5; then
  echo "  @react-navigation/stack is still imported. Skipping removal."
else
  if [ "$DRY_RUN" = "--apply" ]; then
    echo "  Removing @react-navigation/stack from package.json..."
    npm uninstall @react-navigation/stack 2>/dev/null || true
    CHANGES=$((CHANGES + 1))
  else
    echo "  [DRY RUN] Would remove @react-navigation/stack (not imported anywhere)"
    CHANGES=$((CHANGES + 1))
  fi
fi
echo ""

echo "--- Checking ElasticsearchSearchAdapter ---"
ELASTICSEARCH_FILES=$(grep -rl "ElasticsearchSearchAdapter" "$ROOT_DIR/src" --include="*.ts" --include="*.tsx" 2>/dev/null || true)
if [ -n "$ELASTICSEARCH_FILES" ]; then
  echo "  ElasticsearchSearchAdapter is referenced in:"
  echo "$ELASTICSEARCH_FILES" | head -5
  echo "  Skipping removal."
else
  ADAPTER_FILE=$(find "$ROOT_DIR/src" -name "*.ts" -path "*searchAdapter*" 2>/dev/null | head -1)
  if [ -n "$ADAPTER_FILE" ]; then
    if grep -q "ElasticsearchSearchAdapter" "$ADAPTER_FILE" 2>/dev/null; then
      if [ "$DRY_RUN" = "--apply" ]; then
        echo "  Removing ElasticsearchSearchAdapter from $ADAPTER_FILE..."
        sed -i.bak '/ElasticsearchSearchAdapter/d' "$ADAPTER_FILE"
        rm -f "${ADAPTER_FILE}.bak"
        CHANGES=$((CHANGES + 1))
      else
        echo "  [DRY RUN] Would remove ElasticsearchSearchAdapter class from $ADAPTER_FILE"
        CHANGES=$((CHANGES + 1))
      fi
    else
      echo "  No ElasticsearchSearchAdapter found in searchAdapter files."
    fi
  fi
fi
echo ""

echo "--- Checking for unused expo-haptics (expo-haptics vs react-native-haptic-feedback) ---"
HAPTICS_USAGE=$(grep -r "expo-haptics" "$ROOT_DIR/src" --include="*.ts" --include="*.tsx" -l 2>/dev/null | head -5 || true)
if [ -n "$HAPTICS_USAGE" ]; then
  echo "  expo-haptics is still used in:"
  echo "$HAPTICS_USAGE"
  echo "  Keeping expo-haptics."
else
  echo "  expo-haptics is not imported. Consider removing if unused."
fi
echo ""

echo "=== Cleanup Summary ==="
if [ "$CHANGES" -eq 0 ]; then
  echo "No changes needed."
else
  echo "$CHANGES change(s) $([ "$DRY_RUN" = "--apply" ] && echo "applied" || echo "would be applied")."
  if [ "$DRY_RUN" = "--dry-run" ]; then
    echo "Run with --apply to execute changes."
  fi
fi
