package expo.modules.thryftnative

import android.content.Context
import android.os.Build
import android.os.Process
import android.os.SystemClock
import android.os.Trace
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

// ── Records ───────────────────────────────────────────────────────────

data class DeviceInfo(
  @Field val platform: String = "android",
  @Field val model: String = "",
  @Field val osVersion: String = ""
)

data class NativeBuildInfo(
  @Field val buildVersion: String = "",
  @Field val buildTimestamp: String = ""
)

data class AttestationResult(
  @Field val keyId: String = "",
  @Field val attestation: String = "",
  @Field val challenge: String = ""
)

data class AssertionResult(
  @Field val assertion: String = "",
  @Field val requestHash: String = ""
)

data class PerfMetric(
  @Field val surface: String = "",
  @Field val ttffMs: Double = 0.0,
  @Field val ttiMs: Double = 0.0,
  @Field val fidMs: Double = 0.0,
  @Field val fidType: String = "",
  @Field val timestamp: Double = 0.0,
  @Field val sessionId: String = ""
)

data class LaunchMetrics(
  @Field val coldStartMs: Double = 0.0,
  @Field val warmStartMs: Double = 0.0
)

data class MetricKitReportRecord(
  @Field val reportType: String = "",
  @Field val payloadJson: String = "",
  @Field val receivedAt: Double = 0.0
)

// ── Surface measurement session ───────────────────────────────────────

private data class SurfaceSession(
  val surface: String,
  val sessionId: String,
  val startMs: Double,
  var firstFrameMs: Double? = null,
  var interactiveMs: Double? = null,
  var cameraPermissionMs: Double? = null,
  var cameraReadyMs: Double? = null
)

// ── Module ────────────────────────────────────────────────────────────

class ThryftNativeModule : Module() {
  private val sessions = ConcurrentHashMap<String, SurfaceSession>()
  private var sessionCounter = 0
  private val trustStateKey = "thryft.integrity.trustState"

  private val prefs by lazy {
    appContext.reactContext?.getSharedPreferences("thryft_native", Context.MODE_PRIVATE)
  }

