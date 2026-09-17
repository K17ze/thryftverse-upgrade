//
//  VideoCompositionBuilder.swift
//  thryft-video-export
//
//  Translates a `VideoExportRequest` into an `AVMutableComposition` +
//  optional `AVMutableVideoComposition`.
//
//  The edit pipeline is modelled as a flat list of `Segment`s — each
//  maps a source time range to an output duration:
//
//      trim window → freeze insertion → speed / speed-curve → reverse
//
//  Rendering the segment list into an `AVMutableComposition` is then
//  uniform regardless of which edits were authored:
//    - normal segment:  insertTimeRange + scaleTimeRange(output)
//    - freeze segment:  a single-frame source range scaled up to the hold
//                       duration — the decoder holds the frame because the
//                       segment's output duration far exceeds its source.
//    - reverse:         segments are emitted in reverse order. Audio is
//                       dropped when reversing — segment-wise audio
//                       reversal would stutter (each chunk still plays
//                       forward), and the flagship apps mute reversed
//                       clips.
//    - freeze audio:    insertEmptyTimeRange produces a true silence gap.
//

import Foundation
import AVFoundation

/// One slice of the output timeline: which source range it plays and how
/// long it occupies in the output.
struct VideoExportSegment {
  /// Start of the source range (asset time).
  var sourceStart: CMTime
  /// Length of the source range.
  var sourceDuration: CMTime
  /// Length this segment occupies on the output timeline.
  var outputDuration: CMTime
  /// Freeze hold — audio is silent for the segment's output duration.
  var isFreeze: Bool = false
}

enum VideoCompositionBuilder {

  /// Granularity for speed-curve resampling and reverse chunking.
  /// ~1 frame at 30fps — fine enough that per-chunk forward playback is
  /// visually indistinguishable from true frame reversal.
  private static let chunkDuration = CMTime(value: 1, timescale: 30)

  /// Safe frame duration — `minFrameDuration` is `.invalid`/`.zero` on some
  /// containers; freeze segments need a real source range to hold.
  private static func resolvedFrameDuration(_ frameDuration: CMTime) -> CMTime {
    guard frameDuration.isValid, frameDuration > .zero else { return chunkDuration }
    return frameDuration
  }

  // MARK: - Segment pipeline

