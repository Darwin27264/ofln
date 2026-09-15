package com.ofln

import android.content.res.Configuration
import android.os.Bundle
import androidx.core.content.ContextCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
    // First frame: edge-to-edge with theme shell so status + nav match and
    // physical edges are never a transparent sliver. JS reapplies the live shell/frost hex.
    val night =
      (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
        Configuration.UI_MODE_NIGHT_YES
    SystemBarChrome.apply(
      window,
      ContextCompat.getColor(this, R.color.app_nav_bar),
      darkIcons = !night,
    )
  }

  override fun onNewIntent(intent: android.content.Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
  }

  override fun getMainComponentName(): String = "ofln"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
