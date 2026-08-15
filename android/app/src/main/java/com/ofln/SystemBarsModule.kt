package com.ofln

import android.graphics.Color
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SystemBarsModule(private val ctx: ReactApplicationContext)
  : ReactContextBaseJavaModule(ctx) {

  override fun getName() = "SystemBars"

  /**
   * Status bar stays transparent (RN shell paints under it).
   * [navColor] is the opaque shell hex used to paint the window / decor /
   * pre-35 nav bar so the physical bottom edge never shows a 1px gap.
   */
  @ReactMethod
  fun setSystemBarColors(statusColor: String, navColor: String, darkIcons: Boolean) {
    val activity = currentActivity ?: return

    activity.runOnUiThread {
      val fill = parseBarColor(navColor)
      // Never seal with transparent — that is the 1px gap we're closing.
      if (fill == Color.TRANSPARENT) return@runOnUiThread
      SystemBarChrome.apply(activity.window, fill, darkIcons)
    }
  }

  private fun parseBarColor(color: String): Int {
    val c = color.trim()
    if (c.isEmpty() || c.equals("transparent", ignoreCase = true)) {
      return Color.TRANSPARENT
    }
    return try {
      Color.parseColor(if (c.startsWith("#")) c else "#$c")
    } catch (_: IllegalArgumentException) {
      Color.TRANSPARENT
    }
  }
}