  override fun definition() = ModuleDefinition {
    Name("ThryftNative")

    Constants {
      mapOf(
        "moduleName" to "ThryftNative"
      )
    }

    // ── Device / build info ───────────────────────────────────────────

    AsyncFunction("getDeviceInfo") {
      DeviceInfo(
        platform = "android",
        model = Build.MODEL ?: "unknown",
        osVersion = Build.VERSION.RELEASE ?: "unknown"
      )
    }

    AsyncFunction("getNativeBuildInfo") {
      val packageInfo = try {
        val pkgName = appContext.reactContext?.packageName ?: ""
        appContext.reactContext?.packageManager?.getPackageInfo(
          pkgName,
          0
        )
      } catch (_: Throwable) {
        null
      }
      NativeBuildInfo(
        buildVersion = packageInfo?.versionName ?: "unknown",
        buildTimestamp = System.currentTimeMillis().toString()
      )
    }

    // ── Integrity: Play Integrity ─────────────────────────────────────

    AsyncFunction("isSupported") {
      // Play Integrity requires the Google Play Store + Play services.
      // We check availability at call time; if the IntegrityManager cannot
      // be created, the device does not support it.
      isPlayIntegrityAvailable()
    }

    AsyncFunction("prepareTokenProvider") { promise: Promise ->
      prepareIntegrityProvider(promise)
    }

    AsyncFunction("requestIntegrityToken") { requestHash: String, promise: Promise ->
      requestIntegrityToken(requestHash, promise)
    }

    AsyncFunction("getDeviceIntegrityVerdict") {
      // Decoding the integrity token requires server-side verification via
      // the Google Play Integrity API. On-device we return the cached
      // device-integrity signals if available, otherwise an empty list.
      prefs?.getString("thryft.integrity.deviceSignals", null)
        ?.split(",")?.filter { it.isNotBlank() } ?: emptyList<String>()
    }

    // App Attest is iOS-only; return unsupported on Android.
    AsyncFunction("attest") { _: String, promise: Promise ->
      promise.reject("UNSUPPORTED", "App Attest is not supported on Android.", null)
    }

    AsyncFunction("generateAssertion") { _: String, _: String, promise: Promise ->
      promise.reject("UNSUPPORTED", "App Attest is not supported on Android.", null)
    }

    AsyncFunction("getTrustState") {
      prefs?.getString(trustStateKey, null) ?: "unchecked"
    }

    AsyncFunction("setTrustState") { state: String ->
      prefs?.edit()?.putString(trustStateKey, state)?.apply()
    }

    // ── Performance: Trace ────────────────────────────────────────────

    AsyncFunction("beginSignpost") { name: String, message: String? ->
      // android.os.Trace.beginSection accepts a String name (API 18+).
      // The message is not supported by Trace; we ignore it to avoid
      // allocating a synthetic section name that would fragment systrace.
      Trace.beginSection(name)
    }

    AsyncFunction("endSignpost") { _: String, _: String? ->
      Trace.endSection()
    }

    // ── Performance: surface measurement ──────────────────────────────

    AsyncFunction("startSurfaceMeasurement") { surface: String ->
      sessionCounter += 1
      val sessionId = "android-perf-$sessionCounter"
      val startMs = SystemClock.elapsedRealtime().toDouble()
      sessions[sessionId] = SurfaceSession(
        surface = surface,
        sessionId = sessionId,
        startMs = startMs
      )
      sessionId
    }

    AsyncFunction("markFirstFrame") { sessionId: String ->
      sessions[sessionId]?.firstFrameMs = SystemClock.elapsedRealtime().toDouble()
    }

    AsyncFunction("markInteractive") { sessionId: String ->
      sessions[sessionId]?.interactiveMs = SystemClock.elapsedRealtime().toDouble()
    }

    AsyncFunction("getMetrics") { sessionId: String ->
      val session = sessions[sessionId]
      if (session == null) {
        PerfMetric(
          surface = "",
          ttffMs = 0.0,
          ttiMs = 0.0,
          fidMs = 0.0,
          fidType = "",
          timestamp = System.currentTimeMillis().toDouble(),
          sessionId = sessionId
        )
      } else {
        val now = SystemClock.elapsedRealtime().toDouble()
        val ttff = session.firstFrameMs?.minus(session.startMs) ?: 0.0
        val tti = session.interactiveMs?.minus(session.startMs) ?: 0.0
        PerfMetric(
          surface = session.surface,
          ttffMs = ttff,
          ttiMs = tti,
          fidMs = 0.0,
          fidType = "",
          timestamp = now,
          sessionId = sessionId
        )
      }
    }

    AsyncFunction("markCameraPermissionGranted") { sessionId: String ->
      sessions[sessionId]?.cameraPermissionMs = SystemClock.elapsedRealtime().toDouble()
    }

    AsyncFunction("markCameraReady") { sessionId: String ->
      sessions[sessionId]?.cameraReadyMs = SystemClock.elapsedRealtime().toDouble()
    }

    // ── Performance: MetricKit (iOS-only) ─────────────────────────────

    AsyncFunction("subscribeToMetricReports") {
      // MetricKit is iOS-only; no-op on Android.
    }

    // ── Performance: launch metrics ───────────────────────────────────

    AsyncFunction("getLaunchMetrics") {
      // Process.getStartElapsedRealtime() (API 24+) gives the elapsed
      // realtime at which the process was started. Combined with the
      // current elapsed realtime, this yields a native cold-start duration.
      val startElapsed = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Process.getStartElapsedRealtime().toDouble()
      } else {
        0.0
      }
      val now = SystemClock.elapsedRealtime().toDouble()
      val coldStartMs = if (startElapsed > 0) now - startElapsed else 0.0
      LaunchMetrics(
        coldStartMs = coldStartMs,
        warmStartMs = 0.0
      )
    }
  }

  // ── Play Integrity helpers ───────────────────────────────────────────

  private fun isPlayIntegrityAvailable(): Boolean {
    val context = appContext.reactContext ?: return false
    return try {
      // The IntegrityManager factory is part of com.google.android.play:integrity.
      // If the dependency is absent at runtime (e.g. a device without Play
      // services), this will throw and we return false.
      val manager = createIntegrityManager(context)
      manager != null
    } catch (_: Throwable) {
      false
    }
  }

  private fun createIntegrityManager(context: Context): Any? {
    // Reflectively load the IntegrityManagerFactory to avoid a hard
    // compile-time dependency when the Play Integrity AAR is not on the
    // classpath (e.g. local dev builds without the dependency). When the
    // AAR is present, this resolves the factory and returns a manager.
    return try {
      val factoryClass = Class.forName("com.google.android.play.core.integrity.IntegrityManagerFactory")
      val createContextMethod = factoryClass.getMethod("create", Context::class.java)
      createContextMethod.invoke(null, context)
    } catch (_: Throwable) {
      null
    }
  }

  private fun prepareIntegrityProvider(promise: Promise) {
    val context = appContext.reactContext
    if (context == null) {
      promise.reject("UNSUPPORTED", "No React context available.", null)
      return
    }
    try {
      // Play Integrity does not require an explicit "prepare" step in the
      // current API; the token request itself warms the provider. We
      // resolve immediately so the caller can proceed.
      if (!isPlayIntegrityAvailable()) {
        promise.reject("UNSUPPORTED", "Play Integrity is not available on this device.", null)
        return
      }
      promise.resolve(Unit)
    } catch (e: Throwable) {
      promise.reject("INTEGRITY_ERROR", e.message ?: "Failed to prepare Play Integrity.", null)
    }
  }

  private fun requestIntegrityToken(requestHash: String, promise: Promise) {
    val context = appContext.reactContext
    if (context == null) {
      promise.reject("UNSUPPORTED", "No React context available.", null)
      return
    }
    try {
      val manager = createIntegrityManager(context)
      if (manager == null) {
        promise.reject("UNSUPPORTED", "Play Integrity is not available on this device.", null)
        return
      }
      // Build the IntegrityTokenRequest via reflection so the module
      // compiles without a hard dependency on the Play Integrity AAR.
      val requestBuilderClass = Class.forName("com.google.android.play.core.integrity.IntegrityTokenRequest\$Builder")
      val builder = requestBuilderClass.getConstructor().newInstance()
      val setNonceMethod = requestBuilderClass.getMethod("setNonce", String::class.java)
      setNonceMethod.invoke(builder, requestHash)
      val setCloudProjectNumberMethod = requestBuilderClass.getMethod("setCloudProjectNumber", Long::class.javaPrimitiveType)
      // Cloud project number is read from the app's metadata; fall back to 0
      // which signals "use default". A real deployment sets this in gradle.
      val cloudProjectNumber = readCloudProjectNumber(context)
      setCloudProjectNumberMethod.invoke(builder, cloudProjectNumber)
      val buildMethod = requestBuilderClass.getMethod("build")
      val request = buildMethod.invoke(builder)

      val managerClass = Class.forName("com.google.android.play.core.integrity.IntegrityManager")
      val requestTokenMethod = managerClass.getMethod("requestIntegrityToken", request.javaClass)
      val task = requestTokenMethod.invoke(manager, request)

      // The returned Task is a com.google.android.play.core.tasks.Task<String>.
      // We add success/failure listeners via reflection.
      val taskClass = task.javaClass
      val addOnSuccessListener = taskClass.getMethod("addOnSuccessListener", Class.forName("com.google.android.play.core.tasks.OnSuccessListener"))
      val addOnFailureListener = taskClass.getMethod("addOnFailureListener", Class.forName("com.google.android.play.core.tasks.OnFailureListener"))

      val successListener = java.lang.reflect.Proxy.newProxyInstance(
        context.classLoader,
        arrayOf(Class.forName("com.google.android.play.core.tasks.OnSuccessListener"))
      ) { _, _, args ->
        val token = args?.firstOrNull()?.toString() ?: ""
        promise.resolve(token)
        null
      }
      val failureListener = java.lang.reflect.Proxy.newProxyInstance(
        context.classLoader,
        arrayOf(Class.forName("com.google.android.play.core.tasks.OnFailureListener"))
      ) { _, _, args ->
        val err = args?.firstOrNull()
        promise.reject("INTEGRITY_ERROR", err?.toString() ?: "Play Integrity token request failed.", null)
        null
      }
      addOnSuccessListener.invoke(task, successListener)
      addOnFailureListener.invoke(task, failureListener)
    } catch (e: ClassNotFoundException) {
      promise.reject("UNSUPPORTED", "Play Integrity is not available on this device.", null)
    } catch (e: Throwable) {
      promise.reject("INTEGRITY_ERROR", e.message ?: "Failed to request Play Integrity token.", null)
    }
  }

  private fun readCloudProjectNumber(context: Context): Long {
    return try {
      val meta = context.packageManager.getApplicationInfo(context.packageName, android.content.pm.PackageManager.GET_META_DATA)
      meta.metaData?.getLong("com.google.android.play.integrity.cloud_project_number", 0L) ?: 0L
    } catch (_: Throwable) {
      0L
    }
  }

  companion object {
    private const val TAG = "ThryftNativeModule"
  }
}
