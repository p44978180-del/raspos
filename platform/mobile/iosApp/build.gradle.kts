val compileIosApp = tasks.register("compileIosApp") {
    group = "build"
    description = "Compile the shared Compose UI into the iOS simulator framework."
}

val sharedProject = project(":shared")
sharedProject.afterEvaluate {
    val link = sharedProject.tasks.findByName("linkDebugFrameworkIosSimulatorArm64")
    if (link != null) {
        compileIosApp.configure { dependsOn(link) }
    } else {
        compileIosApp.configure {
            doFirst {
                error("The iOS UI framework is compiled on macOS. This host is ${System.getProperty("os.name")}.")
            }
        }
    }
}
