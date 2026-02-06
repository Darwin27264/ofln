# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# ============================================
# React Native Core
# ============================================
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.soloader.** { *; }

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep React Native bridge
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keep @com.facebook.common.internal.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
    @com.facebook.common.internal.DoNotStrip *;
}

# ============================================
# Your App Package
# ============================================
-keep class com.ofln.** { *; }

# ============================================
# llama.rn - LLM Native Library (New Arch / TurboModule)
# ============================================
-keep class com.llama.** { *; }
-keep class com.rnllama.** { *; }
-keepclassmembers class com.llama.** { *; }
-keepclassmembers class com.rnllama.** { *; }

# ============================================
# React Native Vector Icons
# ============================================
-keep class com.oblador.vectoricons.** { *; }

# ============================================
# AsyncStorage
# ============================================
-keep class com.reactnativecommunity.asyncstorage.** { *; }
-keep class com.facebook.react.bridge.** { *; }

# ============================================
# React Native FS
# ============================================
-keep class com.rnfs.** { *; }

# ============================================
# React Native Gesture Handler
# ============================================
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.swmansion.rnscreens.** { *; }

# ============================================
# React Native SVG
# ============================================
-keep class com.horcrux.svg.** { *; }

# ============================================
# React Native Chart Kit
# ============================================
-keep class com.indiespirit.reactnativechartkit.** { *; }

# ============================================
# React Native Markdown Display
# ============================================
-keep class io.github.iamyours.react_native_markdown.** { *; }

# ============================================
# React Native Documents Picker
# ============================================
-keep class com.reactnativedocumentspicker.** { *; }

# ============================================
# React Native Clipboard
# ============================================
-keep class com.reactnativecommunity.clipboard.** { *; }

# ============================================
# React Native Keyboard Aware Scroll View
# ============================================
-keep class com.reactnative.keyboardawarescrollview.** { *; }

# ============================================
# React Native Safe Area Context
# ============================================
-keep class com.th3rdwave.safeareacontext.** { *; }

# ============================================
# React Native System Bars (Custom Package)
# ============================================
-keep class com.ofln.systembars.** { *; }

# ============================================
# JavaScript Interface
# ============================================
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ============================================
# Parcelable
# ============================================
-keepclassmembers class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator CREATOR;
}

# ============================================
# Serializable
# ============================================
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# ============================================
# Keep line numbers for crash reporting
# ============================================
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ============================================
# Keep annotations
# ============================================
-keepattributes *Annotation*
-keepattributes EnclosingMethod
-keepattributes InnerClasses
-keepattributes Signature

# ============================================
# OkHttp (used by React Native and Axios)
# ============================================
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# ============================================
# Axios (HTTP client)
# ============================================
-keep class com.facebook.react.modules.network.** { *; }

# ============================================
# UUID library
# ============================================
-keep class java.util.UUID { *; }

# ============================================
# React Native New Architecture
# ============================================
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.react.fabric.** { *; }
-keep class com.facebook.react.uimanager.** { *; }

# ============================================
# Kotlin
# ============================================
-keep class kotlin.** { *; }
-keep class kotlin.Metadata { *; }
-dontwarn kotlin.**
-keepclassmembers class **$WhenMappings {
    <fields>;
}
-keepclassmembers class kotlin.Metadata {
    public <methods>;
}

# ============================================
# AndroidX
# ============================================
-keep class androidx.** { *; }
-dontwarn androidx.**
