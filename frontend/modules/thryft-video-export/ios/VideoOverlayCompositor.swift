//
//  VideoOverlayCompositor.swift
//  thryft-video-export
//
//  Custom `AVVideoCompositing` implementation that burns `VideoOverlay`s
//  (text / sticker bitmaps) into each rendered frame.
//
//  Pipeline per frame:
//    source pixel buffer → CIImage → render to a CGContext-backed buffer →
//    draw overlays in output-frame space → finish.
//
//  We render into a CVPixelBuffer we own (via `newPixelBufferFrom` when the
//  pool provides one, else a CGContext bitmap wrapped in a pixel buffer)
//  and draw overlays with Core Graphics — normalised 0..1 geometry ×
//  renderSize gives the final rect, matching the backend's
//  `layerTopLeft` convention.
//

import Foundation
import AVFoundation
import CoreImage
import CoreGraphics
import UIKit

final class VideoOverlayCompositor: NSObject, AVVideoCompositing {

  /// The overlays for the in-flight export. `AVMutableVideoComposition`
  /// instantiates the compositor class itself (no per-request injection
  /// point), so the active request's overlays are staged here by the
  /// module before the export starts. Exports are serialised per session
  /// in `HybridVideoExportModule`, so a single staging slot is safe.
  static var activeOverlays: [VideoOverlay] = []
  private static let activeOverlaysLock = NSLock()

  static func stage(_ overlays: [VideoOverlay]) {
    activeOverlaysLock.lock()
    activeOverlays = overlays
    activeOverlaysLock.unlock()
  }

  private static func currentOverlays() -> [VideoOverlay] {
    activeOverlaysLock.lock()
    defer { activeOverlaysLock.unlock() }
    return activeOverlays
  }

  private let renderContextQueue = DispatchQueue(
    label: "com.thryftverse.videoexport.compositor", qos: .userInitiated)
  private let renderingQueue = DispatchQueue(
    label: "com.thryftverse.videoexport.compositor.rendering", qos: .userInitiated)

  private var renderContext: AVVideoCompositionRenderContext?
  private let ciContext = CIContext()
  private var cancelled = false

  // Cache decoded sticker images — decoding a PNG per frame would thrash.
  private var stickerImageCache: [String: CGImage] = [:]

  var sourcePixelBufferAttributes: [String: Any]? {
    [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      kCVPixelBufferMetalCompatibilityKey as String: true,
    ]
  }

  var requiredPixelBufferAttributesForRenderContext: [String: Any] {
    [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
    ]
  }

  func renderContextChanged(_ newRenderContext: AVVideoCompositionRenderContext) {
    renderContextQueue.sync {
      renderContext = newRenderContext
    }
  }

  var supportsWideColorSourceFrames: Bool { false }

  func startRequest(_ request: AVAsynchronousVideoCompositionRequest) {
    renderingQueue.async { [self] in
      autoreleasepool {
        if cancelled {
          request.finishCancelledRequest()
          return
        }
        guard let sourceBuffer = request.sourceFrame(byTrackID: request.sourceTrackIDs.first?.int32Value ?? kCMPersistentTrackID_Invalid),
              let context = renderContextQueue.sync(execute: { renderContext }) else {
          request.finish(with: VideoExportFailure.renderFailed("Missing source frame or render context."))
          return
        }

        guard let dstBuffer = context.newPixelBuffer() else {
          request.finish(with: VideoExportFailure.renderFailed("Failed to allocate destination pixel buffer."))
          return
        }

        let renderSize = context.size
        let ciImage = CIImage(cvPixelBuffer: sourceBuffer)

        // Render source frame into the destination buffer, then draw
        // overlays on top with Core Graphics in output pixel space.
        CVPixelBufferLockBaseAddress(dstBuffer, [])
        defer { CVPixelBufferUnlockBaseAddress(dstBuffer, []) }

        guard let baseAddress = CVPixelBufferGetBaseAddress(dstBuffer) else {
          request.finish(with: VideoExportFailure.renderFailed("Destination pixel buffer is not CPU-mappable."))
          return
        }
        let bytesPerRow = CVPixelBufferGetBytesPerRow(dstBuffer)
        guard let cgContext = CGContext(
          data: baseAddress,
          width: Int(renderSize.width),
          height: Int(renderSize.height),
          bitsPerComponent: 8,
          bytesPerRow: bytesPerRow,
          space: CGColorSpaceCreateDeviceRGB(),
          bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue
            | CGBitmapInfo.byteOrder32Little.rawValue
        ) else {
          request.finish(with: VideoExportFailure.renderFailed("Failed to create drawing context."))
          return
        }

        // Draw the decoded frame via CIContext into our CGContext buffer.
        // A raw CGBitmapContext has a bottom-up Quartz coordinate space.
        // Apply the standard UIKit-style flip once so every draw call below
        // (CGImage, sticker bitmap, attributed text) uses top-down
        // coordinates matching the document model's top-left origin.
        cgContext.translateBy(x: 0, y: renderSize.height)
        cgContext.scaleBy(x: 1, y: -1)

        let cgImage = ciContext.createCGImage(
          ciImage, from: CGRect(origin: .zero, size: renderSize))
        if let cgImage {
          cgContext.draw(cgImage, in: CGRect(origin: .zero, size: renderSize))
        }

        drawOverlays(in: cgContext, renderSize: renderSize)

        request.finish(withComposedVideoFrame: dstBuffer)
      }
    }
  }

