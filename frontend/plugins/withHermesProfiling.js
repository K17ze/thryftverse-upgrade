/**
 * withHermesProfiling — Expo config plugin that enables Hermes heap-profiling
 * infrastructure for Android and iOS release builds.
 *
 * The `expo-build-properties` plugin (SDK 57) does not expose a `hermesFlags`
 * config key — its schema (`pluginConfig.d.ts`) only supports `useHermesV1`
 * (boolean). React Native 0.85's `HermesInstance` Kotlin class likewise has no
 * API to pass arbitrary Hermes VM runtime flags (`-HEAP-PROFILE`,
 * `-Xgc-oom-handling=throw`) from Java/Kotlin; those flags are consumed by the
 * C++ `RuntimeConfig` inside the React Native JSI layer.
 *
 * This plugin bridges that gap by:
 *
 *   Android:
 *     1. Adding `HERMES_PROFILING_ENABLED=true` to `gradle.properties` so the
 *        React Gradle plugin and any custom native profiling code can detect
 *        the opt-in at build time.
 *     2. Setting `debuggable true` and `profileable true` on the release
 *        buildType in `app/build.gradle` so the Hermes inspector / CDP endpoint
 *        is reachable in a release build (where real performance
 *        characteristics are observed).
 *
 *   iOS:
 *     1. Injecting `HERMES_PROFILING_ENABLED = 1` into the Podfile so native
 *        profiling code and Pod hooks can detect the opt-in.
 *     2. Enabling `ENABLE_INSPECTOR` in the release xcconfig so the Hermes
 *        debugger is available in release builds.
 *
 * The plugin is registered only when `EXPO_HERMES_PROFILING=true` is set in the
 * environment (see `app.config.js`), keeping it opt-in and never on by default
 * in dev.
 *
 * The actual heap snapshot is captured at runtime via Chrome DevTools
 * (Memory tab → Take heap snapshot) or the `scripts/capture-heap-snapshot.sh`
 * helper. See `docs/BUNDLE_ANALYSIS.md` for the full workflow.
 *
 * @param {import('@expo/config-plugins').ConfigPlugin} config
 * @returns {import('@expo/config-plugins').ConfigPlugin}
 */
const {
  withAppBuildGradle,
  withGradleProperties,
  withPodfile,
  withXcodeProject,
} = require('@expo/config-plugins');

const HERMES_PROFILING_PROPERTY = 'HERMES_PROFILING_ENABLED';

function withHermesProfiling(config) {
  return withAndroidHermesProfiling(withIosHermesProfiling(config));
}

function withAndroidHermesProfiling(config) {
  return withGradleProperties(
    withAppBuildGradle(config, (modConfig) => {
      const contents = modConfig.modResults.contents;

      if (
        !contents.includes(
          `// withHermesProfiling — enable inspector in release for heap profiling`
        )
      ) {
        modConfig.modResults.contents = injectAndroidReleaseDebuggable(contents);
      }

      return modConfig;
    }),
    (modConfig) => {
      const properties = modConfig.modResults;
      const exists = properties.some(
        (item) => item.key === HERMES_PROFILING_PROPERTY
      );

      if (!exists) {
        properties.push({
          type: 'property',
          key: HERMES_PROFILING_PROPERTY,
          value: 'true',
        });
      }

      return modConfig;
    }
  );
}

function withIosHermesProfiling(config) {
  return withPodfile(
    withXcodeProject(config, (modConfig) => {
      const xcodeProject = modConfig.modResults;
      const target = xcodeProject.getFirstTarget().firstTarget;
      const configurations = xcodeProject.pbxXCBuildConfigurationSection();

      for (const key of Object.keys(configurations)) {
        const buildSettings = configurations[key].buildSettings;
        if (!buildSettings) continue;

        if (
          configurations[key].name === 'Release' ||
          (target && configurations[key].name === undefined && buildSettings.PRODUCT_NAME)
        ) {
          buildSettings.ENABLE_INSPECTOR = 'YES';
        }
      }

      return modConfig;
    }),
    (modConfig) => {
      const contents = modConfig.modResults.contents;

      if (!contents.includes('HERMES_PROFILING_ENABLED')) {
        const marker = "target 'thryftverse' do";
        const injection = [
          '',
          '# withHermesProfiling — Hermes heap profiling opt-in',
          "ENV['HERMES_PROFILING_ENABLED'] = '1'",
          '',
        ].join("\n");

        if (contents.includes(marker)) {
          modConfig.modResults.contents = contents.replace(
            marker,
            injection + marker
          );
        }
      }

      return modConfig;
    }
  );
}

function injectAndroidReleaseDebuggable(contents) {
  const releaseBlockPattern =
    /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)(\n\s*}\s*\n)/;

  if (!releaseBlockPattern.test(contents)) {
    return contents;
  }

  const injection = [
    '',
    '            // withHermesProfiling — enable inspector in release for heap profiling',
    '            debuggable true',
    '            profileable true',
  ].join("\n");

  return contents.replace(
    releaseBlockPattern,
    `$1${injection}$2`
  );
}

module.exports = withHermesProfiling;
