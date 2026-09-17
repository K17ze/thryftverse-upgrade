//
//  VideoExportSession.kt
//  thryft-video-export
//
//  Per-export session state + a thread-safe registry. One session per
//  `sessionId` from the JS `VideoExportRequest` — the registry backs the
//  module's `cancelExport` / `getExportProgress` surface.
//
//  Progress: Media3 `Transformer` reports progress through `getProgress`
//  (a `ProgressHolder`, 0..100). The pipeline polls it on a short cadence
//  and stores the latest value here; `getExportProgress` reads it back as
//  a 0..1 fraction. During the pre-export phase (media load, remux copy)
//  the session reports a nominal 0.05 so callers see the job as started.
//

package com.margelo.nitro.videoexport

import androidx.media3.transformer.Transformer
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

class VideoExportSession(val sessionId: String) {
  /** Live transformer for the encode phase — cancel + progress source. */
  val transformer = AtomicReference<Transformer?>(null)

  /** Last polled progress in 0..1. */
  @Volatile var progress: Double = 0.05

  /** Set when `cancelExport` fires — the pipeline checks between phases. */
  val cancelled = AtomicBoolean(false)

  /** Partial output file — deleted on cancel/failure so a half-written
   *  MP4 never leaks into the caller's pipeline. */
  @Volatile var outputFile: File? = null

  fun cancel() {
    cancelled.set(true)
    transformer.get()?.cancel()
  }
}

class VideoExportSessionRegistry {
  private val sessions = ConcurrentHashMap<String, VideoExportSession>()

  fun register(session: VideoExportSession) {
    sessions[session.sessionId] = session
  }

  fun sessionFor(sessionId: String): VideoExportSession? = sessions[sessionId]

  fun unregister(sessionId: String) {
    sessions.remove(sessionId)
  }
}
