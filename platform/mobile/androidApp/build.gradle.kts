import java.util.Properties

plugins {
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.kotlinAndroid)
    alias(libs.plugins.composeCompiler)
    alias(libs.plugins.composeMultiplatform)
}

android {
    namespace = "ru.timacad.platform"
    compileSdk = libs.versions.android.compileSdk.get().toInt()
    defaultConfig {
        applicationId = "ru.timacad.platform"
        minSdk = libs.versions.android.minSdk.get().toInt()
        targetSdk = libs.versions.android.targetSdk.get().toInt()
        versionCode = 1
        versionName = "0.1.0"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
    val local = Properties().apply {
        val file = rootProject.file("local.properties")
        if (file.exists()) file.inputStream().use { load(it) }
    }
    fun setting(name: String): String? = local.getProperty(name) ?: findProperty(name)?.toString()
    signingConfigs {
        create("release") {
            val store = setting("timacad.storeFile")
            if (!store.isNullOrBlank()) {
                storeFile = file(store)
                storePassword = setting("timacad.storePassword")
                keyAlias = setting("timacad.keyAlias")
                keyPassword = setting("timacad.keyPassword")
                enableV1Signing = false
                enableV2Signing = true
                enableV3Signing = true
            }
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21)
    }
}

dependencies {
    implementation(project(":shared"))
    implementation(libs.androidx.activity.compose)
    implementation(libs.sqldelight.android.driver)
    implementation(compose.runtime)
    implementation(compose.foundation)
    implementation(compose.material3)
    implementation(compose.ui)
    implementation(libs.maplibre.android)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play)
}
