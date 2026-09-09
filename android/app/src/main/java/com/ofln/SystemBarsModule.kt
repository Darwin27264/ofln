package com.ofln

import android.graphics.Color
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SystemBarsModule(private val ctx: ReactApplicationContext)
  : ReactContextBaseJavaModule(ctx) {

  override fun getName() = "SystemBars"

  /**
   * Status and nav bars share the opaque shell hex (window / decor / pre-35
   * bar colors) so top and bottom system chrome match and physical edges
   * never show a 1px gap.
   */
  @ReactMethod
  fun setSystemBarColors(statusColor: String, navColor: String, darkIcons: Boolean) {
    val activity = currentActivity ?: return

    activity.runOnUiThread {
      val status = parseBarColor(statusColor)
      val nav = parseBarColor(navColor)
      // Prefer nav, then status — never seal with transparent.
      val fill = when {
        nav != Color.TRANSPARENT -> nav
        status != Color.TRANSPARENT -> status
        else -> return@runOnUiThread
      }
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
