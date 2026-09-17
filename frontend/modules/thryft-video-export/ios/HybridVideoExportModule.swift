//
//  HybridVideoExportModule.swift
//  thryft-video-export
//
//  AVFoundation implementation of the `VideoExportModule` HybridObject.
//  Registered under the Nitro name "VideoExportModule" via the generated
//  `ThryftVideoExportAutolinking.swift` — `getVideoExportModule()` on the
//  JS side resolves this instance.
//
//  Execution paths (see VideoExportRequestAnalysis.swift):
//    remux     → AVAssetExportSession(passthrough)
//    transcode → AVMutableComposition + AVAssetExportSession(preset)
//    compose   → AVMutableComposition + AVMutableVideoComposition +
//                VideoOverlayCompositor + AVAssetExportSession
//
//  Serialisation: `exportVideo` calls are serialised on `exportQueue`.
//  The overlay compositor stages its overlays on a class-level slot
//  (AVFoundation instantiates the compositor class itself — there is no
//  per-request injection point), so concurrent exports would race on
//  that slot. Serial export keeps staging correct and also matches the
//  encoder: VideoToolbox is a shared resource, parallel exports would
//  contend rather than speed up.
//

import Foundation
import AVFoundation
import NitroModules

class HybridVideoExportModule: HybridVideoExportModuleSpec {

  private let registry = VideoExportSessionRegistry()

  /// Serial queue — one export at a time. See the file header for why.
  private let exportQueue = DispatchQueue(
    label: "com.thryftverse.videoexport.pipeline", qos: .userInitiated)

  // MARK: - HybridVideoExportModuleSpec

  func isAvailable() throws -> Bool {
    // AVFoundation export is always present on iOS — availability gates on
    // the module being *linked*, which `isVideoExportAvailable()` on the JS
    // side already checks via `NitroModules.hasHybridObject`.
    true
  }

  func exportVideo(request: VideoExportRequest) throws -> Promise<VideoExportResult> {
    return Promise.async {
      // Serialise the pipeline phase-to-phase; the heavy encode itself is
      // async inside AVAssetExportSession, but composition building and
      // overlay staging must not interleave with another export.
      try await withCheckedThrowingContinuation { continuation in
        self.exportQueue.async {
          Task {
            do {
              let result = try await self.performExport(request)
              continuation.resume(returning: result)
            } catch {
              continuation.resume(throwing: error)
            }
          }
        }
      }
    }
  }

  func cancelExport(sessionId: String) throws {
    registry.session(for: sessionId)?.cancel()
  }

  func getExportProgress(sessionId: String) throws -> Double {
    registry.session(for: sessionId)?.progress ?? 0
  }

  // MARK: - Pipeline

  private func performExport(_ request: VideoExportRequest) async throws -> VideoExportResult {
    let analysed = try VideoExportRequestAnalysis.analyse(request)

    let session = VideoExportSession(sessionId: request.sessionId)
    registry.register(session)
    defer {
      registry.unregister(request.sessionId)
      // The compositor slot is class-level — clear it so no overlay set
      // outlives its export.
      VideoOverlayCompositor.stage([])
    }

    guard let sourceURL = resolvedFileURL(request.sourceUri) else {
      throw VideoExportFailure.invalidInput(
        "sourceUri '\(request.sourceUri)' is not a readable local file URI.")
    }
    guard FileManager.default.fileExists(atPath: sourceURL.path) else {
      throw VideoExportFailure.invalidInput(
        "Source file does not exist at '\(sourceURL.path)'.")
    }

    let asset = AVURLAsset(url: sourceURL)
    let tracks = try await asset.load(.tracks)
    guard let videoTrack = tracks.first(where: { $0.mediaType == .video }) else {
      throw VideoExportFailure.invalidInput("Source asset has no video track.")
    }
    let audioTrack = tracks.first(where: { $0.mediaType == .audio })
    let sourceDuration = try await asset.load(.duration)
    let frameDuration = try await videoTrack.load(.minFrameDuration)

    if session.isCancelled { throw VideoExportFailure.cancelled }

    // Output URL — a fresh temp file per session; deleted on cancel/fail.
    let outputURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("thryft-export-\(request.sessionId).mp4")
    try? FileManager.default.removeItem(at: outputURL)
    session.outputURL = outputURL

    let segments = VideoCompositionBuilder.buildSegments(
      request: analysed,
      sourceDuration: sourceDuration,
      frameDuration: frameDuration)

    // Build the exportable asset. Remux uses the asset directly (with an
    // audio-dropped composition when muted); transcode/compose always build
    // a composition.
    let exportAsset: AVAsset
    var videoComposition: AVMutableVideoComposition?

    switch analysed.path {
    case .remux:
      if analysed.isMuted, audioTrack != nil {
        // Drop the audio track without re-encoding video.
        let composition = AVMutableComposition()
        if let videoOut = composition.addMutableTrack(
          withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) {
          try videoOut.insertTimeRange(
            CMTimeRange(start: .zero, duration: sourceDuration),
            of: videoTrack, at: .zero)
        }
        exportAsset = composition
      } else {
        exportAsset = asset
      }

    case .transcode, .compose:
      let composition = try await VideoCompositionBuilder.buildComposition(
        asset: asset,
        videoTrack: videoTrack,
        audioTrack: audioTrack,
        segments: segments,
        request: analysed)
      exportAsset = composition

      if analysed.path == .compose {
        // Stage unconditionally — the compositor slot is class-level, so a
        // compose export without overlays must clear any staged set from a
        // previous export rather than inherit it.
        VideoOverlayCompositor.stage(request.overlays ?? [])
        videoComposition = try await VideoCompositionBuilder.buildVideoComposition(
          videoTrack: videoTrack,
          composition: composition,
          request: analysed)
      }
    }

    if session.isCancelled { throw VideoExportFailure.cancelled }

    let preset = exportPreset(for: analysed)
    guard let exportSession = AVAssetExportSession(
      asset: exportAsset, presetName: preset) else {
      throw VideoExportFailure.unsupported(
        "AVAssetExportSession could not be created with preset '\(preset)'.")
    }
    exportSession.outputURL = outputURL
    exportSession.outputFileType = .mp4
    exportSession.shouldOptimizeForNetworkUse = true
    if let videoComposition {
      exportSession.videoComposition = videoComposition
    }
    session.attach(exportSession)

    try await run(exportSession, session: session, outputURL: outputURL)
    if session.isCancelled { throw VideoExportFailure.cancelled }

    let attributes = try FileManager.default.attributesOfItem(atPath: outputURL.path)
    let sizeBytes = (attributes[.size] as? NSNumber)?.doubleValue ?? 0
    let outputAsset = AVURLAsset(url: outputURL)
    let outputDuration = try await outputAsset.load(.duration)
    let outputTrack = try await outputAsset.load(.tracks)
      .first(where: { $0.mediaType == .video })
    var width = Double(exportSession.videoComposition?.renderSize.width ?? 0)
    var height = Double(exportSession.videoComposition?.renderSize.height ?? 0)
    if width == 0 || height == 0, let outputTrack {
      let natural = try await outputTrack.load(.naturalSize)
      let transform = try await outputTrack.load(.preferredTransform)
      let size = natural.applying(transform)
      width = Double(abs(size.width))
      height = Double(abs(size.height))
    }

    return VideoExportResult(
      uri: outputURL.absoluteString,
      width: width,
      height: height,
      durationMs: outputDuration.seconds * 1000,
      sizeBytes: sizeBytes,
      mimeType: "video/mp4")
  }

