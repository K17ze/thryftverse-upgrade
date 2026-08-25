import ExpoModulesCore
import UIKit
import DeviceCheck
import os.signpost
import MetricKit

// MARK: - Records

public struct DeviceInfo: Record {
  @Field var platform: String = "ios"
  @Field var model: String = ""
  @Field var osVersion: String = ""
}

public struct NativeBuildInfo: Record {
  @Field var buildVersion: String = ""
  @Field var buildTimestamp: String = ""
}

public struct AttestationResult: Record {
  @Field var keyId: String = ""
  @Field var attestation: String = ""
  @Field var challenge: String = ""
}

public struct AssertionResult: Record {
  @Field var assertion: String = ""
  @Field var requestHash: String = ""
}

public struct PerfMetric: Record {
  @Field var surface: String = ""
  @Field var ttffMs: Double = 0
  @Field var ttiMs: Double = 0
  @Field var fidMs: Double = 0
  @Field var fidType: String = ""
  @Field var timestamp: Double = 0
  @Field var sessionId: String = ""
}

public struct LaunchMetrics: Record {
  @Field var coldStartMs: Double = 0
  @Field var warmStartMs: Double = 0
}

public struct MetricKitReportRecord: Record {
  @Field var reportType: String = ""
  @Field var payloadJson: String = ""
  @Field var receivedAt: Double = 0
}

// MARK: - Surface measurement session

private final class SurfaceSession {
  let surface: String
  let sessionId: String
  let startMs: Double
  var firstFrameMs: Double?
  var interactiveMs: Double?
  var cameraPermissionMs: Double?
  var cameraReadyMs: Double?

  init(surface: String, sessionId: String, startMs: Double) {
    self.surface = surface
    self.sessionId = sessionId
    self.startMs = startMs
  }
}

// MARK: - MetricKit subscriber

private final class MetricKitSubscriber: NSObject, MXMetricManagerSubscriber {
  let callback: (MetricKitReportRecord) -> Void

  init(callback: @escaping (MetricKitReportRecord) -> Void) {
    self.callback = callback
  }

  func didReceive(_ reports: [MXMetricReport]) {
    let receivedAt = Date().timeIntervalSince1970 * 1000
    for report in reports {
      let payloadJson: String
      if let data = try? JSONSerialization.data(
        withJSONObject: report.jsonRepresentation(),
        options: []
      ) {
        payloadJson = String(data: data, encoding: .utf8) ?? "{}"
      } else {
        payloadJson = "{}"
      }
      let record = MetricKitReportRecord(
        reportType: String(describing: type(of: report)),
        payloadJson: payloadJson,
        receivedAt: receivedAt
      )
      DispatchQueue.main.async { self.callback(record) }
    }
  }
}

// MARK: - Module

public class ThryftNativeModule: Module {
  private let signpostLog = OSLog(subsystem: "com.thryftverse.app", category: .pointsOfInterest)
  private var sessions: [String: SurfaceSession] = [:]
  private var sessionCounter = 0
  private var metricSubscriber: MetricKitSubscriber?
  private let trustStateKey = "thryft.integrity.trustState"

  public func definition() -> ModuleDefinition {
    Name("ThryftNative")

    Constants {
      [
        "moduleName": "ThryftNative"
      ]
    }

    // ── Device / build info ───────────────────────────────────────────

    AsyncFunction("getDeviceInfo") { () -> DeviceInfo in
      let device = UIDevice.current
      return DeviceInfo(
        platform: "ios",
        model: device.model,
        osVersion: device.systemVersion
      )
    }

    AsyncFunction("getNativeBuildInfo") { () -> NativeBuildInfo in
      let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown"
      let timestamp = ISO8601DateFormatter().string(from: Date())
      return NativeBuildInfo(
        buildVersion: version,
        buildTimestamp: timestamp
      )
    }

    // ── Integrity: App Attest (iOS 14+) ───────────────────────────────

    AsyncFunction("isSupported") { () -> Bool in
      if #available(iOS 14, *) {
        return DCAppAttestService.shared.isSupported
      }
      return false
    }

