//
//  VideoExportSession.swift
//  thryft-video-export
//
//  Per-export session state + a small thread-safe registry. One session per
//  `sessionId` from the JS `VideoExportRequest` — the registry backs the
//  module's `cancelExport` / `getExportProgress` surface.
//
//  Progress: `AVAssetExportSession.progress` is updated by the export
//  session itself on its internal queue, so `getExportProgress` reads it
//  live rather than requiring a separate progress channel. During the
//  pre-export composition phase (decoding/asset loads) the registry keeps
//  the session at a nominal 0.05 so callers see the job as "started".
//

import Foundation
import AVFoundation

final class VideoExportSession {
  let sessionId: String

  /// The live export session — set once the pipeline reaches the encode
  /// phase. `exportSession.progress` is the source of truth for progress.
  var exportSession: AVAssetExportSession?

  /// Nominal progress while composition/asset-loading runs before the
  /// export session exists.
  var pendingProgress: Double = 0.05

  var cancelled = false

  /// URL of the partial output file — deleted on cancel/failure so a
  /// half-written MP4 never leaks into the caller's pipeline.
  var outputURL: URL?

  private let lock = NSLock()

  init(sessionId: String) {
    self.sessionId = sessionId
  }

  var progress: Double {
    lock.lock()
    defer { lock.unlock() }
    if let exportSession {
      return min(1.0, max(0.0, Double(exportSession.progress)))
    }
    return pendingProgress
  }

  var isCancelled: Bool {
    lock.lock()
    defer { lock.unlock() }
    return cancelled
  }

  func attach(_ session: AVAssetExportSession) {
    lock.lock()
    exportSession = session
    lock.unlock()
  }

  func cancel() {
    lock.lock()
    cancelled = true
    let session = exportSession
    lock.unlock()
    // `cancel()` is safe to call before or during export — it aborts the
    // in-flight write and the exportAsynchronously completion fires with
    // status == .cancelled.
    session?.cancelExport()
  }
}

final class VideoExportSessionRegistry {
  private var sessions: [String: VideoExportSession] = [:]
  private let lock = NSLock()

  func register(_ session: VideoExportSession) {
    lock.lock()
    sessions[session.sessionId] = session
    lock.unlock()
  }

  func session(for sessionId: String) -> VideoExportSession? {
    lock.lock()
    defer { lock.unlock() }
    return sessions[sessionId]
  }

  func unregister(_ sessionId: String) {
    lock.lock()
    sessions.removeValue(forKey: sessionId)
    lock.unlock()
  }
}