  /// Bridge `AVAssetExportSession`'s callback/completion into async/await.
  /// On iOS 18+ uses the async `export(to:as:)` API; earlier releases use
  /// `exportAsynchronously` and inspect terminal status.
  private func run(
    _ exportSession: AVAssetExportSession,
    session: VideoExportSession,
    outputURL: URL
  ) async throws {
    do {
      if #available(iOS 18.0, *) {
        try await exportSession.export(to: outputURL, as: .mp4)
      } else {
        try await withCheckedThrowingContinuation { continuation in
          exportSession.exportAsynchronously {
            switch exportSession.status {
            case .completed:
              continuation.resume()
            case .cancelled:
              continuation.resume(throwing: VideoExportFailure.cancelled)
            default:
              let message = exportSession.error?.localizedDescription
                ?? "Export failed with status \(exportSession.status.rawValue)."
              continuation.resume(
                throwing: VideoExportFailure.renderFailed(message))
            }
          }
        }
      }
    } catch is CancellationError {
      cleanup(outputURL)
      throw VideoExportFailure.cancelled
    } catch let failure as VideoExportFailure {
      cleanup(outputURL)
      throw failure
    } catch {
      cleanup(outputURL)
      // `export(to:as:)` throws AVError.operationInterrupted on cancel —
      // honour the session flag over the raw error text.
      if session.isCancelled { throw VideoExportFailure.cancelled }
      throw VideoExportFailure.renderFailed(error.localizedDescription)
    }
  }

  private func cleanup(_ outputURL: URL) {
    try? FileManager.default.removeItem(at: outputURL)
  }

  /// Pick the export preset. Passthrough for remux; a quality tier for
  /// re-encode paths. `outputBitrateKbps` maps to the nearest preset tier —
  /// `AVAssetExportSession` has no per-bitrate control; a future
  /// reader/writer path can take this further.
  private func exportPreset(for request: AnalysedVideoExportRequest) -> String {
    switch request.path {
    case .remux:
      return AVAssetExportPresetPassthrough
    case .transcode, .compose:
      guard let bitrateKbps = request.request.outputBitrateKbps else {
        return AVAssetExportPresetHighestQuality
      }
      switch bitrateKbps {
      case ..<2000: return AVAssetExportPresetMediumQuality
      case ..<6000: return AVAssetExportPresetHighestQuality
      default: return AVAssetExportPresetHighestQuality
      }
    }
  }

  /// Accept `file://` URIs and bare filesystem paths.
  private func resolvedFileURL(_ uri: String) -> URL? {
    if uri.hasPrefix("file://") { return URL(string: uri) }
    if uri.hasPrefix("/") { return URL(fileURLWithPath: uri) }
    return nil
  }
}
