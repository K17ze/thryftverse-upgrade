//
//  VideoOverlayFactory.kt
//  thryft-video-export
//
//  Maps `VideoOverlay`s (normalised 0..1, top-left origin — the document
//  model's `layerTopLeft` convention) onto Media3 `Overlay` objects for
//  `OverlayEffect`.
//
//  Coordinate mapping: Media3 `OverlaySettings.setOverlayFrameAnchor`
//  positions the overlay's *centre* in NDC (-1..1, y-up). The document
//  model carries top-left corners in 0..1 y-down, so the conversion is:
//    anchorX =  (x + w/2) * 2 - 1
//    anchorY = -((y + h/2) * 2 - 1)
//  Size is expressed via `setScale` — the ratio of the overlay's native
//  size to the requested frame fraction is resolved per overlay kind
//  (text via its measured bounds, bitmap via its pixel size).
//

package com.margelo.nitro.videoexport

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.text.Layout
import android.text.SpannableString
import android.text.Spanned
import android.text.style.AbsoluteSizeSpan
import android.text.style.AlignmentSpan
import android.text.style.BackgroundColorSpan
import android.text.style.ForegroundColorSpan
import androidx.media3.effect.BitmapOverlay
import androidx.media3.effect.Overlay
import androidx.media3.effect.OverlaySettings
import androidx.media3.effect.TextOverlay
import com.google.common.collect.ImmutableList
import kotlin.math.abs

object VideoOverlayFactory {

  /** Build the Media3 overlay list for a request's overlay set. */
  fun build(
    context: Context,
    overlays: Array<VideoOverlay>?,
    frameWidth: Int,
    frameHeight: Int,
  ): ImmutableList<Overlay> {
    val list = ImmutableList.builder<Overlay>()
    overlays?.forEach { overlay ->
      overlay.match(
        first = { text -> list.add(textOverlay(text, frameWidth, frameHeight)) },
        second = { sticker ->
          stickerOverlay(context, sticker, frameWidth, frameHeight)?.let { list.add(it) }
        },
      )
    }
    return list.build()
  }

  private fun anchorX(overlay: OverlayGeometry): Float =
    ((overlay.x + overlay.width / 2) * 2 - 1).toFloat()

  private fun anchorY(overlay: OverlayGeometry): Float =
    (-((overlay.y + overlay.height / 2) * 2 - 1)).toFloat()

  private interface OverlayGeometry {
    val x: Double
    val y: Double
    val width: Double
    val height: Double
  }

  private class TextGeometry(val o: VideoTextOverlay) : OverlayGeometry {
    override val x get() = o.x
    override val y get() = o.y
    override val width get() = o.width
    override val height get() = o.height
  }

  private class StickerGeometry(val o: VideoStickerOverlay) : OverlayGeometry {
    override val x get() = o.x
    override val y get() = o.y
    override val width get() = o.width
    override val height get() = o.height
  }

