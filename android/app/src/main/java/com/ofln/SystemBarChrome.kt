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
 * API 35+ ignores [Window.setNavigationBarColor]; the system bar is always
 * transparent and the app must paint behind it. A 1px sliver at the physical
 * bottom is the window/decor not covering the last pixel — so we paint those
 * surfaces with the shell color instead of leaving them transparent.
 */
object SystemBarChrome {

  fun apply(window: Window, shellColor: Int, darkIcons: Boolean) {
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

    // Status stays transparent so top chrome is full-bleed.
    window.statusBarColor = Color.TRANSPARENT
    // Pre-35: opaque nav matching the shell. API 35+: this is a no-op; the
    // window/decor fill below is what seals the physical bottom edge.
    window.navigationBarColor = shellColor
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      // A transparent divider is a 1px see-through hairline on many OEMs.
      window.navigationBarDividerColor = shellColor
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isNavigationBarContrastEnforced = false
      window.isStatusBarContrastEnforced = false
    }

    window.setBackgroundDrawable(ColorDrawable(shellColor))
    window.decorView.setBackgroundColor(shellColor)

    val content = window.findViewById<View>(android.R.id.content)
    content?.setBackgroundColor(shellColor)
    if (content is ViewGroup) {
      content.clipToPadding = false
      content.setPadding(0, 0, 0, 0)
      if (content.childCount > 0) {
        content.getChildAt(0).setBackgroundColor(shellColor)
      }
    }

    val controller: WindowInsetsControllerCompat =
      WindowCompat.getInsetsController(window, window.decorView)
    controller.isAppearanceLightStatusBars = darkIcons
    controller.isAppearanceLightNavigationBars = darkIcons
  }
}
