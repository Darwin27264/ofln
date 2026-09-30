package com.ofln.tasks

import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Bundle
import androidx.core.app.ServiceCompat
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class TaskHeadlessService : HeadlessJsTaskService() {

    override fun onCreate() {
        super.onCreate()
        startForegroundServiceNotification()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForegroundServiceNotification()
        return super.onStartCommand(intent, flags, startId)
    }

    private fun startForegroundServiceNotification() {
        try {
            val notification = TaskNotificationHelper.buildForegroundNotification(this)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ServiceCompat.startForeground(
                    this,
                    TaskNotificationHelper.FOREGROUND_SERVICE_NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                )
            } else {
                startForeground(
                    TaskNotificationHelper.FOREGROUND_SERVICE_NOTIFICATION_ID,
                    notification
                )
            }
        } catch (e: Exception) {
            android.util.Log.w("TaskHeadlessService", "Failed to start foreground service notification: ${e.message}", e)
        }
    }

    override fun onHeadlessJsTaskFinish(taskId: Int) {
        super.onHeadlessJsTaskFinish(taskId)
        stopForegroundServiceNotification()
    }

    override fun onDestroy() {
        stopForegroundServiceNotification()
        super.onDestroy()
    }

    private fun stopForegroundServiceNotification() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
        } catch (e: Exception) {
            android.util.Log.w("TaskHeadlessService", "Failed to stop foreground service: ${e.message}", e)
        }
    }

    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        val extras = intent?.extras ?: Bundle()
        return HeadlessJsTaskConfig(
            "TaskRunnerHeadless",
            Arguments.fromBundle(extras),
            600_000L, // 10 minutes timeout for model inference
            true      // allowed in foreground
        )
    }
}
