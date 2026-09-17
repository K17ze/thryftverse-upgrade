//
//  ThryftVideoExportPackage.kt
//  thryft-video-export
//
//  RN CLI autolinking discovers this `*Package` class under the manifest
//  package and instantiates it when building the app's PackageList. The
//  static initialiser loads `libThryftVideoExport.so`, whose `JNI_OnLoad`
//  calls `registerAllNatives()` — registering the `VideoExportModule`
//  HybridObject constructor with Nitro's `HybridObjectRegistry`.
//

package com.margelo.nitro.videoexport

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfoProvider

class ThryftVideoExportPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? = null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
    ReactModuleInfoProvider { HashMap() }

  companion object {
    init {
      ThryftVideoExportOnLoad.initializeNative()
    }
  }
}
