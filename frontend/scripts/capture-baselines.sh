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
MOCK_MODE="${EXPO_PUBLIC_MOCK_MODE:-fixture-design}"

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

get_ios_sim_id() {
  xcrun simctl list devices booted -j | jq -r '.devices[][] | select(.state == "Booted") | .udid' | head -1
}

get_device_slug() {
  local platform="$1"
  if [ "$platform" = "ios" ]; then
    local sim_id
    sim_id=$(get_ios_sim_id)
    xcrun simctl list devices -j | jq -r --arg sid "$sim_id" \
      '.devices[][] | select(.udid == $sid) | .deviceType // "unknown"' | \
      sed 's/[^a-zA-Z0-9]//g' | tr '[:upper:]' '[:lower:]'
  else
    adb shell getprop ro.product.model | sed 's/[^a-zA-Z0-9]//g' | tr '[:upper:]' '[:lower:]'
  fi
}

PLATFORM=$(detect_platform)
DEVICE_SLUG=$(get_device_slug "$PLATFORM")
echo "[capture-baselines] Detected platform: $PLATFORM"
echo "[capture-baselines] Device slug: $DEVICE_SLUG"
echo "[capture-baselines] Mock mode: $MOCK_MODE"

set_ios_deterministic_state() {
  local sim_id
  sim_id=$(get_ios_sim_id)

  # Fixed status bar — 9:41, full wifi, full cellular, charged battery
  xcrun simctl status_bar "$sim_id" override \
    --time "9:41" \
    --dataNetwork wifi \
    --wifiMode active \
    --wifiBars 3 \
    --cellularMode active \
    --cellularBars 4 \
    --batteryState charged \
    --batteryLevel 100

  # Reduce motion — eliminates animation non-determinism
  xcrun simctl ui "$sim_id" reduce_motion yes
}

set_ios_theme() {
  local sim_id
  sim_id=$(get_ios_sim_id)
  xcrun simctl ui "$sim_id" appearance "$1"
}

set_ios_font_scale() {
  local sim_id
  sim_id=$(get_ios_sim_id)
  case "$1" in
    100) xcrun simctl ui "$sim_id" content_size default ;;
    130) xcrun simctl ui "$sim_id" content_size extra-extra-large ;;
    200) xcrun simctl ui "$sim_id" content_size accessibility-extra-extra-extra-large ;;
  esac
}

set_android_deterministic_state() {
  # Reduce motion + disable window/transition animations
  adb shell settings put secure reduce_motion 1
  adb shell settings put secure window_animation_scale 0.0
  adb shell settings put secure transition_animation_scale 0.0
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
  local label="${PLATFORM}-${DEVICE_SLUG}-${theme}-${font_scale}"

  echo "[capture-baselines] Capturing $label ..."

  if [ "$PLATFORM" = "ios" ]; then
    set_ios_theme "$theme"
    set_ios_font_scale "$font_scale"
  elif [ "$PLATFORM" = "android" ]; then
    set_android_theme "$theme"
    set_android_font_scale "$font_scale"
  fi

  sleep 2

  # NOTE: EXPO_PUBLIC_MOCK_MODE is a build-time env var embedded in the JS
  # bundle by EAS. It must be set in the eas.json build profile's env block,
  # not passed as a Maestro --env flag. The "screenshots" profile sets it.
  maestro test "$FLOW" \
    --env APP_ID="$APP_ID" \
    --env PLATFORM="$PLATFORM" \
    --env DEVICE="$DEVICE_SLUG" \
    --env THEME="$theme" \
    --env FONT_SCALE="$font_scale" \
    --env VISUAL_MODE=capture \
    --test-output-dir="$SCREENSHOTS_DIR/$label"
}

# Set deterministic device state once before the matrix runs
if [ "$PLATFORM" = "ios" ]; then
  set_ios_deterministic_state
elif [ "$PLATFORM" = "android" ]; then
  set_android_deterministic_state
fi

capture_variant light 100
capture_variant dark  100
capture_variant light 130
capture_variant light 200

echo "[capture-baselines] Resetting device to defaults ..."
if [ "$PLATFORM" = "ios" ]; then
  set_ios_theme light
  set_ios_font_scale 100
  xcrun simctl status_bar "$(get_ios_sim_id)" clear || true
elif [ "$PLATFORM" = "android" ]; then
  set_android_theme light
  set_android_font_scale 100
  adb shell settings put secure reduce_motion 0
  adb shell settings put secure window_animation_scale 1.0
  adb shell settings put secure transition_animation_scale 1.0
fi

echo "[capture-baselines] Copying screenshots to $ACTUAL_DIR ..."
find "$SCREENSHOTS_DIR" -name '*.png' -exec cp {} "$ACTUAL_DIR/" \;

ACTUAL_COUNT=$(find "$ACTUAL_DIR" -name '*.png' | wc -l | tr -d ' ')
echo "[capture-baselines] Captured $ACTUAL_COUNT screenshots to $ACTUAL_DIR"
echo "[capture-baselines] Review them, then run: npm run visual:approve"
