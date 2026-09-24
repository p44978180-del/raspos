plugins {
    `kotlin-dsl`
}

repositories {
    gradlePluginPortal()
    mavenCentral()
}

gradlePlugin {
    plugins {
        register("timacadRust") {
            id = "timacad.rust"
            implementationClass = "timacad.TimacadRustPlugin"
        }
    }
}
