//
//  HybridVideoExportModule.kt
//  thryft-video-export
//
//  Media3 Transformer implementation of the `VideoExportModule`
//  HybridObject. Registered under the Nitro name "VideoExportModule" via
//  the generated `ThryftVideoExportOnLoad` — `getVideoExportModule()` on
//  the JS side resolves this instance.
//
//  Execution paths (see VideoExportRequestAnalysis.kt):
//    remux     → MediaExtractor + MediaMuxer stream copy (no decode)
//    transcode → EditedMediaItem clipping + SpeedChangeEffect
//    compose   → EditedMediaItemSequence + OverlayEffect + Presentation
//
//  Cancellation + progress key off `sessionId` — the registry survives
//  JS-side teardown, so an export keeps running even if the JS caller's
//  promise is dropped.
//

package com.margelo.nitro.videoexport

import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise

class HybridVideoExportModule : HybridVideoExportModuleSpec() {

  private val registry = VideoExportSessionRegistry()

  override fun isAvailable(): Boolean {
    // Media3 Transformer is bundled with the module — availability gates on
    // the module being linked, which `isVideoExportAvailable()` on the JS
    // side already checks via `NitroModules.hasHybridObject`.
    return NitroModules.applicationContext != null
  }

  override fun exportVideo(request: VideoExportRequest): Promise<VideoExportResult> {
    return Promise.async {
      val context = NitroModules.applicationContext
        ?: throw VideoExportException.unsupported("No application context.")
      val analysed = VideoExportRequestAnalysis.analyse(request)
      val session = VideoExportSession(request.sessionId)
      registry.register(session)
      try {
        VideoExportPipeline.export(context, analysed, session)
      } finally {
        registry.unregister(request.sessionId)
      }
    }
  }

  override fun cancelExport(sessionId: String) {
    registry.sessionFor(sessionId)?.cancel()
  }

  override fun getExportProgress(sessionId: String): Double {
    return registry.sessionFor(sessionId)?.progress ?: 0.0
  }
}