  /// Build the ordered segment list for the request.
  static func buildSegments(
    request: AnalysedVideoExportRequest,
    sourceDuration: CMTime,
    frameDuration: CMTime
  ) -> [VideoExportSegment] {
    let r = request.request
    let timescale = sourceDuration.timescale

    // 1. Trim window (source-absolute ms → CMTime, clamped to duration).
    let trimStart = CMTime(
      seconds: request.trimStartMs / 1000.0, preferredTimescale: timescale)
    let requestedEnd = request.trimEndMs.isFinite
      ? CMTime(seconds: request.trimEndMs / 1000.0, preferredTimescale: timescale)
      : sourceDuration
    let trimEnd = min(requestedEnd, sourceDuration)
    var segments = [VideoExportSegment(
      sourceStart: trimStart,
      sourceDuration: trimEnd - trimStart,
      outputDuration: trimEnd - trimStart
    )]

    // 2. Freeze insertion — split the window at the freeze point and add a
    //    hold segment referencing a single frame. `freezeFrameMs` is
    //    clip-relative (ms from the trim start), matching the layer schema.
    if request.hasFreeze, let freezeMs = r.freezeFrameMs {
      let freezePoint = trimStart + CMTime(
        seconds: freezeMs / 1000.0, preferredTimescale: timescale)
      let holdDuration = CMTime(
        seconds: (r.freezeDurationMs ?? 0) / 1000.0, preferredTimescale: timescale)
      // Skip-under semantics — mirrors `computeSourceTime` in
      // TimelineProjector.ts: the hold consumes output time while the
      // source window beneath it (holdDuration × effective speed) is
      // skipped, so the clip's total output duration is unchanged.
      let speed = effectiveSpeed(request: request)
      let skipSeconds = (r.freezeDurationMs ?? 0) / 1000.0 * speed
      var withFreeze: [VideoExportSegment] = []
      for segment in segments {
        let segEnd = segment.sourceStart + segment.sourceDuration
        if freezePoint > segment.sourceStart && freezePoint < segEnd {
          let pre = VideoExportSegment(
            sourceStart: segment.sourceStart,
            sourceDuration: freezePoint - segment.sourceStart,
            outputDuration: freezePoint - segment.sourceStart)
          let freeze = VideoExportSegment(
            sourceStart: freezePoint,
            sourceDuration: resolvedFrameDuration(frameDuration),
            outputDuration: holdDuration,
            isFreeze: true)
          withFreeze.append(contentsOf: [pre, freeze])
          let postStart = freezePoint + CMTime(
            seconds: skipSeconds, preferredTimescale: timescale)
          if postStart < segEnd {
            withFreeze.append(VideoExportSegment(
              sourceStart: postStart,
              sourceDuration: segEnd - postStart,
              outputDuration: segEnd - postStart))
          }
        } else {
          withFreeze.append(segment)
        }
      }
      segments = withFreeze
    }

    // 3. Speed — resample each segment into sub-chunks whose output
    //    duration is source/speed. Constant speed collapses to one scale
    //    per segment; a curve samples `sampleSpeed` at each chunk's
    //    midpoint so 'hold'/'smooth' easing is preserved.
    if request.hasSpeedCurve || request.hasConstantSpeed {
      var scaled: [VideoExportSegment] = []
      for segment in segments {
        guard !segment.isFreeze else {
          scaled.append(segment)
          continue
        }
        let windowStart = request.trimStartMs
        let windowLength = max(1.0, (request.trimEndMs.isFinite ? request.trimEndMs : sourceDuration.seconds * 1000) - windowStart)
        var cursor = segment.sourceStart
        let segEnd = segment.sourceStart + segment.sourceDuration
        while cursor < segEnd {
          let chunkLen = min(chunkDuration, segEnd - cursor)
          let speed = speedAt(request: request, sourceTime: cursor, windowStartMs: windowStart, windowLengthMs: windowLength)
          let out = CMTime(seconds: chunkLen.seconds / speed, preferredTimescale: timescale)
          scaled.append(VideoExportSegment(
            sourceStart: cursor, sourceDuration: chunkLen, outputDuration: out))
          cursor = cursor + chunkLen
        }
      }
      segments = scaled
    }

    // 4. Reverse — flip segment order. Each chunk still plays forward
    //    internally; at ~33ms chunks the result is frame-accurate reverse.
    if request.isReversed {
      segments.reverse()
    }

    return segments
  }

  /// Instantaneous speed at a source time, honouring the speed curve's
  /// easing. Positions are normalised across the *trimmed window*, matching
  /// `sampleSpeedAtPosition` in SpeedCurveTypes.ts.
  private static func speedAt(
    request: AnalysedVideoExportRequest,
    sourceTime: CMTime,
    windowStartMs: Double,
    windowLengthMs: Double
  ) -> Double {
    let r = request.request
    guard let curve = r.speedCurve, !curve.points.isEmpty else {
      return r.speed ?? 1.0
    }
    let positionMs = sourceTime.seconds * 1000 - windowStartMs
    let position = min(1, max(0, positionMs / windowLengthMs))
    return curveSpeed(curve: curve, position: position)
  }

