@file:androidx.annotation.OptIn(markerClass = [UnstableApi::class])

package com.pocketplayer.playback

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionError
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * The single Android playback output (ADR-011): one ExoPlayer, the media
 * notification, audio focus, the media session for lock screen and Bluetooth,
 * and the Android Auto browse tree. The webview stays the queue authority and
 * drives this service through [PlaybackPlugin].
 */
class PlaybackService : MediaLibraryService() {
    private var session: MediaLibrarySession? = null
    private val io = MoreExecutors.listeningDecorator(Executors.newSingleThreadExecutor())
    private val searchResults = ConcurrentHashMap<String, List<MediaItem>>()

    override fun onCreate() {
        super.onCreate()
        val renderers = object : DefaultRenderersFactory(this) {
            override fun buildAudioSink(
                context: Context,
                enableFloatOutput: Boolean,
                enableAudioTrackPlaybackParams: Boolean,
            ): AudioSink = DefaultAudioSink.Builder(context)
                .setAudioProcessors(arrayOf(SpectrumTap))
                .build()
        }
        val player = ExoPlayer.Builder(this, renderers)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                /* handleAudioFocus = */ true,
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build()
        session = MediaLibrarySession.Builder(this, player, LibraryCallback())
            .apply { launchIntent()?.let(::setSessionActivity) }
            .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        val player = session?.player
        if (player == null || !player.playWhenReady || player.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        session?.run {
            player.release()
            release()
        }
        session = null
        io.shutdownNow()
        super.onDestroy()
    }

    private fun launchIntent(): PendingIntent? {
        val intent = packageManager.getLaunchIntentForPackage(packageName) ?: return null
        return PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }

    private inner class LibraryCallback : MediaLibrarySession.Callback {
        /** Only this app, system media surfaces, and Android Auto may connect. */
        override fun onConnect(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
        ): MediaSession.ConnectionResult {
            val allowed = controller.packageName == packageName ||
                session.isMediaNotificationController(controller) ||
                session.isAutoCompanionController(controller) ||
                session.isAutomotiveController(controller) ||
                controller.isTrusted
            return if (allowed) {
                super.onConnect(session, controller)
            } else {
                MediaSession.ConnectionResult.reject()
            }
        }

        override fun onGetLibraryRoot(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<MediaItem>> =
            Futures.immediateFuture(LibraryResult.ofItem(AutoLibrary.rootItem(), params))

        override fun onGetChildren(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            parentId: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> = io.submit<LibraryResult<ImmutableList<MediaItem>>> {
            LibraryResult.ofItemList(paged(AutoLibrary.children(parentId), page, pageSize), params)
        }

        override fun onGetItem(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            mediaId: String,
        ): ListenableFuture<LibraryResult<MediaItem>> =
            Futures.immediateFuture(LibraryResult.ofError(SessionError.ERROR_NOT_SUPPORTED))

        override fun onSearch(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            query: String,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<Void>> = io.submit<LibraryResult<Void>> {
            val results = AutoLibrary.search(query)
            searchResults[query] = results
            session.notifySearchResultChanged(browser, query, results.size, params)
            LibraryResult.ofVoid()
        }

        override fun onGetSearchResult(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            query: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> = io.submit<LibraryResult<ImmutableList<MediaItem>>> {
            val results = searchResults[query] ?: AutoLibrary.search(query)
            LibraryResult.ofItemList(paged(results, page, pageSize), params)
        }

        override fun onSetMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>,
            startIndex: Int,
            startPositionMs: Long,
        ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
            val single = mediaItems.singleOrNull()
            if (single != null && single.localConfiguration == null && single.requestMetadata.mediaUri == null) {
                // A browse selection from Android Auto: queue its whole list.
                return io.submit<MediaSession.MediaItemsWithStartPosition> {
                    val (tracks, index) = AutoLibrary.resolvePlay(single.mediaId)
                        ?: throw IllegalArgumentException("Unknown media item")
                    PlaybackRegistry.externalQueueListener?.invoke(tracks.songsJson, index)
                    MediaSession.MediaItemsWithStartPosition(tracks.items, index, 0)
                }
            }
            return Futures.immediateFuture(
                MediaSession.MediaItemsWithStartPosition(withUris(mediaItems), startIndex, startPositionMs),
            )
        }

        override fun onAddMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>,
        ): ListenableFuture<MutableList<MediaItem>> =
            Futures.immediateFuture(withUris(mediaItems).toMutableList())
    }

    /** Controllers send request metadata only; restore the playable loopback URI. */
    private fun withUris(items: List<MediaItem>): List<MediaItem> = items.mapNotNull { item ->
        when {
            item.localConfiguration != null -> item
            item.requestMetadata.mediaUri != null ->
                item.buildUpon().setUri(item.requestMetadata.mediaUri).build()
            else -> null
        }
    }

    private fun paged(items: List<MediaItem>, page: Int, pageSize: Int): ImmutableList<MediaItem> {
        if (pageSize <= 0 || pageSize == Int.MAX_VALUE) return ImmutableList.copyOf(items)
        val from = (page.toLong() * pageSize).coerceAtMost(items.size.toLong()).toInt()
        val to = (from + pageSize).coerceAtMost(items.size)
        return ImmutableList.copyOf(items.subList(from, to))
    }
}
