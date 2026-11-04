//! Android TLS bootstrap.
//!
//! `reqwest` verifies certificates through `rustls-platform-verifier`, which
//! on Android calls into the platform `TrustManager` over JNI. It must be given
//! the JVM and an Android `Context` before the first HTTPS request, otherwise
//! every Navidrome request fails. Validation is never relaxed here; this only
//! connects rustls to Android's own certificate verifier.

use jni::{JavaVM, objects::JObject};

pub fn initialize() {
    let Some(context) = tao::platform::android::prelude::main_android_context() else {
        tracing::error!(
            category = "tls",
            "Android context unavailable; HTTPS verification cannot start"
        );
        return;
    };
    // SAFETY: tao stores the process JavaVM pointer and a global reference to
    // the main Activity for the lifetime of the process.
    let vm = unsafe { JavaVM::from_raw(context.java_vm.cast()) };
    let result = vm.attach_current_thread(|env| -> Result<(), jni::errors::Error> {
        // SAFETY: the pointer is the live global Activity reference held by tao.
        let activity = unsafe { JObject::from_raw(env, context.context_jobject.cast()) };
        rustls_platform_verifier::android::init_with_env(env, activity)
    });
    if result.is_err() {
        tracing::error!(
            category = "tls",
            "Android certificate verifier initialization failed"
        );
    }
}
