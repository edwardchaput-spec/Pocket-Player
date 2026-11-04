package com.pocketplayer.playback

/**
 * In-process hand-off between the Tauri plugin (webview side) and the Media3
 * service. Both live in the app process; nothing here is persisted.
 *
 * The proxy base URL contains the per-process loopback token, so it is held in
 * memory only and never logged.
 */
object PlaybackRegistry {
    @Volatile
    var proxyBaseUrl: String? = null

    /** Raised when Android Auto (or another external controller) replaces the queue. */
    @Volatile
    var externalQueueListener: ((songsJson: String, startIndex: Int) -> Unit)? = null
}
