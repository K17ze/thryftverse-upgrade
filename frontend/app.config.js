const appJson = require('./app.json');

module.exports = function () {
  const buildProfile = process.env.EAS_BUILD_PROFILE;
  const isDevBuild =
    buildProfile === 'development' || buildProfile === 'development-simulator';

  return {
    ...appJson,
    expo: {
      ...appJson.expo,
      updates: {
        ...appJson.expo.updates,
        // EAS development builds should always load from Metro, never from a
        // published update. Otherwise a stale update on the development channel
        // overrides local changes and real-time iteration breaks.
        ...(isDevBuild ? { enabled: false } : {}),
      },
    },
  };
};
