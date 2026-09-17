//
//  VideoExportError.kt
//  thryft-video-export
//
//  Error type mirroring the JS-side `VideoExportError` discriminated union.
//  `code` maps to the union's `type` field; the JS wrapper
//  (`toVideoExportError` in src/index.ts) parses the message prefix
//  `"{code}:{message}"` back into the union, so the tag must stay in sync.
//

package com.margelo.nitro.videoexport

class VideoExportException(
  val code: String,
  detail: String,
) : Exception("$code:$detail") {
  companion object {
    fun cancelled() = VideoExportException("cancelled", "Export was cancelled.")
    fun unsupported(detail: String) = VideoExportException("unsupported", detail)
    fun renderFailed(detail: String) = VideoExportException("render_failed", detail)
    fun invalidInput(detail: String) = VideoExportException("invalid_input", detail)
  }
}
