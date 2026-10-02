import java.net.URI

plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.androidLibrary)
    alias(libs.plugins.sqldelight)
    alias(libs.plugins.composeMultiplatform)
    alias(libs.plugins.composeCompiler)
    alias(libs.plugins.kotlinSerialization)
    id("timacad.rust")
}

kotlin {
    jvmToolchain(21)
    androidTarget {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21)
        }
    }
    jvm {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21)
        }
    }

    // iOS targets need a Mac toolchain. They are part of :shared once the host can compile them.
    val hostIsMac = System.getProperty("os.name").startsWith("Mac")
    if (hostIsMac) {
        listOf(iosArm64(), iosSimulatorArm64()).forEach { target ->
            target.binaries.framework {
                baseName = "SharedCore"
                isStatic = true
            }
        }
    }

    sourceSets {
        listOf("jvmMain", "androidMain").forEach { name ->
            getByName(name).kotlin.srcDir("src/jvmAndAndroidMain/kotlin")
        }
        commonMain.dependencies {
            api(libs.decompose)
            api(libs.decompose.compose)
            api(libs.mvikotlin)
            api(libs.mvikotlin.main)
            api(libs.mvikotlin.coroutines)
            implementation(libs.sqldelight.runtime)
            implementation(libs.sqldelight.coroutines)
            implementation(libs.kotlinx.coroutines.core)
            implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")
            implementation("com.squareup.okio:okio:3.10.2")
            implementation(compose.runtime)
            implementation(compose.foundation)
            implementation(compose.material3)
            implementation(compose.ui)
        }
        androidMain.dependencies {
            implementation(libs.sqldelight.android.driver)
            implementation("com.github.requery:sqlite-android:3.49.0")
            implementation(libs.glance.appwidget)
            implementation(libs.glance.material3)
            implementation(libs.ktor.client.core)
            implementation(libs.ktor.client.okhttp)
            implementation(libs.ktor.client.websockets)
            implementation("net.java.dev.jna:jna:5.17.0@aar")
        }
        jvmMain.dependencies {
            implementation(libs.sqldelight.sqlite.driver)
            implementation("net.java.dev.jna:jna:5.17.0")
        }
        jvmTest.dependencies {
            implementation(kotlin("test"))
        }
    }
}

android {
    namespace = "ru.timacad.platform.shared"
    sourceSets.getByName("debug").jniLibs.srcDir(layout.buildDirectory.dir("generated/jniLibs/debug"))
    sourceSets.getByName("release").jniLibs.srcDir(layout.buildDirectory.dir("generated/jniLibs/release"))
    compileSdk = libs.versions.android.compileSdk.get().toInt()
    buildFeatures { buildConfig = true }
    defaultConfig {
        val apiUrl = providers.gradleProperty("timacad.apiUrl").orElse(providers.environmentVariable("TIMACAD_API_URL")).getOrElse("http://10.0.2.2:8088")
        val realtimeUrl = providers.gradleProperty("timacad.realtimeUrl").orElse(providers.environmentVariable("TIMACAD_REALTIME_URL")).getOrElse("ws://10.0.2.2:8000/connection/websocket")
        fun quotedUrl(value: String): String {
            require(!value.contains('"') && !value.contains('\\') && !value.contains('\n') && !value.contains('\r')) { "Invalid endpoint" }
            val uri = URI(value)
            require(uri.host != null && uri.userInfo == null && uri.fragment == null) { "Endpoint must have a host and no credentials" }
            require(uri.scheme in listOf("https", "wss") || (uri.scheme in listOf("http", "ws") && uri.host in listOf("10.0.2.2", "127.0.0.1", "localhost"))) { "Non-local endpoints require TLS" }
            return "\"${value.trimEnd('/')}\""
        }
        buildConfigField("String", "API_URL", quotedUrl(apiUrl))
        buildConfigField("String", "REALTIME_URL", quotedUrl(realtimeUrl))
        minSdk = libs.versions.android.minSdk.get().toInt()
        ndk {
            val listed = (findProperty("timacad.rust.androidAbis") ?: findProperty("timacad.rust.androidAbi") ?: "arm64-v8a,x86_64").toString()
            abiFilters += listed.split(",").map { it.trim() }.filter { it.isNotEmpty() }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
}

sqldelight {
    databases {
        create("PlatformDatabase") {
            packageName.set("ru.timacad.platform.db")
        }
    }
}
