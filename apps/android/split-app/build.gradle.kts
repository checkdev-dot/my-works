plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false
}

// Build output lives outside OneDrive so sync never locks Gradle's files.
allprojects {
    layout.buildDirectory.set(file("${System.getProperty("user.home")}/AndroidBuild/split-app/${project.name}"))
}
