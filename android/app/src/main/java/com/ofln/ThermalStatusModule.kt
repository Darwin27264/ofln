package com.ofln

import android.content.Context
import android.os.Build
import android.os.PowerManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Exposes PowerManager thermal status to JS for inference throttling.
 * Levels: nominal | fair | serious | critical | unknown
 */
class ThermalStatusModule(private val ctx: ReactApplicationContext) :
  ReactContextBaseJavaModule(ctx) {

  override fun getName() = "ThermalStatus"

  @ReactMethod
  fun getThermalState(promise: Promise) {
    try {
      promise.resolve(readState())
    } catch (e: Exception) {
      promise.resolve("unknown")
    }
  }

  private fun readState(): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      return "unknown"
    }
    val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager
      ?: return "unknown"
    return when (pm.currentThermalStatus) {
      PowerManager.THERMAL_STATUS_NONE -> "nominal"
      PowerManager.THERMAL_STATUS_LIGHT -> "fair"
      PowerManager.THERMAL_STATUS_MODERATE -> "fair"
      PowerManager.THERMAL_STATUS_SEVERE -> "serious"
      PowerManager.THERMAL_STATUS_CRITICAL,
      PowerManager.THERMAL_STATUS_EMERGENCY,
      PowerManager.THERMAL_STATUS_SHUTDOWN -> "critical"
      else -> "unknown"
    }
  }
}
