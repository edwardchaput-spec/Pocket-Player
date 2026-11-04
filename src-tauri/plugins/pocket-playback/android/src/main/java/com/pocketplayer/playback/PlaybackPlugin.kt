package com.pocketplayer.playback

import android.app.Activity
import android.content.ComponentName
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.common.util.concurrent.ListenableFuture
import org.json.JSONArray

@InvokeArg
class SubscribeArgs {
    lateinit var channel: Channel
}

@InvokeArg
class ConfigureArgs {
    lateinit var proxyBaseUrl: String
}

@InvokeArg
class QueueItemArg {
    lateinit var mediaId: String
    lateinit var songId: String
    lateinit var url: String
    var title: String = ""
    var artist: String? = null
    var album: String? = null
    var artworkUrl: String? = null
}

@InvokeArg
class SetQueueArgs {
    var items: Array<QueueItemArg> = arrayOf()
    var startIndex: Int = 0
    var positionMs: Long = 0
    var playWhenReady: Boolean = false
}

@InvokeArg
class SeekArgs {
    var positionMs: Long = 0
}

@InvokeArg
class SkipArgs {
    var index: Int = 0
    var playWhenReady: Boolean = true
}

@InvokeArg
class VolumeArgs {
    var volume: Float = 1f
}

@InvokeArg
class RepeatArgs {
    var mode: String = "off"
}

@InvokeArg
class SpectrumArgs {
    var enabled: Boolean = false
}

/**
 * Webview bridge to [PlaybackService]. All controller access happens on the
 * main looper; commands that arrive before the controller connects are queued.
 */
@TauriPlugin
class PlaybackPlugin(private val activity: Activity) : Plugin(activity) {
    private val main = Handler(Looper.getMainLooper())
    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var controller: MediaController? = null
    private val pending = ArrayDeque<(MediaController) -> Unit>()
    private var channel: Channel? = null
    private var spectrumEnabled = false
    private val frequency = ByteArray(SpectrumTap.FFT_SIZE / 2)
    private val waveform = ByteArray(SpectrumTap.FFT_SIZE)

