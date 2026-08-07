/**
 * withPrivacyManifest — Expo config plugin that copies the
 * `PrivacyInfo.xcprivacy` Apple privacy manifest into the generated iOS
 * project and registers it as a bundle resource so it is included in the
 * app bundle and picked up by App Store review.
 *
 * Managed-workflow compatible (no native project required pre-build).
 *
 * Reference: https://developer.apple.com/documentation/bundleresources/privacy_manifest
 */
const { withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PRIVACY_MANIFEST_FILENAME = 'PrivacyInfo.xcprivacy';

function withPrivacyManifest(config) {
  return withXcodeProject(config, (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const manifestPath = path.join(projectRoot, PRIVACY_MANIFEST_FILENAME);

    if (!fs.existsSync(manifestPath)) {
      throw new Error(
        `[withPrivacyManifest] Expected ${PRIVACY_MANIFEST_FILENAME} at project root: ${manifestPath}`
      );
    }

    const xcodeProject = config.modResults;
    const platformProjectRoot = config.modRequest.platformProjectRoot;
    const targetName = xcodeProject.getFirstTarget().firstTarget.name;

    // Copy the manifest into the native iOS project directory.
    const destPath = path.join(platformProjectRoot, PRIVACY_MANIFEST_FILENAME);
    fs.copyFileSync(manifestPath, destPath);

    // Add the file as a resource to the app target so it is bundled.
    const resourceFile = {
      basename: PRIVACY_MANIFEST_FILENAME,
      filepath: destPath,
      settings: {},
    };

    // Ensure the file is added to the PBXResourcesBuildPhase of the target.
    xcodeProject.addResourceFile(
      resourceFile.filepath,
      { target: targetName },
      { lastKnownFileType: 'text.xml' }
    );

    return config;
  });
}

module.exports = withPrivacyManifest;