  /// Speed at a normalised 0..1 position along the trimmed window —
  /// mirrors `sampleSpeedAtPosition` in SpeedCurveTypes.ts.
  private static func curveSpeed(curve: SpeedCurve, position: Double) -> Double {
    let sorted = curve.points.sorted { $0.position < $1.position }
    guard sorted.count > 1 else { return sorted.first?.speed ?? 1.0 }

    var before = sorted[0]
    var after = sorted[sorted.count - 1]
    for i in 0..<(sorted.count - 1) {
      if position >= sorted[i].position && position <= sorted[i + 1].position {
        before = sorted[i]
        after = sorted[i + 1]
        break
      }
    }
    if curve.easing == .hold { return before.speed }
    let t = (position - before.position) / max(0.001, after.position - before.position)
    if curve.easing == .smooth {
      let s = t * t * (3 - 2 * t)
      return before.speed + (after.speed - before.speed) * s
    }
    return before.speed + (after.speed - before.speed) * t
  }

  /// The clip's effective speed — the constant speed, or the curve's mean
  /// (mirroring `averageSpeed` in SpeedCurveTypes.ts: 100 samples of
  /// `sampleSpeedAtPosition`). Used for the freeze skip-under window.
  private static func effectiveSpeed(request: AnalysedVideoExportRequest) -> Double {
    let r = request.request
    guard let curve = r.speedCurve, !curve.points.isEmpty else {
      return r.speed ?? 1.0
    }
    let samples = 100
    var sum = 0.0
    for i in 0..<samples {
      sum += curveSpeed(curve: curve, position: Double(i) / Double(samples - 1))
    }
    return max(0.01, sum / Double(samples))
  }

  // MARK: - Composition construction

  /// Build an `AVMutableComposition` rendering the segment list.
  /// Returns the composition plus whether a video composition (per-frame
  /// pipeline) is required for the request.
  static func buildComposition(
    asset: AVURLAsset,
    videoTrack: AVAssetTrack,
    audioTrack: AVAssetTrack?,
    segments: [VideoExportSegment],
    request: AnalysedVideoExportRequest
  ) async throws -> AVMutableComposition {
    let composition = AVMutableComposition()
    let includeAudio = audioTrack != nil && !request.isMuted && !request.isReversed

    guard let videoOut = composition.addMutableTrack(
      withMediaType: .video,
      preferredTrackID: kCMPersistentTrackID_Invalid
    ) else {
      throw VideoExportFailure.renderFailed("Failed to allocate video track.")
    }
    let audioOut = includeAudio
      ? composition.addMutableTrack(
          withMediaType: .audio,
          preferredTrackID: kCMPersistentTrackID_Invalid)
      : nil

    var videoCursor = CMTime.zero
    var audioCursor = CMTime.zero
    for segment in segments {
      if segment.isFreeze || request.isReversed {
        // Freeze / reversed chunks: copy the frame range then stretch it
        // to the hold/chunk duration.
        try videoOut.insertTimeRange(
          CMTimeRange(start: segment.sourceStart, duration: segment.sourceDuration),
          of: videoTrack,
          at: videoCursor)
        videoOut.scaleTimeRange(
          CMTimeRange(start: videoCursor, duration: segment.sourceDuration),
          toDuration: segment.outputDuration)
      } else {
        try videoOut.insertTimeRange(
          CMTimeRange(start: segment.sourceStart, duration: segment.sourceDuration),
          of: videoTrack,
          at: videoCursor)
        if segment.outputDuration != segment.sourceDuration {
          videoOut.scaleTimeRange(
            CMTimeRange(start: videoCursor, duration: segment.sourceDuration),
            toDuration: segment.outputDuration)
        }
      }
      videoCursor = videoCursor + segment.outputDuration

      if let audioOut, let audioTrack {
        if segment.isFreeze {
          // True silence for the hold window.
          audioOut.insertEmptyTimeRange(
            CMTimeRange(start: audioCursor, duration: segment.outputDuration))
        } else {
          try audioOut.insertTimeRange(
            CMTimeRange(start: segment.sourceStart, duration: segment.sourceDuration),
            of: audioTrack,
            at: audioCursor)
          if segment.outputDuration != segment.sourceDuration {
            audioOut.scaleTimeRange(
              CMTimeRange(start: audioCursor, duration: segment.sourceDuration),
              toDuration: segment.outputDuration)
          }
        }
        audioCursor = audioCursor + segment.outputDuration
      }
    }

    return composition
  }

