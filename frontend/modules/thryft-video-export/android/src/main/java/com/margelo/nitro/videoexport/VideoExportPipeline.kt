//
//  VideoExportPipeline.kt
//  thryft-video-export
//
//  Media3 Transformer implementation of the export pipeline.
//
//  The edit pipeline is modelled as an ordered list of `Segment`s — the
//  same model as the iOS `VideoCompositionBuilder`:
//
//      trim window → freeze insertion → speed / speed-curve → reverse
//
//  Each segment becomes an `EditedMediaItem` inside an
//  `EditedMediaItemSequence`:
//    - normal chunk:  clipping window + optional SpeedChangeEffect /
//                     SonicAudioProcessor pair
//    - freeze chunk:  a still frame extracted via MediaMetadataRetriever,
//                     fed as an image EditedMediaItem with a fixed
//                     duration — exact hold semantics, audio padded silent
//    - reverse:       segments are emitted in reverse order; the audio
//                     track is dropped (chunked audio reversal would
//                     stutter — each chunk still plays forward)
//
//  The no-edit case bypasses Transformer entirely: `remux` stream-copies
//  the tracks through MediaExtractor + MediaMuxer — no decode/encode,
//  near-instant, matching the flagship behaviour (CapCut/VN passthrough).
//
//  Transformer runs its encode on a background looper internally. This
//  module does NOT claim OS-level background continuation — if the app is
//  killed the export dies with it. Progress + cancel are durable against
//  JS-side teardown (they key off sessionId, not a JS callback).
//

package com.margelo.nitro.videoexport

import android.content.Context
import android.graphics.Bitmap
import android.os.Build
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.audio.SonicAudioProcessor
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.OverlayEffect
import androidx.media3.effect.Presentation
import androidx.media3.effect.SpeedChangeEffect
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import com.google.common.collect.ImmutableList
import java.io.File
import java.io.FileOutputStream
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext

@androidx.annotation.OptIn(UnstableApi::class)
object VideoExportPipeline {

  /** ~1 frame at 30fps — fine enough that per-chunk forward playback is
   *  visually indistinguishable from true frame reversal / curve easing. */
  private const val CHUNK_MS = 33.0

  private const val PROGRESS_POLL_MS = 250L

  /** A slice of the output timeline. */
  data class Segment(
    val sourceStartMs: Double,
    val sourceDurationMs: Double,
    val outputDurationMs: Double,
    val isFreeze: Boolean = false,
  )

  // MARK: - Entry point

  suspend fun export(
    context: Context,
    request: AnalysedVideoExportRequest,
    session: VideoExportSession,
  ): VideoExportResult {
    val outputFile = File(
      context.cacheDir, "thryft-export-${request.request.sessionId}.mp4")
    outputFile.delete()
    session.outputFile = outputFile

    if (session.cancelled.get()) throw VideoExportException.cancelled()

    // Remux needs `MediaExtractor.sampleFlags` (API 26+) for correct sync
    // sample metadata. Below that, take the Transformer path — a re-encode
    // is slower but correct.
    val canRemux = request.path == VideoExportPath.REMUX &&
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
    return if (canRemux) {
      remux(request, session, outputFile)
    } else {
      transform(context, request, session, outputFile)
    }
  }

  // MARK: - Remux (stream copy)