  func cancelAllPendingVideoCompositionRequests() {
    renderingQueue.sync {
      cancelled = true
    }
  }

  // MARK: - Overlay drawing

  private func drawOverlays(in context: CGContext, renderSize: CGSize) {
    for overlay in Self.currentOverlays() {
      switch overlay {
      case .first(let text):
        drawTextOverlay(text, in: context, renderSize: renderSize)
      case .second(let sticker):
        drawStickerOverlay(sticker, in: context, renderSize: renderSize)
      }
    }
  }

  private func overlayRect(
    x: Double, y: Double, width: Double, height: Double, renderSize: CGSize
  ) -> CGRect {
    // Normalised 0..1 → output pixels. The context is UIKit-flipped, so
    // the document model's top-left origin maps directly.
    CGRect(
      x: x * renderSize.width,
      y: y * renderSize.height,
      width: width * renderSize.width,
      height: height * renderSize.height)
  }

  private func drawTextOverlay(
    _ overlay: VideoTextOverlay, in context: CGContext, renderSize: CGSize
  ) {
    let rect = overlayRect(
      x: overlay.x, y: overlay.y,
      width: overlay.width, height: overlay.height,
      renderSize: renderSize)

    context.saveGState()
    defer { context.restoreGState() }

    context.setAlpha(CGFloat(overlay.opacity))
    // Rotate around the overlay centre. The context is UIKit-flipped, so
    // positive degrees are clockwise on screen — matching the canvas's
    // `transform: rotate(deg)` convention.
    let centre = CGPoint(x: rect.midX, y: rect.midY)
    context.translateBy(x: centre.x, y: centre.y)
    context.rotate(by: CGFloat(overlay.rotationDeg) * .pi / 180)
    context.translateBy(x: -centre.x, y: -centre.y)

    if let bgHex = overlay.backgroundColor, let bg = UIColor(hex: bgHex) {
      context.setFillColor(bg.cgColor)
      context.fill(rect)
    }

    let paragraph = NSMutableParagraphStyle()
    switch overlay.alignment {
    case .left: paragraph.alignment = .left
    case .right: paragraph.alignment = .right
    default: paragraph.alignment = .center
    }
    let attributes: [NSAttributedString.Key: Any] = [
      .font: UIFont.systemFont(ofSize: CGFloat(overlay.fontSize), weight: .semibold),
      .foregroundColor: UIColor(hex: overlay.textColor) ?? .white,
      .paragraphStyle: paragraph,
    ]
    let attributed = NSAttributedString(string: overlay.text, attributes: attributes)
    attributed.draw(in: rect)
  }

  private func drawStickerOverlay(
    _ overlay: VideoStickerOverlay, in context: CGContext, renderSize: CGSize
  ) {
    guard let image = stickerImage(for: overlay) else { return }
    let rect = overlayRect(
      x: overlay.x, y: overlay.y,
      width: overlay.width, height: overlay.height,
      renderSize: renderSize)

    context.saveGState()
    defer { context.restoreGState() }

    context.setAlpha(CGFloat(overlay.opacity))
    let centre = CGPoint(x: rect.midX, y: rect.midY)
    context.translateBy(x: centre.x, y: centre.y)
    context.rotate(by: CGFloat(overlay.rotationDeg) * .pi / 180)
    context.translateBy(x: -centre.x, y: -centre.y)

    context.draw(image, in: rect)
  }

  /// Decode (once) the sticker's pre-rasterised PNG. SVG-only stickers are
  /// rejected at request validation, so this only ever loads a file URI.
  private func stickerImage(for overlay: VideoStickerOverlay) -> CGImage? {
    if let cached = stickerImageCache[overlay.id] { return cached }
    guard let uri = overlay.stickerImageUri, !uri.isEmpty else { return nil }
    let path = uri.hasPrefix("file://") ? String(uri.dropFirst(7)) : uri
    guard let image = UIImage(contentsOfFile: path)?.cgImage else { return nil }
    stickerImageCache[overlay.id] = image
    return image
  }
}

// MARK: - Hex colour parsing

private extension UIColor {
  convenience init?(hex: String) {
    var value = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if value.hasPrefix("#") { value.removeFirst() }
    var rgba: UInt64 = 0
    guard Scanner(string: value).scanHexInt64(&rgba) else { return nil }
    switch value.count {
    case 6:
      self.init(red: CGFloat((rgba >> 16) & 0xFF) / 255,
                green: CGFloat((rgba >> 8) & 0xFF) / 255,
                blue: CGFloat(rgba & 0xFF) / 255, alpha: 1)
    case 8:
      self.init(red: CGFloat((rgba >> 24) & 0xFF) / 255,
                green: CGFloat((rgba >> 16) & 0xFF) / 255,
                blue: CGFloat((rgba >> 8) & 0xFF) / 255,
                alpha: CGFloat(rgba & 0xFF) / 255)
    default:
      return nil
    }
  }
}
