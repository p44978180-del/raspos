package timacad

import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.tasks.Exec
import org.gradle.kotlin.dsl.register
import java.io.File

class TimacadRustPlugin : Plugin<Project> {
    override fun apply(project: Project) {
        val crate = project.rootProject.projectDir.resolve("../rust/timacad-core").canonicalFile
        val cargo = resolveCargo()
        val hostLibrary = crate.resolve(hostLibraryRelativePath())
        val generated = project.layout.buildDirectory.dir("generated/uniffi")
        val jniLibs = project.layout.buildDirectory.dir("generated/jniLibs")

        val hostBuild = project.tasks.register<Exec>("cargoBuildHost") {
            group = "rust"
            workingDir = crate
            commandLine(cargo, "build", "--lib", "--no-default-features")
            environment("PATH", cargoPath())
            inputs.dir(crate.resolve("src"))
            inputs.file(crate.resolve("Cargo.toml"))
            outputs.file(hostLibrary)
        }

        val bindgen = project.tasks.register<Exec>("generateUniffiKotlin") {
            group = "rust"
            dependsOn(hostBuild)
            workingDir = crate
            val output = generated.get().asFile
            commandLine(
                cargo, "run", "--quiet", "--features", "cli", "--bin", "uniffi-bindgen", "--",
                "generate", "--library", hostLibrary.absolutePath, "--language", "kotlin", "--out-dir", output.absolutePath,
            )
            environment("PATH", cargoPath())
            inputs.file(hostLibrary)
            outputs.dir(output)
        }

        val androidBuilds = androidAbis(project).map { abi ->
            val androidTarget = androidTarget(abi)
            project.tasks.register<Exec>("cargoBuildAndroid${abi.replace("-", "")}") {
                group = "rust"
                workingDir = crate
                commandLine(cargo, "--version")
                val so = crate.resolve("target/$androidTarget/debug/libtimacad_core.so")
                inputs.dir(crate.resolve("src"))
                outputs.file(so)
                doFirst {
                    val ndk = resolveNdk()
                    val prebuilt = ndk.resolve("toolchains/llvm/prebuilt").listFiles()?.firstOrNull { it.isDirectory }
                        ?: error("NDK llvm prebuilt toolchain is missing under $ndk")
                    val toolPrefix = androidClang(abi)
                    val linker = prebuilt.resolve("bin/$toolPrefix.cmd").takeIf { it.exists() }
                        ?: prebuilt.resolve("bin/$toolPrefix")
                    val envKey = "CARGO_TARGET_${androidTarget.uppercase().replace('-', '_')}_LINKER"
                    commandLine(cargo, "build", "--lib", "--target", androidTarget, "--no-default-features")
                    environment("PATH", cargoPath())
                    environment(envKey, linker.absolutePath)
                    environment("RUSTFLAGS", "-C link-arg=-Wl,-z,max-page-size=16384")
                }
                doLast {
                    val dest = jniLibs.get().asFile.resolve(abi)
                    dest.mkdirs()
                    so.copyTo(dest.resolve("libtimacad_core.so"), overwrite = true)
                }
            }
        }
        val androidBuild = project.tasks.register("cargoBuildAndroidDebug") {
            group = "rust"
            dependsOn(androidBuilds)
        }

        project.afterEvaluate {
            val kotlin = project.extensions.getByName("kotlin")
            val sourceSets = kotlin.javaClass.getMethod("getSourceSets").invoke(kotlin)
            listOf("jvmMain", "androidMain").forEach { name ->
                val sourceSet = sourceSets.javaClass.getMethod("getByName", String::class.java).invoke(sourceSets, name)
                val kotlinSource = sourceSet.javaClass.getMethod("getKotlin").invoke(sourceSet)
                kotlinSource.javaClass.getMethod("srcDir", Any::class.java).invoke(kotlinSource, generated)
            }
            project.tasks.findByName("compileKotlinJvm")?.dependsOn(bindgen)
            project.tasks.findByName("compileDebugKotlinAndroid")?.dependsOn(bindgen)
            project.tasks.findByName("compileReleaseKotlinAndroid")?.dependsOn(bindgen)
            project.tasks.findByName("mergeDebugJniLibFolders")?.dependsOn(androidBuild)
            project.tasks.findByName("mergeReleaseJniLibFolders")?.dependsOn(androidBuild)
            (project.tasks.findByName("jvmTest") as? org.gradle.api.tasks.testing.Test)?.let { test ->
                test.dependsOn(hostBuild)
                test.systemProperty("jna.library.path", hostLibrary.parentFile.absolutePath)
                test.systemProperty("java.library.path", hostLibrary.parentFile.absolutePath)
            }
        }
    }
}

private fun resolveCargo(): String {
    val home = File(System.getProperty("user.home"), ".cargo/bin")
    val exe = if (System.getProperty("os.name").startsWith("Windows")) "cargo.exe" else "cargo"
    return home.resolve(exe).absolutePath
}

private fun cargoPath(): String {
    val cargoBin = File(System.getProperty("user.home"), ".cargo/bin").absolutePath
    return cargoBin + File.pathSeparator + (System.getenv("PATH") ?: "")
}

private fun hostLibraryRelativePath(): String {
    val os = System.getProperty("os.name")
    return when {
        os.startsWith("Windows") -> "target/debug/timacad_core.dll"
        os.startsWith("Mac") -> "target/debug/libtimacad_core.dylib"
        else -> "target/debug/libtimacad_core.so"
    }
}

internal fun androidAbis(project: Project): List<String> {
    val listed = project.findProperty("timacad.rust.androidAbis")?.toString()?.takeIf { it.isNotBlank() }
        ?: project.findProperty("timacad.rust.androidAbi")?.toString()?.takeIf { it.isNotBlank() }
        ?: "arm64-v8a,x86_64"
    return listed.split(",").map { it.trim() }.filter { it.isNotEmpty() }
}

private fun androidTarget(abi: String): String = when (abi) {
    "x86_64" -> "x86_64-linux-android"
    "arm64-v8a" -> "aarch64-linux-android"
    "armeabi-v7a" -> "armv7-linux-androideabi"
    "x86" -> "i686-linux-android"
    else -> error("Unsupported Android ABI $abi")
}

private fun androidClang(abi: String): String = when (abi) {
    "x86_64" -> "x86_64-linux-android24-clang"
    "arm64-v8a" -> "aarch64-linux-android24-clang"
    "armeabi-v7a" -> "armv7a-linux-androideabi24-clang"
    "x86" -> "i686-linux-android24-clang"
    else -> error("Unsupported Android ABI $abi")
}

private fun resolveNdk(): File {
    val root = System.getenv("ANDROID_HOME") ?: System.getenv("ANDROID_SDK_ROOT")
        ?: File(System.getProperty("user.home"), ".cache/raspos-android/sdk").absolutePath
    val ndkRoot = File(root, "ndk")
    val version = ndkRoot.listFiles()?.filter { it.isDirectory }?.maxByOrNull { it.name }
        ?: error("Android NDK is not installed under $ndkRoot")
    return version
}
