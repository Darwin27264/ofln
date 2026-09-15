package com.ofln.tasks

import android.content.Intent
import android.os.Bundle
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class TaskHeadlessService : HeadlessJsTaskService() {

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
