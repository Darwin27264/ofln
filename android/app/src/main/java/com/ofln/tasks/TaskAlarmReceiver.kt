package com.ofln.tasks

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.facebook.react.HeadlessJsTaskService

class TaskAlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val taskId = intent.getStringExtra("taskId") ?: return

        // Acquire WakeLock immediately so device does not sleep before service starts
        HeadlessJsTaskService.acquireWakeLockNow(context)

        val serviceIntent = Intent(context, TaskHeadlessService::class.java).apply {
            putExtra("action", "EXECUTE_TASK")
            putExtra("taskId", taskId)
            putExtra("trigger", "scheduled_native")
        }

        try {
            context.startService(serviceIntent)
        } catch (e: Exception) {
            android.util.Log.w("TaskAlarmReceiver", "Could not start TaskHeadlessService: ${e.message}", e)
        }
    }
}