  private fun textOverlay(
    overlay: VideoTextOverlay,
    frameWidth: Int,
    frameHeight: Int,
  ): Overlay {
    val spannable = SpannableString(overlay.text)
    spannable.setSpan(
      ForegroundColorSpan(parseColor(overlay.textColor, Color.WHITE)),
      0, spannable.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    spannable.setSpan(
      AbsoluteSizeSpan(overlay.fontSize.toInt(), true),
      0, spannable.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    overlay.backgroundColor?.let { hex ->
      spannable.setSpan(
        BackgroundColorSpan(parseColor(hex, Color.TRANSPARENT)),
        0, spannable.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }
    val alignment = when (overlay.alignment) {
      VideoTextAlignment.LEFT -> Layout.Alignment.ALIGN_NORMAL
      VideoTextAlignment.RIGHT -> Layout.Alignment.ALIGN_OPPOSITE
      else -> Layout.Alignment.ALIGN_CENTER
    }
    spannable.setSpan(
      AlignmentSpan.Standard(alignment),
      0, spannable.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)

    val geometry = TextGeometry(overlay)
    val settings = OverlaySettings.Builder()
      .setOverlayFrameAnchor(anchorX(geometry), anchorY(geometry))
      .setRotationDegrees(overlay.rotationDeg.toFloat())
      .setAlphaScale(overlay.opacity.toFloat())
      .build()

    // Render the text to a bitmap sized to the overlay box so scaling is
    // exact — `TextOverlay` alone anchors a text run but its box is the
    // text's natural size, not the authored frame fraction.
    val bitmap = renderTextToBitmap(overlay, frameWidth, frameHeight)
    return if (bitmap != null) {
      BitmapOverlay.createStaticBitmapOverlay(bitmap, settings)
    } else {
      TextOverlay.createStaticTextOverlay(spannable, settings)
    }
  }

  /** Rasterise the text (with background) into a bitmap sized to the
   *  overlay's frame box. Falls back to null on allocation failure so the
   *  caller can degrade to `TextOverlay`. */
  private fun renderTextToBitmap(
    overlay: VideoTextOverlay,
    frameWidth: Int,
    frameHeight: Int,
  ): Bitmap? {
    val w = (overlay.width * frameWidth).toInt().coerceAtLeast(1)
    val h = (overlay.height * frameHeight).toInt().coerceAtLeast(1)
    val bitmap = try {
      Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    } catch (_: OutOfMemoryError) {
      return null
    }
    val canvas = Canvas(bitmap)
    overlay.backgroundColor?.let { hex ->
      canvas.drawColor(parseColor(hex, Color.TRANSPARENT))
    }
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = parseColor(overlay.textColor, Color.WHITE)
      textSize = overlay.fontSize.toFloat()
      textAlign = when (overlay.alignment) {
        VideoTextAlignment.LEFT -> Paint.Align.LEFT
        VideoTextAlignment.RIGHT -> Paint.Align.RIGHT
        else -> Paint.Align.CENTER
      }
      isFakeBoldText = true
    }
    val textX = when (overlay.alignment) {
      VideoTextAlignment.LEFT -> 0f
      VideoTextAlignment.RIGHT -> w.toFloat()
      else -> w / 2f
    }
    val bounds = Rect()
    paint.getTextBounds(overlay.text, 0, overlay.text.length, bounds)
    val textY = h / 2f - (paint.descent() + paint.ascent()) / 2f
    canvas.drawText(overlay.text, textX, textY, paint)
    return bitmap
  }

  private fun stickerOverlay(
    context: Context,
    overlay: VideoStickerOverlay,
    frameWidth: Int,
    frameHeight: Int,
  ): Overlay? {
    val uri = overlay.stickerImageUri ?: return null
    val path = if (uri.startsWith("file://")) uri.removePrefix("file://") else uri
    val bitmap = BitmapFactory.decodeFile(path) ?: return null
    val geometry = StickerGeometry(overlay)

    // Scale the bitmap so it fills the authored frame fraction.
    val targetW = (overlay.width * frameWidth).toFloat()
    val targetH = (overlay.height * frameHeight).toFloat()
    val scaleX = if (bitmap.width > 0) targetW / bitmap.width else 1f
    val scaleY = if (bitmap.height > 0) targetH / bitmap.height else 1f

    val settings = OverlaySettings.Builder()
      .setOverlayFrameAnchor(anchorX(geometry), anchorY(geometry))
      .setRotationDegrees(overlay.rotationDeg.toFloat())
      .setAlphaScale(overlay.opacity.toFloat())
      .setScale(scaleX, scaleY)
      .build()
    return BitmapOverlay.createStaticBitmapOverlay(bitmap, settings)
  }

  private fun parseColor(hex: String, fallback: Int): Int {
    return try {
      Color.parseColor(if (hex.startsWith("#")) hex else "#$hex")
    } catch (_: IllegalArgumentException) {
      fallback
    }
  }
}
