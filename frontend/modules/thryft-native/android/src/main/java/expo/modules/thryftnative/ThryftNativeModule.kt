package expo.modules.thryftnative

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/**
 * Device info returned by [ThryftNativeModule.getDeviceInfo].
 */
data class DeviceInfo(
  @Field val platform: String = "android",
  @Field val model: String = "",
  @Field val osVersion: String = ""
)

/**
 * Build info returned by [ThryftNativeModule.getNativeBuildInfo].
 */
data class NativeBuildInfo(
  @Field val buildVersion: String = "",
  @Field val buildTimestamp: String = ""
)

/**
 * ThryftNativeModule — proof-of-concept local Expo module for ThryftVerse.
 *
 * Uses the Expo Modules API (Kotlin DSL) to expose:
 *  - `getDeviceInfo()`     → platform, model, OS version
 *  - `getNativeBuildInfo()` → build version + timestamp
 *  - `moduleName` constant → "ThryftNative"
 *
 * This is NOT a raw Codegen TurboModule. The Expo Modules API generates the
 * bridge/Fabric registration automatically from the [ModuleDefinition] DSL.
 */
class ThryftNativeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ThryftNative")

    Constants {
      mapOf(
        "moduleName" to "ThryftNative"
      )
    }

    AsyncFunction("getDeviceInfo") {
      DeviceInfo(
        platform = "android",
        model = Build.MODEL ?: "unknown",
        osVersion = Build.VERSION.RELEASE ?: "unknown"
      )
    }

    AsyncFunction("getNativeBuildInfo") {
      val packageInfo = try {
        appContext.reactContext?.packageManager?.getPackageInfo(
          appContext.reactContext?.packageName,
          0
        )
      } catch (_: Throwable) {
        null
      }
      NativeBuildInfo(
        buildVersion = packageInfo?.versionName ?: "unknown",
        buildTimestamp = System.currentTimeMillis().toString()
      )
    }
  }
}
