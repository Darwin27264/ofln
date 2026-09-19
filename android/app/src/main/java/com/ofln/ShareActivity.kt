package com.ofln

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

/**
 * Translucent overlay activity for Android Share Sheet targets and ACTION_PROCESS_TEXT.
 * Renders the "ShareOverlay" React Native root component directly over the host app.
 */
class ShareActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
    intent?.let { ShareReceiverModule.handleIncomingIntent(it) }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    ShareReceiverModule.handleIncomingIntent(intent)
  }

  override fun getMainComponentName(): String = "ShareOverlay"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
