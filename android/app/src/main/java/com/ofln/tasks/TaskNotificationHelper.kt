package com.ofln.tasks

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.ofln.MainActivity
import com.ofln.R

object TaskNotificationHelper {

    const val CHANNEL_ID = "ofln_task_channel"
    private const val CHANNEL_NAME = "Task Notifications"
    private const val CHANNEL_DESCRIPTION = "Notifications when scheduled tasks complete or fail"

    fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = CHANNEL_DESCRIPTION
                enableLights(true)
                enableVibration(true)
            }
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            manager?.createNotificationChannel(channel)
        }
    }

    fun hasNotificationPermission(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }

    fun sendTaskNotification(
        context: Context,
        title: String,
        message: String,
        taskId: String?,
        runId: String?,
        isSuccess: Boolean
    ): Boolean {
        if (!hasNotificationPermission(context)) {
            return false
        }

        createNotificationChannel(context)

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("openPage", "taskRunDetail")
            putExtra("taskId", taskId ?: "")
            putExtra("runId", runId ?: "")
        }

        val requestCode = (runId ?: taskId ?: System.currentTimeMillis().toString()).hashCode()
        val pendingIntent = PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setColor(0xFFC9A227.toInt())
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)

        val notificationId = (runId ?: taskId ?: "task_notify").hashCode()

        return try {
            NotificationManagerCompat.from(context).notify(notificationId, builder.build())
            true
        } catch (_: SecurityException) {
            false
        }
    }
}