    private val listener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) = emitState()

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            val event = JSObject()
            event.put("type", "transition")
            event.put("index", controller?.currentMediaItemIndex ?: -1)
            event.put("mediaId", mediaItem?.mediaId)
            event.put("songId", mediaItem?.mediaMetadata?.extras?.getString(AutoLibrary.SONG_ID_EXTRA))
            event.put(
                "reason",
                when (reason) {
                    Player.MEDIA_ITEM_TRANSITION_REASON_AUTO -> "auto"
                    Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT -> "repeat"
                    Player.MEDIA_ITEM_TRANSITION_REASON_SEEK -> "seek"
                    else -> "playlistChanged"
                },
            )
            channel?.send(event)
        }

        override fun onPlayerError(error: PlaybackException) {
            val event = JSObject()
            event.put("type", "error")
            event.put("code", error.errorCodeName)
            channel?.send(event)
        }
    }

    private val ticker = object : Runnable {
        override fun run() {
            val active = controller?.isPlaying == true
            if (active) emitState()
            if (active && spectrumEnabled) emitSpectrum()
            main.postDelayed(this, if (active && spectrumEnabled) 33L else 500L)
        }
    }

    override fun load(webView: WebView) {
        PlaybackRegistry.externalQueueListener = { songsJson, startIndex ->
            main.post {
                val event = JSObject()
                event.put("type", "externalQueue")
                event.put("songs", JSONArray(songsJson))
                event.put("index", startIndex)
                channel?.send(event)
            }
        }
        val token = SessionToken(activity, ComponentName(activity, PlaybackService::class.java))
        val future = MediaController.Builder(activity, token).buildAsync()
        controllerFuture = future
        future.addListener(
            {
                val connected = runCatching { future.get() }.getOrNull() ?: return@addListener
                connected.addListener(listener)
                controller = connected
                while (pending.isNotEmpty()) pending.removeFirst()(connected)
                emitState()
            },
            ContextCompat.getMainExecutor(activity),
        )
        main.post(ticker)
    }

    override fun onDestroy(activity: AppCompatActivity) {
        main.removeCallbacks(ticker)
        PlaybackRegistry.externalQueueListener = null
        controller?.removeListener(listener)
        controllerFuture?.let(MediaController::releaseFuture)
        controller = null
        super.onDestroy(activity)
    }

    @Command
    fun subscribe(invoke: Invoke) {
        val args = invoke.parseArgs(SubscribeArgs::class.java)
        main.post {
            channel = args.channel
            emitState()
        }
        invoke.resolve()
    }

    @Command
    fun configure(invoke: Invoke) {
        val args = invoke.parseArgs(ConfigureArgs::class.java)
        val parsed = Uri.parse(args.proxyBaseUrl)
        if (parsed.scheme != "http" || parsed.host != "127.0.0.1") {
            invoke.reject("The playback proxy must be the local loopback proxy.")
            return
        }
        PlaybackRegistry.proxyBaseUrl = args.proxyBaseUrl.trimEnd('/')
        invoke.resolve()
    }

    @Command
    fun setQueue(invoke: Invoke) {
        val args = invoke.parseArgs(SetQueueArgs::class.java)
        val base = PlaybackRegistry.proxyBaseUrl
        if (base == null || args.items.any { !it.url.startsWith("$base/stream/") }) {
            invoke.reject("Queue items must stream through the local proxy.")
            return
        }
        val items = args.items.map { it.toMediaItem() }
        withController { player ->
            if (items.isEmpty()) {
                player.clearMediaItems()
                player.stop()
                return@withController
            }
            val start = args.startIndex.coerceIn(0, items.lastIndex)
            player.setMediaItems(items, start, args.positionMs.coerceAtLeast(0))
            player.prepare()
            player.playWhenReady = args.playWhenReady
        }
        invoke.resolve()
    }

    @Command
    fun play(invoke: Invoke) {
        withController { player ->
            if (player.playbackState == Player.STATE_IDLE) player.prepare()
            if (player.playbackState == Player.STATE_ENDED) player.seekTo(0)
            player.play()
        }
        invoke.resolve()
    }

    @Command
    fun pause(invoke: Invoke) {
        withController { it.pause() }
        invoke.resolve()
    }

    @Command
    fun seekTo(invoke: Invoke) {
        val args = invoke.parseArgs(SeekArgs::class.java)
        withController { it.seekTo(args.positionMs.coerceAtLeast(0)) }
        invoke.resolve()
    }

    @Command
    fun skipTo(invoke: Invoke) {
        val args = invoke.parseArgs(SkipArgs::class.java)
        withController { player ->
            if (args.index in 0 until player.mediaItemCount) {
                player.seekTo(args.index, 0)
                player.playWhenReady = args.playWhenReady
            }
        }
        invoke.resolve()
    }

    @Command
    fun setVolume(invoke: Invoke) {
        val args = invoke.parseArgs(VolumeArgs::class.java)
        withController { it.volume = args.volume.coerceIn(0f, 1f) }
        invoke.resolve()
    }

    @Command
    fun setRepeatMode(invoke: Invoke) {
        val args = invoke.parseArgs(RepeatArgs::class.java)
        val mode = when (args.mode) {
            "queue" -> Player.REPEAT_MODE_ALL
            "one" -> Player.REPEAT_MODE_ONE
            else -> Player.REPEAT_MODE_OFF
        }
        withController { it.repeatMode = mode }
        invoke.resolve()
    }

    @Command
    fun setSpectrumEnabled(invoke: Invoke) {
        val args = invoke.parseArgs(SpectrumArgs::class.java)
        main.post { spectrumEnabled = args.enabled }
        invoke.resolve()
    }

    @Command
    fun stop(invoke: Invoke) {
        withController { player ->
            player.stop()
            player.clearMediaItems()
        }
        invoke.resolve()
    }

    private fun withController(action: (MediaController) -> Unit) {
        main.post {
            val connected = controller
            if (connected == null) pending.addLast(action) else action(connected)
        }
    }

    private fun emitState() {
        val player = controller ?: return
        val target = channel ?: return
        val event = JSObject()
        event.put("type", "state")
        event.put("index", if (player.mediaItemCount == 0) -1 else player.currentMediaItemIndex)
        event.put("itemCount", player.mediaItemCount)
        event.put("mediaId", player.currentMediaItem?.mediaId)
        event.put("songId", player.currentMediaItem?.mediaMetadata?.extras?.getString(AutoLibrary.SONG_ID_EXTRA))
        event.put("isPlaying", player.isPlaying)
        event.put("playWhenReady", player.playWhenReady)
        event.put(
            "playbackState",
            when (player.playbackState) {
                Player.STATE_BUFFERING -> "buffering"
                Player.STATE_READY -> "ready"
                Player.STATE_ENDED -> "ended"
                else -> "idle"
            },
        )
        event.put("positionMs", player.currentPosition.coerceAtLeast(0))
        event.put("durationMs", if (player.duration == C.TIME_UNSET) -1 else player.duration)
        target.send(event)
    }

    private fun emitSpectrum() {
        val target = channel ?: return
        SpectrumTap.snapshot(frequency, waveform)
        val event = JSObject()
        event.put("type", "spectrum")
        event.put("frequency", Base64.encodeToString(frequency, Base64.NO_WRAP))
        event.put("waveform", Base64.encodeToString(waveform, Base64.NO_WRAP))
        target.send(event)
    }

    private fun QueueItemArg.toMediaItem(): MediaItem {
        val uri = Uri.parse(url)
        val extras = Bundle().apply { putString(AutoLibrary.SONG_ID_EXTRA, songId) }
        return MediaItem.Builder()
            .setMediaId(mediaId)
            .setUri(uri)
            .setRequestMetadata(MediaItem.RequestMetadata.Builder().setMediaUri(uri).build())
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(title)
                    .setArtist(artist)
                    .setAlbumTitle(album)
                    .setArtworkUri(artworkUrl?.let(Uri::parse))
                    .setIsBrowsable(false)
                    .setIsPlayable(true)
                    .setExtras(extras)
                    .build(),
            )
            .build()
    }
}
