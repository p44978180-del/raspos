-keep class ru.timacad.core.** { *; }
-keep class uniffi.** { *; }
# JNA's JNI bridge resolves Pointer.peer and Structure fields by their Java names.
-keep class com.sun.jna.** { *; }
# JNA also ships desktop AWT helpers; Android never invokes those entry points.
-dontwarn java.awt.Component
-dontwarn java.awt.GraphicsEnvironment
-dontwarn java.awt.HeadlessException
-dontwarn java.awt.Window
-keep class ru.timacad.platform.db.** { *; }
-keep class org.maplibre.** { *; }
-keep class io.ktor.** { *; }
-keep class kotlinx.coroutines.** { *; }
-keep class androidx.glance.** { *; }
-keep class com.google.crypto.tink.** { *; }
-dontwarn org.maplibre.**
-dontwarn io.ktor.**