    AsyncFunction("attest") { (challenge: String, promise: Promise) in
      if #available(iOS 14, *) {
        self.performAttest(challenge: challenge, promise: promise)
      } else {
        promise.reject("UNSUPPORTED", "App Attest requires iOS 14 or later.")
      }
    }

    AsyncFunction("generateAssertion") { (keyId: String, requestHash: String, promise: Promise) in
      if #available(iOS 14, *) {
        self.performAssertion(keyId: keyId, requestHash: requestHash, promise: promise)
      } else {
        promise.reject("UNSUPPORTED", "App Attest requires iOS 14 or later.")
      }
    }

    AsyncFunction("getTrustState") { () -> String in
      return UserDefaults.standard.string(forKey: self.trustStateKey) ?? "unchecked"
    }

    AsyncFunction("setTrustState") { (state: String) in
      UserDefaults.standard.set(state, forKey: self.trustStateKey)
    }

    // Play Integrity is Android-only; return unsupported on iOS.
    AsyncFunction("prepareTokenProvider") {
      // No-op on iOS.
    }

    AsyncFunction("requestIntegrityToken") { (_: String, promise: Promise) in
      promise.reject("UNSUPPORTED", "Play Integrity is not supported on iOS.")
    }

    AsyncFunction("getDeviceIntegrityVerdict") { () -> [String] in
      return []
    }

    // ── Performance: os_signpost ──────────────────────────────────────

    AsyncFunction("beginSignpost") { (name: String, message: String?) in
      if #available(iOS 12, *) {
        // os_signpost requires a StaticString for the interval name; embed
        // the dynamic name + message in the format string so Instruments
        // still shows it per-interval.
        let combined = "\(name)\(message.map { " - \($0)" } ?? "")"
        os_signpost(.begin, log: self.signpostLog, name: "ThryftNative", "%{public}@", combined)
      }
    }

    AsyncFunction("endSignpost") { (name: String, message: String?) in
      if #available(iOS 12, *) {
        let combined = "\(name)\(message.map { " - \($0)" } ?? "")"
        os_signpost(.end, log: self.signpostLog, name: "ThryftNative", "%{public}@", combined)
      }
    }

    // ── Performance: surface measurement ──────────────────────────────

    AsyncFunction("startSurfaceMeasurement") { (surface: String) -> String in
      self.sessionCounter += 1
      let sessionId = "ios-perf-\(self.sessionCounter)"
      let startMs = Date().timeIntervalSince1970 * 1000
      self.sessions[sessionId] = SurfaceSession(surface: surface, sessionId: sessionId, startMs: startMs)
      return sessionId
    }

    AsyncFunction("markFirstFrame") { (sessionId: String) in
      guard let session = self.sessions[sessionId] else { return }
      session.firstFrameMs = Date().timeIntervalSince1970 * 1000
    }

    AsyncFunction("markInteractive") { (sessionId: String) in
      guard let session = self.sessions[sessionId] else { return }
      session.interactiveMs = Date().timeIntervalSince1970 * 1000
    }

    AsyncFunction("getMetrics") { (sessionId: String) -> PerfMetric in
      guard let session = self.sessions[sessionId] else {
        return PerfMetric(
          surface: "", ttffMs: 0, ttiMs: 0, fidMs: 0,
          fidType: "", timestamp: Date().timeIntervalSince1970 * 1000, sessionId: sessionId
        )
      }
      let now = Date().timeIntervalSince1970 * 1000
      let ttff = session.firstFrameMs.map { $0 - session.startMs } ?? 0
      let tti = session.interactiveMs.map { $0 - session.startMs } ?? 0
      return PerfMetric(
        surface: session.surface,
        ttffMs: ttff,
        ttiMs: tti,
        fidMs: 0,
        fidType: "",
        timestamp: now,
        sessionId: sessionId
      )
    }

    AsyncFunction("markCameraPermissionGranted") { (sessionId: String) in
      guard let session = self.sessions[sessionId] else { return }
      session.cameraPermissionMs = Date().timeIntervalSince1970 * 1000
    }

    AsyncFunction("markCameraReady") { (sessionId: String) in
      guard let session = self.sessions[sessionId] else { return }
      session.cameraReadyMs = Date().timeIntervalSince1970 * 1000
    }

    // ── Performance: MetricKit ────────────────────────────────────────

    AsyncFunction("subscribeToMetricReports") { (callback: @escaping (MetricKitReportRecord) -> Void) in
      if #available(iOS 13, *) {
        if let existing = self.metricSubscriber {
          MXMetricManager.shared.remove(existing)
        }
        let subscriber = MetricKitSubscriber(callback: callback)
        self.metricSubscriber = subscriber
        MXMetricManager.shared.add(subscriber)
      }
      // No-op on iOS < 13.
    }

    // ── Performance: launch metrics ───────────────────────────────────

    AsyncFunction("getLaunchMetrics") { () -> LaunchMetrics in
      let processInfo = ProcessInfo.processInfo
      let systemUptime = processInfo.systemUptime
      let coldStartMs = systemUptime * 1000
      return LaunchMetrics(coldStartMs: coldStartMs, warmStartMs: 0)
    }
  }

  // MARK: - App Attest helpers

  @available(iOS 14, *)
  private func performAttest(challenge: String, promise: Promise) {
    let service = DCAppAttestService.shared
    service.generateKey { keyIdResult, keyError in
      if let keyError = keyError {
        promise.reject("ATTEST_ERROR", keyError.localizedDescription)
        return
      }
      guard let keyId = keyIdResult else {
        promise.reject("ATTEST_ERROR", "Failed to generate attestation key.")
        return
      }
      let challengeData = Data(challenge.utf8)
      service.attestKey(keyId, clientDataHash: challengeData) { attestation, attestError in
        if let attestError = attestError {
          promise.reject("ATTEST_ERROR", attestError.localizedDescription)
          return
        }
        let attestationString = attestation?.base64EncodedString() ?? ""
        let result = AttestationResult(
          keyId: keyId,
          attestation: attestationString,
          challenge: challenge
        )
        promise.resolve(result)
      }
    }
  }

  @available(iOS 14, *)
  private func performAssertion(keyId: String, requestHash: String, promise: Promise) {
    let service = DCAppAttestService.shared
    let hashData = Data(requestHash.utf8)
    service.generateAssertion(keyId, clientDataHash: hashData) { assertion, error in
      if let error = error {
        promise.reject("ASSERT_ERROR", error.localizedDescription)
        return
      }
      let assertionString = assertion?.base64EncodedString() ?? ""
      let result = AssertionResult(
        assertion: assertionString,
        requestHash: requestHash
      )
      promise.resolve(result)
    }
  }
}
