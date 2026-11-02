package com.ofln

import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.view.WindowManager
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * Edge-to-edge chrome that feels native on gesture and 3-button nav.
 *
 * Supports transparent status bar (for history drawer and chat quick panel)
 * while preserving opaque navigation bar shell fills to prevent subpixel edge leaks.
 * API 35+ enforces edge-to-edge and transparent bar colors by default.
 */
object SystemBarChrome {

  /**
   * Apply system bar styling with independent status bar and navigation bar colors.
   */
  fun apply(
    window: Window,
    statusBarColor: Int,
    navBarColor: Int,
    darkIcons: Boolean,
  ) {
    WindowCompat.setDecorFitsSystemWindows(window, false)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      window.clearFlags(
        WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS
          or WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION
      )
      window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      val params = window.attributes
      params.layoutInDisplayCutoutMode =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
          WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
        else
          WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
      window.attributes = params
    }

    // Status bar: transparent (Color.TRANSPARENT) or specific tint
    window.statusBarColor = statusBarColor

    // Navigation bar: opaque shell or transparent
    window.navigationBarColor = navBarColor
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      window.navigationBarDividerColor = navBarColor
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isNavigationBarContrastEnforced = false
      window.isStatusBarContrastEnforced = false
    }

    // Decor & window background fill:
    // When navBar is opaque, use navBarColor so physical nav edge never shows a 1px gap.
    // If navBar is transparent but statusBar is opaque, use statusBarColor.
    val shellFill = when {
      navBarColor != Color.TRANSPARENT -> navBarColor
      statusBarColor != Color.TRANSPARENT -> statusBarColor
      else -> null
    }

    if (shellFill != null) {
      window.setBackgroundDrawable(ColorDrawable(shellFill))
      window.decorView.setBackgroundColor(shellFill)

      val content = window.findViewById<View>(android.R.id.content)
      content?.setBackgroundColor(shellFill)
      if (content is ViewGroup) {
        content.clipToPadding = false
        content.setPadding(0, 0, 0, 0)
        if (content.childCount > 0) {
          content.getChildAt(0).setBackgroundColor(shellFill)
        }
      }
    } else {
      val content = window.findViewById<View>(android.R.id.content)
      if (content is ViewGroup) {
        content.clipToPadding = false
        content.setPadding(0, 0, 0, 0)
      }
    }

    val controller: WindowInsetsControllerCompat =
      WindowCompat.getInsetsController(window, window.decorView)
    // Status bar glyphs: dark (black) if darkIcons is true, light (white) if false
    controller.isAppearanceLightStatusBars = darkIcons

    // Navigation bar glyphs: if opaque nav bar, match nav luminance; otherwise follow darkIcons
    controller.isAppearanceLightNavigationBars = if (navBarColor != Color.TRANSPARENT) {
      isColorLight(navBarColor)
    } else {
      darkIcons
    }
  }

  /**
   * Overload for backward compatibility (e.g. MainActivity.onCreate).
   * Applies the same shellColor to both status bar and navigation bar.
   */
  fun apply(window: Window, shellColor: Int, darkIcons: Boolean) {
    apply(window, shellColor, shellColor, darkIcons)
  }

  /**
   * Returns true if relative luminance > 180 (light color requiring dark icons).
   */
  private fun isColorLight(color: Int): Boolean {
    val r = Color.red(color)
    val g = Color.green(color)
    val b = Color.blue(color)
    val luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return luminance > 180
  }
}
