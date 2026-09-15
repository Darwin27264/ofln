package com.ofln.tasks

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.facebook.react.HeadlessJsTaskService

class TaskBootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action == Intent.ACTION_BOOT_COMPLETED || action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            HeadlessJsTaskService.acquireWakeLockNow(context)

            val serviceIntent = Intent(context, TaskHeadlessService::class.java).apply {
                putExtra("action", "RESCHEDULE_ALL")
                putExtra("trigger", "boot_completed")
            }

            try {
                context.startService(serviceIntent)
            } catch (_: Exception) {
                // Ignore if device power manager denies start
            }
        }
    }
}