  /// Build the `AVMutableVideoComposition` for the compose path — render
  /// size, aspect-fill transform from the source track, 30fps frame
  /// cadence, and the custom overlay compositor when overlays exist.
  static func buildVideoComposition(
    videoTrack: AVAssetTrack,
    composition: AVMutableComposition,
    request: AnalysedVideoExportRequest
  ) async throws -> AVMutableVideoComposition {
    let naturalSize = videoTrack.naturalSize
    let transform = try await videoTrack.load(.preferredTransform)
    let transformedSize = naturalSize.applying(transform)
    let sourceSize = CGSize(
      width: abs(transformedSize.width), height: abs(transformedSize.height))

    // Output size: explicit request wins; otherwise preserve source.
    let renderSize = resolvedOutputSize(request: request.request, sourceSize: sourceSize)

    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = renderSize
    videoComposition.frameDuration = CMTime(value: 1, timescale: 30)

    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = CMTimeRange(start: .zero, duration: composition.duration)

    // The layer instruction must reference the *composition's* video track —
    // the compositor matches frame requests by that trackID, not the source's.
    guard let compositionVideoTrack = composition.tracks(withMediaType: .video).first else {
      throw VideoExportFailure.renderFailed("Composition has no video track.")
    }
    let layerInstruction = AVMutableVideoCompositionLayerInstruction(
      assetTrack: compositionVideoTrack)
    // Aspect-fill: scale source → render size preserving aspect, centred.
    // Matches the canvas's `contentFit: 'cover'` default.
    let fill = aspectFillTransform(
      sourceSize: sourceSize,
      sourceTransform: transform,
      renderSize: renderSize)
    layerInstruction.setTransform(fill, at: .zero)
    instruction.layerInstructions = [layerInstruction]
    videoComposition.instructions = [instruction]

    if request.hasOverlays {
      videoComposition.customVideoCompositorClass = VideoOverlayCompositor.self
    }

    return videoComposition
  }

  /// Fit `sourceSize` into the requested output box. Only one dimension may
  /// be specified — the other is derived from the source aspect ratio.
  private static func resolvedOutputSize(
    request: VideoExportRequest, sourceSize: CGSize
  ) -> CGSize {
    let w = request.outputWidth.map { CGFloat($0) }
    let h = request.outputHeight.map { CGFloat($0) }
    switch (w, h) {
    case let (w?, h?):
      return CGSize(width: w, height: h)
    case let (w?, nil):
      return CGSize(width: w, height: (w * sourceSize.height / sourceSize.width).rounded(.toNearestOrEven))
    case let (nil, h?):
      return CGSize(width: (h * sourceSize.width / sourceSize.height).rounded(.toNearestOrEven), height: h)
    default:
      return sourceSize
    }
  }

  /// Aspect-fill transform: scale the source so it covers `renderSize`,
  /// centred. Combines with the track's preferred transform so rotation is
  /// honoured before the fill.
  private static func aspectFillTransform(
    sourceSize: CGSize,
    sourceTransform: CGAffineTransform,
    renderSize: CGSize
  ) -> CGAffineTransform {
    guard sourceSize.width > 0, sourceSize.height > 0 else {
      return sourceTransform
    }
    let scale = max(renderSize.width / sourceSize.width,
                    renderSize.height / sourceSize.height)
    let scaledSize = CGSize(width: sourceSize.width * scale,
                            height: sourceSize.height * scale)
    let translate = CGAffineTransform(
      translationX: (renderSize.width - scaledSize.width) / 2,
      y: (renderSize.height - scaledSize.height) / 2)
    return sourceTransform
      .concatenating(CGAffineTransform(scaleX: scale, y: scale))
      .concatenating(translate)
  }
}