  /**
   * No-edit fast path: copy the video (+ audio unless muted) elementary
   * streams into a fresh MP4 without decoding. Near-instant.
   */
  private fun remux(
    request: AnalysedVideoExportRequest,
    session: VideoExportSession,
    outputFile: File,
  ): VideoExportResult {
    val sourcePath = filePathOf(request.request.sourceUri)
    val extractor = MediaExtractor()
    try {
      try {
        extractor.setDataSource(sourcePath)
      } catch (e: Exception) {
        throw VideoExportException.invalidInput(
          "Source file cannot be opened at '$sourcePath'.")
      }
      val muxer = MediaMuxer(outputFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
      val trackMap = HashMap<Int, Int>()
      var videoTrackIndex = -1
      for (i in 0 until extractor.trackCount) {
        val format = extractor.getTrackFormat(i)
        val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
        val isVideo = mime.startsWith("video/")
        val isAudio = mime.startsWith("audio/")
        if (!isVideo && !(isAudio && !request.isMuted)) continue
        if (isVideo) videoTrackIndex = i
        trackMap[i] = muxer.addTrack(format)
      }
      if (videoTrackIndex < 0) {
        throw VideoExportException.invalidInput("Source asset has no video track.")
      }
      muxer.start()

      val buffer = java.nio.ByteBuffer.allocate(8 * 1024 * 1024)
      val info = android.media.MediaCodec.BufferInfo()
      var totalUs = 0L
      try {
        val format = extractor.getTrackFormat(videoTrackIndex)
        totalUs = format.getLong(MediaFormat.KEY_DURATION)
      } catch (_: Throwable) { /* duration unknown — progress stays nominal */ }

      var wroteAny = false
      for ((srcTrack, dstTrack) in trackMap) {
        extractor.selectTrack(srcTrack)
        while (true) {
          if (session.cancelled.get()) {
            // `stop()` throws when nothing was written — the partial file
            // is deleted either way.
            try { muxer.stop() } catch (_: IllegalStateException) {}
            muxer.release()
            outputFile.delete()
            throw VideoExportException.cancelled()
          }
          val size = extractor.readSampleData(buffer, 0)
          if (size < 0) break
          info.offset = 0
          info.size = size
          info.presentationTimeUs = extractor.sampleTime
          info.flags = extractor.sampleFlags
          muxer.writeSampleData(dstTrack, buffer, info)
          wroteAny = true
          if (totalUs > 0) {
            session.progress = min(0.99, extractor.sampleTime / totalUs.toDouble())
          }
          extractor.advance()
        }
        extractor.unselectTrack(srcTrack)
      }
      try { muxer.stop() } catch (_: IllegalStateException) {
        if (!wroteAny) {
          outputFile.delete()
          throw VideoExportException.invalidInput(
            "Source asset produced no samples — cannot remux.")
        }
      }
      muxer.release()
    } finally {
      extractor.release()
    }
    session.progress = 1.0
    return buildResult(outputFile)
  }

  // MARK: - Transcode / compose (Media3 Transformer)

  private suspend fun transform(
    context: Context,
    request: AnalysedVideoExportRequest,
    session: VideoExportSession,
    outputFile: File,
  ): VideoExportResult {
    val sourceDurationMs = sourceDurationMs(request.request.sourceUri)
    val frameSize = sourceFrameSize(request.request.sourceUri)
    val segments = buildSegments(request, sourceDurationMs)
    val composition = buildComposition(context, request, segments, frameSize)

    if (session.cancelled.get()) throw VideoExportException.cancelled()

    // The poller runs as a sibling coroutine in the ambient scope — when
    // `transform` returns (or is cancelled) the poller is torn down with it,
    // so nothing leaks.
    return coroutineScope {
      val progressHolder = ProgressHolder()
      val poller = launch {
        while (isActive) {
          // `Transformer.getProgress` must run on the transformer's
          // looper — the transformer was built on the main thread, so
          // poll from there.
          withContext(Dispatchers.Main) {
            session.transformer.get()?.let { transformer ->
              if (transformer.getProgress(progressHolder) ==
                  Transformer.PROGRESS_STATE_AVAILABLE) {
                session.progress = max(
                  session.progress, progressHolder.progress / 100.0)
              }
            }
          }
          delay(PROGRESS_POLL_MS)
        }
      }

      try {
        // Transformer must be driven from a thread with a Looper — the
        // main dispatcher guarantees one.
        withContext(Dispatchers.Main) {
          suspendCancellableCoroutine<VideoExportResult> { continuation ->
            val transformer = Transformer.Builder(context)
              .setListener(object : Transformer.Listener {
                override fun onCompleted(c: Composition, result: ExportResult) {
                  session.progress = 1.0
                  continuation.resume(buildResult(outputFile))
                }

                override fun onError(
                  c: Composition,
                  result: ExportResult,
                  exception: ExportException,
                ) {
                  outputFile.delete()
                  continuation.resumeWithException(
                    if (session.cancelled.get()) VideoExportException.cancelled()
                    else VideoExportException.renderFailed(
                      exception.message ?: "Media3 export failed."))
                }
              })
              .build()

            session.transformer.set(transformer)
            transformer.start(composition, outputFile.absolutePath)

            continuation.invokeOnCancellation {
              transformer.cancel()
              outputFile.delete()
            }
          }
        }
      } finally {
        poller.cancel()
      }
    }
  }

  // MARK: - Segment pipeline

  fun buildSegments(
    request: AnalysedVideoExportRequest,
    sourceDurationMs: Double,
  ): List<Segment> {
    val r = request.request
    val trimEnd = min(
      if (request.trimEndMs.isFinite()) request.trimEndMs else sourceDurationMs,
      sourceDurationMs)
    var segments = listOf(
      Segment(request.trimStartMs, trimEnd - request.trimStartMs,
        trimEnd - request.trimStartMs))

    // Freeze insertion — split at the clip-relative freeze point and add a
    // hold segment rendered as a still frame. Skip-under semantics mirror
    // `computeSourceTime` in TimelineProjector.ts: the hold consumes
    // output time while the source window beneath it
    // (holdMs × effective speed) is skipped, so total duration is
    // unchanged.
    if (request.hasFreeze) {
      val freezeMs = r.freezeFrameMs ?: 0.0
      val freezePoint = request.trimStartMs + freezeMs
      val holdMs = r.freezeDurationMs ?: 0.0
      val skipMs = holdMs * effectiveSpeed(request)
      val withFreeze = ArrayList<Segment>()
      for (segment in segments) {
        val segEnd = segment.sourceStartMs + segment.sourceDurationMs
        if (freezePoint > segment.sourceStartMs && freezePoint < segEnd) {
          withFreeze.add(Segment(
            segment.sourceStartMs, freezePoint - segment.sourceStartMs,
            freezePoint - segment.sourceStartMs))
          withFreeze.add(Segment(
            freezePoint, CHUNK_MS, holdMs, isFreeze = true))
          val postStart = freezePoint + skipMs
          if (postStart < segEnd) {
            withFreeze.add(Segment(
              postStart, segEnd - postStart, segEnd - postStart))
          }
        } else {
          withFreeze.add(segment)
        }
      }
      segments = withFreeze
    }

    // Speed — resample into chunks with per-chunk speed. Constant speed
    // collapses to a single chunk per segment; a curve samples the speed
    // at each chunk's clip-relative midpoint.
    if (request.hasSpeedCurve || request.hasConstantSpeed) {
      val windowStart = request.trimStartMs
      val windowLength = max(1.0, trimEnd - windowStart)
      val scaled = ArrayList<Segment>()
      for (segment in segments) {
        if (segment.isFreeze) { scaled.add(segment); continue }
        var cursor = segment.sourceStartMs
        val segEnd = segment.sourceStartMs + segment.sourceDurationMs
        while (cursor < segEnd) {
          val chunkLen = min(CHUNK_MS, segEnd - cursor)
          val speed = speedAt(request, cursor, windowStart, windowLength)
          scaled.add(Segment(cursor, chunkLen, chunkLen / speed))
          cursor += chunkLen
        }
      }
      segments = scaled
    }

    if (request.isReversed) {
      segments = segments.asReversed()
    }
    return segments
  }

  /** Instantaneous speed at a source time, honouring the curve easing —
   *  mirrors `sampleSpeedAtPosition` in SpeedCurveTypes.ts. */
  private fun speedAt(
    request: AnalysedVideoExportRequest,
    sourceTimeMs: Double,
    windowStartMs: Double,
    windowLengthMs: Double,
  ): Double {
    val r = request.request
    val curve = r.speedCurve ?: return r.speed ?: 1.0
    if (curve.points.isEmpty()) return r.speed ?: 1.0
    val position = min(1.0, max(0.0, (sourceTimeMs - windowStartMs) / windowLengthMs))
    return curveSpeed(curve, position)
  }

  /** Speed at a normalised 0..1 position along the trimmed window —
   *  mirrors `sampleSpeedAtPosition` in SpeedCurveTypes.ts. */
  private fun curveSpeed(curve: SpeedCurve, position: Double): Double {
    val sorted = curve.points.sortedBy { it.position }
    if (sorted.size == 1) return sorted[0].speed

    var before = sorted[0]
    var after = sorted[sorted.size - 1]
    for (i in 0 until sorted.size - 1) {
      if (position >= sorted[i].position && position <= sorted[i + 1].position) {
        before = sorted[i]
        after = sorted[i + 1]
        break
      }
    }
    if (curve.easing == SpeedCurveEasing.HOLD) return before.speed
    val t = (position - before.position) / max(0.001, after.position - before.position)
    return when (curve.easing) {
      SpeedCurveEasing.SMOOTH -> {
        val s = t * t * (3 - 2 * t)
        before.speed + (after.speed - before.speed) * s
      }
      else -> before.speed + (after.speed - before.speed) * t
    }
  }

  /** The clip's effective speed — constant speed, or the curve's mean
   *  (mirroring `averageSpeed` in SpeedCurveTypes.ts: 100 samples of
   *  `sampleSpeedAtPosition`). Used for the freeze skip-under window. */
  private fun effectiveSpeed(request: AnalysedVideoExportRequest): Double {
    val r = request.request
    val curve = r.speedCurve
    if (curve == null || curve.points.isEmpty()) return r.speed ?: 1.0
    val samples = 100
    var sum = 0.0
    for (i in 0 until samples) {
      sum += curveSpeed(curve, i.toDouble() / (samples - 1))
    }
    return max(0.01, sum / samples)
  }

  // MARK: - Composition construction

  private fun buildComposition(
    context: Context,
    request: AnalysedVideoExportRequest,
    segments: List<Segment>,
    frameSize: Pair<Int, Int>,
  ): Composition {
    val r = request.request
    val items = ArrayList<EditedMediaItem>()
    val dropAudio = request.isMuted || request.isReversed

    for (segment in segments) {
      val builder: EditedMediaItem.Builder = if (segment.isFreeze) {
        // Freeze hold: extract the frame as a still and feed it as an
        // image item with the hold duration.
        val frameUri = extractFreezeFrame(context, r.sourceUri, segment.sourceStartMs)
        EditedMediaItem.Builder(
          MediaItem.Builder()
            .setUri(frameUri)
            .setImageDurationMs(segment.outputDurationMs.toLong())
            .build())
          .setFrameRate(30)
          .setRemoveAudio(true)
      } else {
        val clipping = MediaItem.ClippingConfiguration.Builder()
          .setStartPositionMs(segment.sourceStartMs.toLong())
          .setEndPositionMs((segment.sourceStartMs + segment.sourceDurationMs).toLong())
          .build()
        EditedMediaItem.Builder(
          MediaItem.Builder()
            .setUri(filePathOf(r.sourceUri))
            .setClippingConfiguration(clipping)
            .build())
          .setRemoveAudio(dropAudio)
      }

      val speed = segment.sourceDurationMs / max(1.0, segment.outputDurationMs)
      if (!segment.isFreeze && abs(speed - 1.0) > 0.001) {
        builder.setEffects(Effects(
          ImmutableList.of<androidx.media3.common.audio.AudioProcessor>(
            audioSpeedProcessor(speed.toFloat())),
          ImmutableList.of<androidx.media3.common.Effect>(
            SpeedChangeEffect(speed.toFloat()))))
      }
      items.add(builder.build())
    }

    // Overlay + resize effects apply at the composition level — they
    // composite onto the concatenated frame stream regardless of which
    // segment produced each frame.
    val compositionEffects = ArrayList<androidx.media3.common.Effect>()
    if (request.hasOverlays) {
      val overlays = VideoOverlayFactory.build(
        context, r.overlays, frameSize.first, frameSize.second)
      if (!overlays.isEmpty()) {
        compositionEffects.add(OverlayEffect(overlays))
      }
    }
    val targetW = r.outputWidth?.toInt()
    val targetH = r.outputHeight?.toInt()
    if (targetW != null || targetH != null) {
      compositionEffects.add(
        Presentation.createForWidthAndHeight(
          targetW ?: frameSize.first,
          targetH ?: frameSize.second,
          Presentation.LAYOUT_SCALE_TO_FIT_WITH_CROP))
    }
    if (compositionEffects.isNotEmpty()) {
      items.replaceAll { item ->
        EditedMediaItem.Builder(item)
          .setEffects(Effects(
            item.effects.audioProcessors,
            ImmutableList.builder<androidx.media3.common.Effect>()
              .addAll(item.effects.videoEffects)
              .addAll(compositionEffects)
              .build()))
          .build()
      }
    }

    val sequenceBuilder = EditedMediaItemSequence.Builder()
    items.forEach { sequenceBuilder.addItem(it) }
    return Composition.Builder(ImmutableList.of(sequenceBuilder.build()))
      .setTransmuxVideo(false)
      .build()
  }

  private fun audioSpeedProcessor(speed: Float): SonicAudioProcessor {
    val processor = SonicAudioProcessor()
    processor.setSpeed(speed)
    return processor
  }

  // MARK: - Media probing + freeze frames

  private fun filePathOf(uri: String): String =
    if (uri.startsWith("file://")) uri.removePrefix("file://") else uri

  private fun retrieverFor(uri: String): MediaMetadataRetriever {
    val retriever = MediaMetadataRetriever()
    try {
      retriever.setDataSource(filePathOf(uri))
    } catch (e: Exception) {
      retriever.release()
      throw VideoExportException.invalidInput(
        "Source file cannot be opened at '${filePathOf(uri)}'.")
    }
    return retriever
  }

  private fun sourceDurationMs(uri: String): Double {
    val retriever = retrieverFor(uri)
    return try {
      retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
        ?.toDouble() ?: 0.0
    } finally {
      retriever.release()
    }
  }

  private fun sourceFrameSize(uri: String): Pair<Int, Int> {
    val retriever = retrieverFor(uri)
    return try {
      val w = retriever.extractMetadata(
        MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toInt() ?: 1080
      val h = retriever.extractMetadata(
        MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toInt() ?: 1920
      val rotation = retriever.extractMetadata(
        MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toInt() ?: 0
      if (rotation == 90 || rotation == 270) Pair(h, w) else Pair(w, h)
    } finally {
      retriever.release()
    }
  }

  /** Extract the frame at `sourceTimeMs` to a temp PNG for the freeze
   *  hold segment. */
  private fun extractFreezeFrame(
    context: Context,
    sourceUri: String,
    sourceTimeMs: Double,
  ): Uri {
    val retriever = retrieverFor(sourceUri)
    try {
      val bitmap = retriever.getFrameAtTime(
        (sourceTimeMs * 1000).toLong(),
        MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
        ?: throw VideoExportException.renderFailed(
          "Could not decode a frame at ${sourceTimeMs}ms for the freeze hold.")
      val file = File(context.cacheDir, "thryft-freeze-${sourceTimeMs.toLong()}.png")
      FileOutputStream(file).use { out ->
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
      }
      bitmap.recycle()
      return Uri.fromFile(file)
    } finally {
      retriever.release()
    }
  }

  private fun buildResult(outputFile: File): VideoExportResult {
    val retriever = MediaMetadataRetriever()
    val (width, height, durationMs) = try {
      retriever.setDataSource(outputFile.absolutePath)
      val w = retriever.extractMetadata(
        MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toDouble() ?: 0.0
      val h = retriever.extractMetadata(
        MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toDouble() ?: 0.0
      val d = retriever.extractMetadata(
        MediaMetadataRetriever.METADATA_KEY_DURATION)?.toDouble() ?: 0.0
      Triple(w, h, d)
    } finally {
      retriever.release()
    }
    return VideoExportResult(
      uri = "file://${outputFile.absolutePath}",
      width = width,
      height = height,
      durationMs = durationMs,
      sizeBytes = outputFile.length().toDouble(),
      mimeType = "video/mp4",
    )
  }
}
