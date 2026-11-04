import groovy.json.JsonSlurper

plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.pocketplayer.playback"
    compileSdk = 36

    defaultConfig {
        minSdk = 24
        consumerProguardFiles("consumer-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
}

// rustls-platform-verifier ships its Kotlin component as a local Maven
// repository inside its crate. Resolve that path through cargo metadata so the
// Rust and Kotlin halves always come from the same crate version.
fun rustlsPlatformVerifierMaven(): File {
    val manifest = File(rootDir, "../../Cargo.toml").canonicalFile
    val output = providers.exec {
        commandLine(
            "cargo", "metadata", "--format-version", "1",
            "--filter-platform", "aarch64-linux-android",
            "--manifest-path", manifest.path,
        )
    }.standardOutput.asText.get()
    @Suppress("UNCHECKED_CAST")
    val packages = (JsonSlurper().parseText(output) as Map<String, Any>)["packages"] as List<Map<String, Any>>
    val verifier = packages.first { it["name"] == "rustls-platform-verifier-android" }
    return File(File(verifier["manifest_path"] as String).parentFile, "maven")
}

// The app module resolves this plugin's transitive dependencies with its own
// repositories, so register the verifier repository for every project. This
// keeps the generated (gitignored) Android project free of manual edits.
val verifierMaven = rustlsPlatformVerifierMaven()
rootProject.allprojects {
    repositories {
        maven { url = uri(verifierMaven) }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.media3:media3-exoplayer:1.8.0")
    implementation("androidx.media3:media3-session:1.8.0")
    implementation("com.google.guava:guava:33.3.1-android")
    implementation("rustls:rustls-platform-verifier:0.1.1")
    implementation(project(":tauri-android"))
}
