# Visual Regression Baselines

This directory holds the screenshot baselines for reg-suit visual regression
comparison. Baselines are organised into three subdirectories:

| Directory   | Purpose                                                  |
|-------------|----------------------------------------------------------|
| `expected/` | Approved baseline screenshots (committed to git)         |
| `actual/`   | Screenshots captured by the current run (git-ignored)   |
| `diff/`     | Pixel-diff overlays produced by reg-suit (git-ignored)   |

## First-run baseline capture

Baselines must be captured on a real device or simulator. They cannot be
generated in a CI-less environment. To seed the initial baselines:

```bash
# 1. Build and install a development client on your target device
npm run ios          # or npm run android

# 2. Capture screenshots across the theme + font-scale matrix
npm run visual:capture

# 3. Review the captured screenshots in src/__tests__/__screenshots__/actual/

# 4. Promote the captured screenshots to approved baselines
npm run visual:approve

# 5. Commit the expected/ directory
git add src/__tests__/__screenshots__/expected/
git commit -m "chore: seed visual regression baselines"
```

## Ongoing workflow

On every PR, the screenshots CI workflow captures fresh screenshots and
runs `reg-suit compare` against the committed `expected/` baselines. If
the diff exceeds the 0.1% threshold, the workflow fails and the report
is uploaded as a CI artifact.

To update baselines after an intentional visual change:

```bash
npm run visual:capture
npm run visual:approve
git add src/__tests__/__screenshots__/expected/
```

## reg-suit configuration

See `frontend/regconfig.json` for the reg-suit configuration. The
threshold is set to 0.1% — any pixel diff above this fails the
comparison.
