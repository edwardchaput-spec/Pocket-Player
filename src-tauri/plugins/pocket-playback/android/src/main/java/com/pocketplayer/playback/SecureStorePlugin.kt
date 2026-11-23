package com.pocketplayer.playback

import android.app.Activity
import android.util.Log
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class CredentialArgs {
    lateinit var account: String
    var secret: String? = null
}

/**
 * Rust-only bridge to [SecureCredentialStore]. It is registered as the
 * `pocket-secure-store` Tauri plugin, which no capability grants, so the
 * webview's IPC is rejected by the ACL and only Rust's credential strategy
 * can call it. Errors are deliberately generic.
 */
@TauriPlugin
class SecureStorePlugin(activity: Activity) : Plugin(activity) {
    private val store = SecureCredentialStore(activity)

    @Command
    fun get(invoke: Invoke) {
        guarded(invoke) {
            val args = invoke.parseArgs(CredentialArgs::class.java)
            val result = JSObject()
            store.get(args.account)?.let { result.put("secret", it) }
            invoke.resolve(result)
        }
    }

    @Command
    fun set(invoke: Invoke) {
        guarded(invoke) {
            val args = invoke.parseArgs(CredentialArgs::class.java)
            store.set(args.account, args.secret ?: throw IllegalArgumentException("secret missing"))
            invoke.resolve(JSObject())
        }
    }

    @Command
    fun delete(invoke: Invoke) {
        guarded(invoke) {
            store.delete(invoke.parseArgs(CredentialArgs::class.java).account)
            invoke.resolve(JSObject())
        }
    }

    private companion object {
        const val TAG = "PocketSecureStore"
    }

    private inline fun guarded(invoke: Invoke, block: () -> Unit) {
        try {
            block()
        } catch (error: Exception) {
            // Exception type only: messages are never logged in case they echo input.
            Log.w(TAG, "credential store call failed: ${error.javaClass.name}")
            invoke.reject("The Android credential store is unavailable.")
        }
    }
}
