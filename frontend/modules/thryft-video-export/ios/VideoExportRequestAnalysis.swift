//
//  VideoExportRequestAnalysis.swift
//  thryft-video-export
//
//  Request validation + execution-path selection. Mirrors the decision
//  matrix documented in the module README:
//
//    remux     — no edits; stream-copy video+audio into a new container.
//                `muteAudio` is allowed (drops the audio track without
//                re-encoding video).
//    transcode — container/timing edits only: trim, constant speed or a
//                speed curve, bitrate change, mute. Re-encodes the video
//                track through VideoToolbox; no per-frame compositing.
//    compose   — edits requiring a render pipeline: overlays, reverse,
//                freeze-frame, resolution change. Full re-encode through
//                AVMutableComposition + AVVideoComposition.
//

import Foundation
import AVFoundation

enum VideoExportPath {
  case remux
  case transcode
  case compose
}

struct AnalysedVideoExportRequest {
  let request: VideoExportRequest
  let path: VideoExportPath

  /// Trim window in source milliseconds (clamped to the asset duration).
  let trimStartMs: Double
  let trimEndMs: Double

  /// Whether overlays must be burned into each frame.
  var hasOverlays: Bool { !(request.overlays?.isEmpty ?? true) }

  var hasSpeedCurve: Bool {
    guard let curve = request.speedCurve else { return false }
    // A curve that is effectively 1x throughout needs no resampling.
    return !curve.points.allSatisfy { abs($0.speed - 1.0) < 0.001 }
  }

  var hasConstantSpeed: Bool {
    guard let speed = request.speed else { return false }
    return abs(speed - 1.0) > 0.001
  }

  var hasFreeze: Bool {
    request.freezeFrameMs != nil && (request.freezeDurationMs ?? 0) > 0
  }

  var hasResize: Bool {
    (request.outputWidth != nil) || (request.outputHeight != nil)
  }

  var isReversed: Bool { request.reversed ?? false }
  var isMuted: Bool { request.muteAudio ?? false }
}

enum VideoExportRequestAnalysis {
  /// Validate the request and pick the execution path. Throws
  /// `VideoExportFailure.invalidInput` on unrenderable requests.
  static func analyse(_ request: VideoExportRequest) throws -> AnalysedVideoExportRequest {
    guard !request.sourceUri.isEmpty else {
      throw VideoExportFailure.invalidInput("sourceUri is empty.")
    }
    guard !request.sessionId.isEmpty else {
      throw VideoExportFailure.invalidInput("sessionId is empty.")
    }
    if let format = request.outputFormat, format != "mp4" {
      throw VideoExportFailure.invalidInput("outputFormat '\(format)' is not supported — only 'mp4'.")
    }
    if let speed = request.speed, speed < 0.01 || speed > 4.0 {
      throw VideoExportFailure.invalidInput("speed \(speed) is outside the supported range (0.01–4.0).")
    }
    if let start = request.trimStartMs, let end = request.trimEndMs, end <= start {
      throw VideoExportFailure.invalidInput("trimEndMs (\(end)) must be greater than trimStartMs (\(start)).")
    }
    for overlay in request.overlays ?? [] {
      switch overlay {
      case .first(let text):
        if text.text.isEmpty {
          throw VideoExportFailure.invalidInput("text overlay '\(text.id)' has empty text.")
        }
      case .second(let sticker):
        if (sticker.stickerImageUri ?? "").isEmpty && (sticker.stickerSvg ?? "").isEmpty {
          throw VideoExportFailure.invalidInput(
            "sticker overlay '\(sticker.id)' has neither stickerImageUri nor stickerSvg.")
        }
        if sticker.stickerImageUri == nil && sticker.stickerSvg != nil {
          throw VideoExportFailure.invalidInput(
            "sticker overlay '\(sticker.id)' carries SVG markup only — the JS adapter must rasterise " +
            "it via Skia and pass stickerImageUri. Native export does not ship an SVG rasteriser.")
        }
      }
    }

    let analysed = AnalysedVideoExportRequest(
      request: request,
      path: .remux, // resolved below
      trimStartMs: max(0, request.trimStartMs ?? 0),
      trimEndMs: max(0, request.trimEndMs ?? .infinity)
    )
    let path = resolvePath(analysed)
    return AnalysedVideoExportRequest(
      request: request,
      path: path,
      trimStartMs: analysed.trimStartMs,
      trimEndMs: analysed.trimEndMs
    )
  }

  private static func resolvePath(_ request: AnalysedVideoExportRequest) -> VideoExportPath {
    if request.hasOverlays || request.isReversed || request.hasFreeze || request.hasResize {
      return .compose
    }
    if request.hasConstantSpeed || request.hasSpeedCurve
        || request.request.outputBitrateKbps != nil
        || request.request.trimStartMs != nil || request.request.trimEndMs != nil {
      return .transcode
    }
    return .remux
  }
}
