/**
 * withLiveKit — config plugin for @livekit/react-native.
 *
 * The package ships no bundled Expo plugin (the official one lives in a
 * separate package, @livekit/react-native-expo-plugin, which is not a
 * dependency), so this local plugin performs the native wiring the SDK
 * needs under Expo CNG:
 *
 *  - Android manifest: audio-routing and connectivity permissions the
 *    LiveKit/WebRTC stack requires (CAMERA + RECORD_AUDIO are already
 *    declared in app.json and are only ensured here, never duplicated).
 *  - iOS Info.plist: UIBackgroundModes audio/voip/fetch so an ongoing
 *    broadcast keeps its audio session when the app is backgrounded.
 *
 * Camera and microphone usage descriptions already live in app.json
 * (NSCameraUsageDescription / NSMicrophoneUsageDescription) and are left
 * untouched.
 */

const { withAndroidManifest, withInfoPlist } = require('@expo/config-plugins');

const ANDROID_PERMISSIONS = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.WAKE_LOCK',
  'android.permission.BLUETOOTH',
  'android.permission.BLUETOOTH_CONNECT',
];

const IOS_BACKGROUND_MODES = ['audio', 'voip', 'fetch'];

const withLiveKitAndroidManifest = (config) =>
  withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const permissions = manifest['uses-permission'] ?? [];
    for (const name of ANDROID_PERMISSIONS) {
      const exists = permissions.some((p) => p?.$?.['android:name'] === name);
      if (!exists) {
        permissions.push({ $: { 'android:name': name } });
      }
    }
    manifest['uses-permission'] = permissions;
    return mod;
  });

const withLiveKitInfoPlist = (config) =>
  withInfoPlist(config, (mod) => {
    const modes = new Set(mod.modResults.UIBackgroundModes ?? []);
    for (const mode of IOS_BACKGROUND_MODES) modes.add(mode);
    mod.modResults.UIBackgroundModes = Array.from(modes);
    return mod;
  });

const withLiveKit = (config) =>
  withLiveKitInfoPlist(withLiveKitAndroidManifest(config));

module.exports = withLiveKit;
