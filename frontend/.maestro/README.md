# ThryftVerse Maestro screenshot flows
#
# These flows drive the app on iOS / Android simulators and capture
# screenshots of the flagship surfaces. They are run by the
# `screenshots.yml` GitHub workflow on every PR touching `frontend/**`
# and on every release tag.
#
# Flows assume the app is already installed and launched on a simulator
# (the workflow handles build + boot + install). Each flow:
#   1. navigates to a surface
#   2. waits for the loading state to settle
#   3. captures a screenshot into `.maestro/screenshots/`
#
# The screenshots are uploaded as GitHub Actions artifacts so a human
# can perform the P0-1 native visual acceptance without running the
# flows locally.
#
# Prerequisites:
#   - Maestro installed (`curl -Ls "https://get.maestro.mobile.tools" | bash`)
#   - iOS Simulator booted with the dev build installed, OR
#   - Android emulator booted with the dev build installed
#
# Run locally:
#   maestro test .maestro/flows/home.yaml --env APP_ID=com.thryftverse.app
