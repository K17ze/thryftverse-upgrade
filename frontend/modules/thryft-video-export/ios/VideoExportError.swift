//
//  VideoExportError.swift
//  thryft-video-export
//
//  Error type mirroring the JS-side `VideoExportError` discriminated union.
//  `code` maps to the union's `type` field; the JS wrapper
//  (`toVideoExportError` in src/index.ts) parses the message prefix
//  `"{code}:{message}"` back into the union, so the tag must stay in sync.
//

import Foundation

enum VideoExportFailure: Error {
  case cancelled
  case unsupported(String)
  case renderFailed(String)
  case invalidInput(String)

  /// The `type` tag of the JS-side `VideoExportError` union.
  var code: String {
    switch self {
    case .cancelled: return "cancelled"
    case .unsupported: return "unsupported"
    case .renderFailed: return "render_failed"
    case .invalidInput: return "invalid_input"
    }
  }

  /// Message surface to JS. Prefixed with the code so the JS wrapper can
  /// recover the discriminated union without parsing localised strings.
  var bridgedMessage: String {
    switch self {
    case .cancelled:
      return "cancelled: Export was cancelled."
    case .unsupported(let detail):
      return "unsupported: \(detail)"
    case .renderFailed(let detail):
      return "render_failed: \(detail)"
    case .invalidInput(let detail):
      return "invalid_input: \(detail)"
    }
  }
}

extension VideoExportFailure: LocalizedError {
  var errorDescription: String? { bridgedMessage }
}
