package com.ofln

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import android.webkit.MimeTypeMap
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.FileOutputStream

class ShareReceiverModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "ShareReceiverModule"
        private var pendingIntent: Intent? = null
        private var pendingHandoff: WritableMap? = null

        fun handleIncomingIntent(intent: Intent) {
            pendingIntent = intent
        }
    }

    override fun getName(): String = "ShareReceiver"

    private fun getEffectiveIntent(): Intent? {
        return pendingIntent ?: currentActivity?.intent
    }

    @ReactMethod
    fun getSharedPayload(promise: Promise) {
        try {
            val intent = getEffectiveIntent()
            if (intent == null) {
                promise.resolve(null)
                return
            }

            val payload = parseIntentPayload(intent)
            // Once resolved, clear pendingIntent and activity intent so it is not re-processed
            pendingIntent = null
            currentActivity?.intent = null
            promise.resolve(payload)
        } catch (e: Exception) {
            Log.e(TAG, "Error resolving shared payload", e)
            promise.reject("E_SHARE_PARSE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun closeOverlay(promise: Promise) {
        val activity = currentActivity
        if (activity != null) {
            activity.runOnUiThread {
                activity.finish()
                promise.resolve(true)
            }
        } else {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun returnProcessedText(replacementText: String, promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.resolve(false)
            return
        }

        activity.runOnUiThread {
            try {
                val resultIntent = Intent().apply {
                    putExtra(Intent.EXTRA_PROCESS_TEXT, replacementText)
                }
                activity.setResult(Activity.RESULT_OK, resultIntent)
                activity.finish()
                promise.resolve(true)
            } catch (e: Exception) {
                Log.e(TAG, "Error returning processed text", e)
                promise.reject("E_RETURN_TEXT_FAILED", e.message, e)
            }
        }
    }

    @ReactMethod
    fun openInFullApp(prompt: String, initialResponse: String?, chatId: String?, promise: Promise) {
        try {
            val activity = currentActivity
            val context = reactApplicationContext

            val handoffMap = Arguments.createMap().apply {
                putString("sharedPrompt", prompt)
                if (!initialResponse.isNullOrBlank()) {
                    putString("sharedResponse", initialResponse)
                }
                if (!chatId.isNullOrBlank()) {
                    putString("sharedChatId", chatId)
                }
            }
            pendingHandoff = handoffMap

            val intent = Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                putExtra("openPage", "conversation")
                putExtra("sharedPrompt", prompt)
                if (!initialResponse.isNullOrBlank()) {
                    putExtra("sharedResponse", initialResponse)
                }
                if (!chatId.isNullOrBlank()) {
                    putExtra("sharedChatId", chatId)
                }
            }
            context.startActivity(intent)

            // Finish the overlay activity if running
            activity?.runOnUiThread {
                activity.finish()
            }

            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error opening main app", e)
            promise.reject("E_OPEN_APP_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun getFullAppHandoff(promise: Promise) {
        if (pendingHandoff != null) {
            val map = pendingHandoff
            pendingHandoff = null
            currentActivity?.intent?.let {
                it.removeExtra("sharedPrompt")
                it.removeExtra("sharedResponse")
                it.removeExtra("sharedChatId")
            }
            promise.resolve(map)
            return
        }

        val activity = currentActivity
        val intent = activity?.intent
        if (intent != null && intent.hasExtra("sharedPrompt")) {
            val map = Arguments.createMap().apply {
                putString("sharedPrompt", intent.getStringExtra("sharedPrompt"))
                putString("sharedResponse", intent.getStringExtra("sharedResponse"))
                putString("sharedChatId", intent.getStringExtra("sharedChatId"))
            }
            intent.removeExtra("sharedPrompt")
            intent.removeExtra("sharedResponse")
            intent.removeExtra("sharedChatId")
            promise.resolve(map)
        } else {
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun publishDirectShareShortcuts(promise: Promise) {
        try {
            val context = reactApplicationContext
            val shortcuts = mutableListOf<ShortcutInfoCompat>()

            val summarizeIntent = Intent(context, ShareActivity::class.java).apply {
                action = Intent.ACTION_SEND
                putExtra("quickAction", "summarize")
            }

            val summarizeShortcut = ShortcutInfoCompat.Builder(context, "ofln_share_summarize")
                .setShortLabel("Summarize")
                .setLongLabel("Summarize with ofln")
                .setIcon(IconCompat.createWithResource(context, R.mipmap.ic_launcher))
                .setIntent(summarizeIntent)
                .setCategories(setOf("com.ofln.category.DIRECT_SHARE_TARGET"))
                .build()
            shortcuts.add(summarizeShortcut)

            val rephraseIntent = Intent(context, ShareActivity::class.java).apply {
                action = Intent.ACTION_SEND
                putExtra("quickAction", "rephrase")
            }

            val rephraseShortcut = ShortcutInfoCompat.Builder(context, "ofln_share_rephrase")
                .setShortLabel("Rephrase")
                .setLongLabel("Rephrase with ofln")
                .setIcon(IconCompat.createWithResource(context, R.mipmap.ic_launcher))
                .setIntent(rephraseIntent)
                .setCategories(setOf("com.ofln.category.DIRECT_SHARE_TARGET"))
                .build()
            shortcuts.add(rephraseShortcut)

            ShortcutManagerCompat.setDynamicShortcuts(context, shortcuts)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to publish direct share shortcuts", e)
            promise.resolve(false)
        }
    }

    private fun parseIntentPayload(intent: Intent): WritableMap? {
        val action = intent.action ?: return null
        val quickAction = intent.getStringExtra("quickAction")

        // 1. ACTION_PROCESS_TEXT (Text selection floating toolbar)
        if (action == Intent.ACTION_PROCESS_TEXT) {
            val text = intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString() ?: ""
            val isReadOnly = intent.getBooleanExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, false)

            return Arguments.createMap().apply {
                putString("action", "PROCESS_TEXT")
                putString("type", detectTextOrLink(text))
                putString("text", text)
                if (detectTextOrLink(text) == "link") {
                    putString("url", text.trim())
                }
                putBoolean("isReadOnly", isReadOnly)
                if (!quickAction.isNullOrBlank()) {
                    putString("quickAction", quickAction)
                }
                putArray("uris", Arguments.createArray())
            }
        }

        // 2. ACTION_SEND
        if (action == Intent.ACTION_SEND) {
            val mimeType = intent.type ?: ""

            // Photos / Images
            if (mimeType.startsWith("image/")) {
                val uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableExtra(Intent.EXTRA_STREAM)
                }

                val cachedUris = Arguments.createArray()
                if (uri != null) {
                    val cachedPath = cacheSharedUri(uri)
                    if (cachedPath != null) {
                        cachedUris.pushString("file://$cachedPath")
                    }
                }

                val extraText = intent.getStringExtra(Intent.EXTRA_TEXT) ?: ""

                return Arguments.createMap().apply {
                    putString("action", "SEND")
                    putString("type", "image")
                    putString("text", extraText)
                    putBoolean("isReadOnly", true)
                    if (!quickAction.isNullOrBlank()) {
                        putString("quickAction", quickAction)
                    }
                    putArray("uris", cachedUris)
                }
            }

            // Text or Link
            val text = intent.getStringExtra(Intent.EXTRA_TEXT) ?: ""
            val type = detectTextOrLink(text)

            return Arguments.createMap().apply {
                putString("action", "SEND")
                putString("type", type)
                putString("text", text)
                if (type == "link") {
                    putString("url", extractUrl(text))
                }
                putBoolean("isReadOnly", true)
                if (!quickAction.isNullOrBlank()) {
                    putString("quickAction", quickAction)
                }
                putArray("uris", Arguments.createArray())
            }
        }

        // 3. ACTION_SEND_MULTIPLE (Multiple photos)
        if (action == Intent.ACTION_SEND_MULTIPLE) {
            val mimeType = intent.type ?: ""
            val cachedUris = Arguments.createArray()

            if (mimeType.startsWith("image/")) {
                val uris = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
                }

                uris?.forEach { u ->
                    val cached = cacheSharedUri(u)
                    if (cached != null) {
                        cachedUris.pushString("file://$cached")
                    }
                }
            }

            return Arguments.createMap().apply {
                putString("action", "SEND_MULTIPLE")
                putString("type", "multiple_images")
                putString("text", intent.getStringExtra(Intent.EXTRA_TEXT) ?: "")
                putBoolean("isReadOnly", true)
                if (!quickAction.isNullOrBlank()) {
                    putString("quickAction", quickAction)
                }
                putArray("uris", cachedUris)
            }
        }

        return null
    }

    /**
     * Safely copies an external content:// or file:// URI into the app's cache directory.
     * Guarantees compliance with Scoped Storage and protects against transient permission revocation.
     */
    private fun cacheSharedUri(uri: Uri): String? {
        val context = reactApplicationContext
        return try {
            val contentResolver = context.contentResolver
            val mimeType = contentResolver.getType(uri) ?: "image/jpeg"
            val ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType) ?: "jpg"

            val targetDir = File(context.cacheDir, "shared_media").apply {
                if (!exists()) mkdirs()
            }

            // Best-effort cache pruning: keep directory clean over long-term usage
            try {
                val cachedFiles = targetDir.listFiles()
                if (cachedFiles != null && cachedFiles.size > 25) {
                    val twoDaysAgo = System.currentTimeMillis() - (48 * 60 * 60 * 1000L)
                    cachedFiles.filter { it.lastModified() < twoDaysAgo }.forEach { it.delete() }
                }
            } catch (_: Exception) {
                // Ignore cleanup errors
            }

            val targetFile = File(targetDir, "share_${System.currentTimeMillis()}_${(1000..9999).random()}.$ext")

            contentResolver.openInputStream(uri)?.use { input ->
                FileOutputStream(targetFile).use { output ->
                    input.copyTo(output)
                }
            } ?: return null

            targetFile.absolutePath
        } catch (e: Exception) {
            Log.w(TAG, "Failed to cache incoming media URI: $uri", e)
            null
        }
    }

    private fun detectTextOrLink(raw: String): String {
        val trimmed = raw.trim()
        val isPureUrl = trimmed.startsWith("http://", ignoreCase = true) ||
                trimmed.startsWith("https://", ignoreCase = true)
        return if (isPureUrl) "link" else "text"
    }

    private fun extractUrl(raw: String): String {
        val trimmed = raw.trim()
        val urlRegex = Regex("""https?://[^\s]+""", RegexOption.IGNORE_CASE)
        val match = urlRegex.find(trimmed)
        return match?.value ?: trimmed
    }
}
