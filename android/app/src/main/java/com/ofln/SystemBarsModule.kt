package com.ofln

import android.graphics.Color
import android.os.Build
import android.view.WindowManager
import androidx.core.view.WindowCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SystemBarsModule(private val ctx: ReactApplicationContext)
  : ReactContextBaseJavaModule(ctx) {

  override fun getName() = "SystemBars"

  /**
   * Force transparent status + navigation so RN shell paints edge-to-edge.
   * darkIcons selects glyph contrast for the painted shell underneath.
   */
  @ReactMethod
  fun setSystemBarColors(statusColor: String, navColor: String, darkIcons: Boolean) {
    val activity = currentActivity ?: return

    activity.runOnUiThread {
      val window = activity.window

      WindowCompat.setDecorFitsSystemWindows(window, false)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
        window.clearFlags(
          WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS
            or WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION
        )
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
      }

      // Always fully transparent — solid black/nav colors were the dead strip.
      window.statusBarColor = Color.TRANSPARENT
      window.navigationBarColor = Color.TRANSPARENT
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        window.isNavigationBarContrastEnforced = false
        window.isStatusBarContrastEnforced = false
      }

      val controller = WindowCompat.getInsetsController(window, window.decorView)
      controller.isAppearanceLightStatusBars = darkIcons
      controller.isAppearanceLightNavigationBars = darkIcons
    }
  }
}
