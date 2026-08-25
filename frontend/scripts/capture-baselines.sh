#!/usr/bin/env bash
set -euo pipefail

# capture-baselines.sh — runs the Maestro visualRegressionMatrix flow
# across theme and font-scale variants, then copies the captured
# screenshots into the reg-suit actual directory.
#
# Prerequisites:
#   - Maestro is installed and on PATH (https://maestro.mobile.dev)
#   - A development build is installed on a booted simulator/emulator
#   - APP_ID env var is set (default: com.thryftverse.app)
#
# Usage:
#   npm run visual:capture
#   # or directly:
#   bash scripts/capture-baselines.sh
#
# After capture, review the screenshots in:
#   src/__tests__/__screenshots__/actual/
#
# Then promote to baselines:
#   npm run visual:approve

APP_ID="${APP_ID:-com.thryftverse.app}"
FLOW=".maestro/flows/visualRegressionMatrix.yaml"
SCREENSHOTS_DIR=".maestro/screenshots"
ACTUAL_DIR="src/__tests__/__screenshots__/actual"

mkdir -p "$SCREENSHOTS_DIR" "$ACTUAL_DIR"

detect_platform() {
  if command -v xcrun >/dev/null 2>&1 && xcrun simctl list devices booted | grep -q .; then
    echo "ios"
  elif command -v adb >/dev/null 2>&1 && adb devices | grep -q "emulator\|device$"; then
    echo "android"
  else
    echo "unknown"
  fi
}

PLATFORM=$(detect_platform)
echo "[capture-baselines] Detected platform: $PLATFORM"

set_ios_theme() {
  local sim_id
  sim_id=$(xcrun simctl list devices booted -j | jq -r '.devices[][] | select(.state == "Booted") | .udid' | head -1)
  xcrun simctl ui "$sim_id" appearance "$1"
}

set_ios_font_scale() {
  local sim_id
  sim_id=$(xcrun simctl list devices booted -j | jq -r '.devices[][] | select(.state == "Booted") | .udid' | head -1)
  case "$1" in
    100) xcrun simctl ui "$sim_id" content_size default ;;
    130) xcrun simctl ui "$sim_id" content_size extra-extra-large ;;
    200) xcrun simctl ui "$sim_id" content_size accessibility-extra-extra-extra-large ;;
  esac
}

set_android_theme() {
  if [ "$1" = "dark" ]; then
    adb shell cmd uimode night yes
  else
    adb shell cmd uimode night no
  fi
}

set_android_font_scale() {
  local scale
  case "$1" in
    100) scale="1.0" ;;
    130) scale="1.3" ;;
    200) scale="2.0" ;;
  esac
  adb shell settings put system font_scale "$scale"
}

capture_variant() {
  local theme="$1"
  local font_scale="$2"
  local label="${theme}-${font_scale}"

  echo "[capture-baselines] Capturing $label ..."

  if [ "$PLATFORM" = "ios" ]; then
    set_ios_theme "$theme"
    set_ios_font_scale "$font_scale"
  elif [ "$PLATFORM" = "android" ]; then
    set_android_theme "$theme"
    set_android_font_scale "$font_scale"
  fi

  sleep 2

  maestro test "$FLOW" \
    --env APP_ID="$APP_ID" \
    --env THEME="$theme" \
    --env FONT_SCALE="$font_scale" \
    --test-output-dir="$SCREENSHOTS_DIR/$label"
}

capture_variant light 100
capture_variant dark  100
capture_variant light 130
capture_variant light 200

echo "[capture-baselines] Resetting device to defaults ..."
if [ "$PLATFORM" = "ios" ]; then
  set_ios_theme light
  set_ios_font_scale 100
elif [ "$PLATFORM" = "android" ]; then
  set_android_theme light
  set_android_font_scale 100
fi

echo "[capture-baselines] Copying screenshots to $ACTUAL_DIR ..."
find "$SCREENSHOTS_DIR" -name '*.png' -exec cp {} "$ACTUAL_DIR/" \;

ACTUAL_COUNT=$(find "$ACTUAL_DIR" -name '*.png' | wc -l | tr -d ' ')
echo "[capture-baselines] Captured $ACTUAL_COUNT screenshots to $ACTUAL_DIR"
echo "[capture-baselines] Review them, then run: npm run visual:approve"
