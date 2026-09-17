//
//  VideoExportRequestAnalysis.kt
//  thryft-video-export
//
//  Request validation + execution-path selection. Mirrors the decision
//  matrix documented in the module README:
//
//    remux     — no edits; stream-copy via MediaExtractor + MediaMuxer.
//                `muteAudio` is allowed (drops the audio track without
//                re-encoding video).
//    transcode — container/timing edits only: trim, constant speed or a
//                speed curve, bitrate change, mute. Media3 Transformer
//                with clipping + SpeedChangeEffect, no compositing.
//    compose   — edits requiring a render pipeline: overlays, reverse,
//                freeze-frame, resolution change. Full EditedMediaItem
//                sequence + OverlayEffect re-encode.
//

package com.margelo.nitro.videoexport

enum class VideoExportPath {
  REMUX,
  TRANSCODE,
  COMPOSE,
}

data class AnalysedVideoExportRequest(
  val request: VideoExportRequest,
  val path: VideoExportPath,
  val trimStartMs: Double,
  val trimEndMs: Double,
) {
  val hasOverlays: Boolean get() = !request.overlays.isNullOrEmpty()

  val hasSpeedCurve: Boolean
    get() = request.speedCurve?.points?.any { kotlin.math.abs(it.speed - 1.0) > 0.001 } == true

  val hasConstantSpeed: Boolean
    get() = request.speed?.let { kotlin.math.abs(it - 1.0) > 0.001 } == true

  val hasFreeze: Boolean
    get() = request.freezeFrameMs != null && (request.freezeDurationMs ?: 0.0) > 0

  val hasResize: Boolean
    get() = request.outputWidth != null || request.outputHeight != null

  val isReversed: Boolean get() = request.reversed == true
  val isMuted: Boolean get() = request.muteAudio == true
}

object VideoExportRequestAnalysis {
  fun analyse(request: VideoExportRequest): AnalysedVideoExportRequest {
    if (request.sourceUri.isEmpty()) {
      throw VideoExportException.invalidInput("sourceUri is empty.")
    }
    if (request.sessionId.isEmpty()) {
      throw VideoExportException.invalidInput("sessionId is empty.")
    }
    request.outputFormat?.let {
      if (it != "mp4") {
        throw VideoExportException.invalidInput("outputFormat '$it' is not supported — only 'mp4'.")
      }
    }
    request.speed?.let {
      if (it < 0.01 || it > 4.0) {
        throw VideoExportException.invalidInput("speed $it is outside the supported range (0.01–4.0).")
      }
    }
    val start = request.trimStartMs
    val end = request.trimEndMs
    if (start != null && end != null && end <= start) {
      throw VideoExportException.invalidInput(
        "trimEndMs ($end) must be greater than trimStartMs ($start).")
    }
    request.overlays?.forEach { overlay ->
      overlay.match(
        first = { text ->
          if (text.text.isEmpty()) {
            throw VideoExportException.invalidInput("text overlay '${text.id}' has empty text.")
          }
        },
        second = { sticker ->
          val hasImage = !sticker.stickerImageUri.isNullOrEmpty()
          val hasSvg = !sticker.stickerSvg.isNullOrEmpty()
          if (!hasImage && !hasSvg) {
            throw VideoExportException.invalidInput(
              "sticker overlay '${sticker.id}' has neither stickerImageUri nor stickerSvg.")
          }
          if (!hasImage) {
            throw VideoExportException.invalidInput(
              "sticker overlay '${sticker.id}' carries SVG markup only — the JS adapter must " +
                "rasterise it via Skia and pass stickerImageUri. Native export does not ship " +
                "an SVG rasteriser.")
          }
        },
      )
    }

    val analysed = AnalysedVideoExportRequest(
      request = request,
      path = VideoExportPath.REMUX,
      trimStartMs = maxOf(0.0, request.trimStartMs ?: 0.0),
      trimEndMs = request.trimEndMs ?: Double.POSITIVE_INFINITY,
    )
    return analysed.copy(path = resolvePath(analysed))
  }

  private fun resolvePath(request: AnalysedVideoExportRequest): VideoExportPath {
    if (request.hasOverlays || request.isReversed || request.hasFreeze || request.hasResize) {
      return VideoExportPath.COMPOSE
    }
    if (request.hasConstantSpeed || request.hasSpeedCurve
      || request.request.outputBitrateKbps != null
      || request.request.trimStartMs != null || request.request.trimEndMs != null) {
      return VideoExportPath.TRANSCODE
    }
    return VideoExportPath.REMUX
  }
}
