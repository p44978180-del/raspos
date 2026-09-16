plugins {
    alias(libs.plugins.kotlinMultiplatform)
    alias(libs.plugins.androidLibrary)
    alias(libs.plugins.sqldelight)
    kotlin("plugin.serialization") version "2.1.0"
}

kotlin {
    androidTarget {
        compilations.all {
            kotlinOptions {
                jvmTarget = "17"
            }
        }
    }

    listOf(
        iosX64(),
        iosArm64(),
        iosSimulatorArm64()
    ).forEach { iosTarget ->
        iosTarget.binaries.framework {
            baseName = "SharedCore"
            isStatic = true
        }
    }

    sourceSets {
        commonMain.dependencies {
            // Ktor HTTP/3 & Connect-RPC
            implementation("io.ktor:ktor-client-core:3.0.1")
            implementation("io.ktor:ktor-client-content-negotiation:3.0.1")
            implementation("io.ktor:ktor-serialization-kotlinx-protobuf:3.0.1")
            implementation("io.ktor:ktor-serialization-kotlinx-json:3.0.1")
            
            // SQLDelight / Room KMP Local-First SQLite
            implementation("app.cash.sqldelight:runtime:2.0.2")
            implementation("app.cash.sqldelight:coroutines-extensions:2.0.2")

            // MVI / State Machine (Decompose / MVIKotlin)
            implementation("com.arkivanov.decompose:decompose:3.2.1")
            implementation("com.arkivanov.mvikotlin:mvikotlin:4.2.0")
            implementation("com.arkivanov.mvikotlin:mvikotlin-main:4.2.0")
            implementation("com.arkivanov.mvikotlin:mvikotlin-extensions-coroutines:4.2.0")

            // Coroutines
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0")
            implementation("org.jetbrains.kotlinx:kotlinx-datetime:0.6.1")
        }

        androidMain.dependencies {
            implementation("io.ktor:ktor-client-okhttp:3.0.1")
            implementation("app.cash.sqldelight:android-driver:2.0.2")
            
            // Jetpack Glance for Desktop Widgets
            implementation("androidx.glance:glance-appwidget:1.1.0")
            implementation("androidx.glance:glance-material3:1.1.0")
        }

        iosMain.dependencies {
            implementation("io.ktor:ktor-client-darwin:3.0.1")
            implementation("app.cash.sqldelight:native-driver:2.0.2")
        }
    }
}

android {
    namespace = "ru.timacad.raspos.shared"
    compileSdk = 35
    defaultConfig {
        minSdk = 26
    }
}

sqldelight {
    databases {
        create("ScheduleDatabase") {
            packageName.set("ru.timacad.raspos.database")
        }
    }
}
