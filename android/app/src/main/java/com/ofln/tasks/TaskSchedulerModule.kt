package com.ofln.tasks

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.*

class TaskSchedulerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "TaskScheduler"

    private val alarmManager: AlarmManager?
        get() = reactContext.getSystemService(Context.ALARM_SERVICE) as? AlarmManager

    @ReactMethod
    fun scheduleTaskAlarm(taskId: String, triggerAtMillis: Double, promise: Promise) {
        try {
            val manager = alarmManager
            if (manager == null) {
                promise.reject("E_NO_ALARM_MANAGER", "AlarmManager is not available on this device")
                return
            }

            val triggerTime = triggerAtMillis.toLong()
            val intent = Intent(reactContext, TaskAlarmReceiver::class.java).apply {
                putExtra("taskId", taskId)
            }

            val requestCode = taskId.hashCode()
            val pendingIntent = PendingIntent.getBroadcast(
                reactContext,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val canExact = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                manager.canScheduleExactAlarms()
            } else {
                true
            }

            if (canExact) {
                manager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    triggerTime,
                    pendingIntent
                )
            } else {
                manager.setAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    triggerTime,
                    pendingIntent
                )
            }

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_SCHEDULE_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun cancelTaskAlarm(taskId: String, promise: Promise) {
        try {
            val manager = alarmManager ?: run {
                promise.resolve(false)
                return
            }

            val intent = Intent(reactContext, TaskAlarmReceiver::class.java)
            val requestCode = taskId.hashCode()
            val pendingIntent = PendingIntent.getBroadcast(
                reactContext,
                requestCode,
                intent,
                PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
            )

            if (pendingIntent != null) {
                manager.cancel(pendingIntent)
                pendingIntent.cancel()
            }

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_CANCEL_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun canScheduleExactAlarms(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val manager = alarmManager
            promise.resolve(manager?.canScheduleExactAlarms() ?: false)
        } else {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun postNotification(
        title: String,
        message: String,
        taskId: String?,
        runId: String?,
        isSuccess: Boolean,
        promise: Promise
    ) {
        val result = TaskNotificationHelper.sendTaskNotification(
            reactContext,
            title,
            message,
            taskId,
            runId,
            isSuccess
        )
        promise.resolve(result)
    }

    @ReactMethod
    fun checkNotificationPermission(promise: Promise) {
        val granted = TaskNotificationHelper.hasNotificationPermission(reactContext)
        promise.resolve(granted)
    }

    @ReactMethod
    fun requestNotificationPermission(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val activity = currentActivity
            if (activity != null) {
                activity.requestPermissions(
                    arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),
                    9001
                )
                promise.resolve(true)
            } else {
                promise.resolve(false)
            }
        } else {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun getInitialNotification(promise: Promise) {
        val activity = currentActivity
        val intent = activity?.intent
        if (intent != null && intent.hasExtra("openPage") && intent.getStringExtra("openPage") == "taskRunDetail") {
            val map = Arguments.createMap().apply {
                putString("openPage", intent.getStringExtra("openPage"))
                putString("taskId", intent.getStringExtra("taskId"))
                putString("runId", intent.getStringExtra("runId"))
            }
            // Clear extras to avoid re-triggering on future queries
            intent.removeExtra("openPage")
            intent.removeExtra("taskId")
            intent.removeExtra("runId")
            promise.resolve(map)
        } else {
            promise.resolve(null)
        }
    }
}
