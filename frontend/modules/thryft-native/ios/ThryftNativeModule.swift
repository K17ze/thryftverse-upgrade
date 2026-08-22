import ExpoModulesCore
import UIKit

/**
 * Device info returned by `ThryftNativeModule.getDeviceInfo`.
 */
public struct DeviceInfo: Record {
  @Field var platform: String = "ios"
  @Field var model: String = ""
  @Field var osVersion: String = ""
}

/**
 * Build info returned by `ThryftNativeModule.getNativeBuildInfo`.
 */
public struct NativeBuildInfo: Record {
  @Field var buildVersion: String = ""
  @Field var buildTimestamp: String = ""
}

/**
 * ThryftNativeModule — proof-of-concept local Expo module for ThryftVerse.
 *
 * Uses the Expo Modules API (Swift DSL) to expose:
 *  - `getDeviceInfo()`      → platform, model, OS version
 *  - `getNativeBuildInfo()` → build version + timestamp
 *  - `moduleName` constant  → "ThryftNative"
 *
 * This is NOT a raw Codegen TurboModule. The Expo Modules API generates the
 * bridge/Fabric registration automatically from the `ModuleDefinition` DSL.
 */
public class ThryftNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ThryftNative")

    Constants {
      [
        "moduleName": "ThryftNative"
      ]
    }

    AsyncFunction("getDeviceInfo") { () -> DeviceInfo in
      let device = UIDevice.current
      return DeviceInfo(
        platform: "ios",
        model: device.model,
        osVersion: device.systemVersion
      )
    }

    AsyncFunction("getNativeBuildInfo") { () -> NativeBuildInfo in
      let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown"
      let timestamp = ISO8601DateFormatter().string(from: Date())
      return NativeBuildInfo(
        buildVersion: version,
        buildTimestamp: timestamp
      )
    }
  }
}
