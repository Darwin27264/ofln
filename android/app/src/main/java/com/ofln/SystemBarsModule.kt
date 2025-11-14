package com.ofln

import android.graphics.Color
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SystemBarsModule(private val ctx: ReactApplicationContext)
  : ReactContextBaseJavaModule(ctx) {

  override fun getName() = "SystemBars"

  @ReactMethod
  fun setSystemBarColors(statusColor: String, navColor: String, darkIcons: Boolean) {
    val activity = currentActivity ?: return

    activity.runOnUiThread {
      val window = activity.window
      // Apply colors
      window.statusBarColor = parseColorSafe(statusColor)
      window.navigationBarColor = parseColorSafe(navColor)

      // Control icon brightness
      val controller = WindowCompat.getInsetsController(window, window.decorView)
      // darkIcons = true  -> dark glyphs on light background
      // darkIcons = false -> light glyphs on dark background
      controller.isAppearanceLightStatusBars = darkIcons
      controller.isAppearanceLightNavigationBars = darkIcons
    }
  }

  private fun parseColorSafe(hex: String): Int =
    try { Color.parseColor(hex) } catch (_: Throwable) { Color.BLACK }
}

