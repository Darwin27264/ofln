package com.ofln

import android.graphics.Color
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SystemBarsModule(private val ctx: ReactApplicationContext)
  : ReactContextBaseJavaModule(ctx) {

  override fun getName() = "SystemBars"

  /**
   * Status and navigation bars can be styled independently.
   * Status bar supports Color.TRANSPARENT for edge-to-edge layouts (e.g. history panel,
   * chat quick panel), while navigation bar retains an opaque or custom shell color.
   */
  @ReactMethod
  fun setSystemBarColors(statusColor: String, navColor: String, darkIcons: Boolean) {
    val activity = currentActivity ?: return

    activity.runOnUiThread {
      val status = parseBarColor(statusColor)
      val nav = parseBarColor(navColor)
      SystemBarChrome.apply(activity.window, status, nav, darkIcons)
    }
  }

  private fun parseBarColor(color: String): Int {
    val c = color.trim()
    if (c.isEmpty() || c.equals("transparent", ignoreCase = true)) {
      return Color.TRANSPARENT
    }
    val hex = if (c.startsWith("#")) c.substring(1) else c
    val normalized = when (hex.length) {
      3 -> "#" + hex.map { "$it$it" }.joinToString("")
      4 -> "#" + hex.map { "$it$it" }.joinToString("")
      6 -> "#$hex"
      8 -> "#$hex"
      else -> c
    }
    return try {
      Color.parseColor(if (normalized.startsWith("#")) normalized else "#$normalized")
    } catch (_: IllegalArgumentException) {
      Color.TRANSPARENT
    }
  }
}
