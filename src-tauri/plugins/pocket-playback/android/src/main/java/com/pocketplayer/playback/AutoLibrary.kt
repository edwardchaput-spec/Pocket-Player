package com.pocketplayer.playback

import android.net.Uri
import android.os.Bundle
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Android Auto browse tree backed by the Rust loopback proxy's read-only
 * `auto/children` and `auto/tracks` endpoints. Navidrome IDs are opaque; they only travel inside node
 * strings (`kind:id`) and are percent-encoded on the wire.
 *
 * Media IDs:
 * - browsable nodes use the node string itself, e.g. `album:<id>`;
 * - playable tracks use `play:<encoded node>:<index>` so selecting a track
 *   queues the whole album, playlist, or result list from that position.
 */
object AutoLibrary {
    const val ROOT = "root"
    private const val PLAY_PREFIX = "play:"
    const val SONG_ID_EXTRA = "pocketplayer.songId"

    class Tracks(val items: List<MediaItem>, val songsJson: String)

    fun rootItem(): MediaItem = browsable(ROOT, "Pocket Player", null, null)

    /** Blocking; call from a background executor. */
    fun children(node: String): List<MediaItem> {
        val body = get("/auto/children?node=${Uri.encode(node)}") ?: return emptyList()
        val items = JSONObject(body).getJSONArray("items")
        return (0 until items.length()).map { index ->
            val item = items.getJSONObject(index)
            val id = item.getString("id")
            val title = item.getString("title")
            val subtitle = item.optStringOrNull("subtitle")
            val artwork = item.optStringOrNull("coverArt")?.let(::artworkUri)
            if (item.optBoolean("browsable")) {
                browsable(id, title, subtitle, artwork)
            } else {
                MediaItem.Builder()
                    .setMediaId("$PLAY_PREFIX${Uri.encode(node)}:$index")
                    .setMediaMetadata(
                        MediaMetadata.Builder()
                            .setTitle(title)
                            .setArtist(subtitle)
                            .setArtworkUri(artwork)
                            .setIsBrowsable(false)
                            .setIsPlayable(true)
                            .build(),
                    )
                    .build()
            }
        }
    }

    /** Resolves a `play:` media ID into a playable queue and its start index. */
    fun resolvePlay(mediaId: String): Pair<Tracks, Int>? {
        if (!mediaId.startsWith(PLAY_PREFIX)) return null
        val rest = mediaId.removePrefix(PLAY_PREFIX)
        val separator = rest.lastIndexOf(':')
        if (separator <= 0) return null
        val node = Uri.decode(rest.substring(0, separator))
        val index = rest.substring(separator + 1).toIntOrNull() ?: return null
        val tracks = tracks(node) ?: return null
        if (index !in tracks.items.indices) return null
        return tracks to index
    }

    /** Blocking; returns playable items for an album, playlist, or search node. */
    fun tracks(node: String): Tracks? {
        val body = get("/auto/tracks?node=${Uri.encode(node)}") ?: return null
        val songs = JSONObject(body).getJSONArray("songs")
        val items = (0 until songs.length()).map { toMediaItem(songs.getJSONObject(it), "auto-$it") }
        return Tracks(items, songs.toString())
    }

    fun toMediaItem(song: JSONObject, mediaId: String): MediaItem {
        val base = PlaybackRegistry.proxyBaseUrl.orEmpty()
        val songId = song.getString("id")
        val uri = Uri.parse("$base/stream/${Uri.encode(songId)}")
        val extras = Bundle().apply { putString(SONG_ID_EXTRA, songId) }
        return MediaItem.Builder()
            .setMediaId(mediaId)
            .setUri(uri)
            .setRequestMetadata(MediaItem.RequestMetadata.Builder().setMediaUri(uri).build())
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(song.optString("title"))
                    .setArtist(song.optStringOrNull("displayArtist") ?: song.optStringOrNull("artist"))
                    .setAlbumTitle(song.optStringOrNull("album"))
                    .setArtworkUri(song.optStringOrNull("coverArt")?.let(::artworkUri))
                    .setIsBrowsable(false)
                    .setIsPlayable(true)
                    .setExtras(extras)
                    .build(),
            )
            .build()
    }

    fun search(query: String): List<MediaItem> = children("search:$query")

    private fun browsable(id: String, title: String, subtitle: String?, artwork: Uri?): MediaItem =
        MediaItem.Builder()
            .setMediaId(id)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(title)
                    .setSubtitle(subtitle)
                    .setArtworkUri(artwork)
                    .setIsBrowsable(true)
                    .setIsPlayable(false)
                    .build(),
            )
            .build()

    private fun artworkUri(coverArt: String): Uri? {
        val base = PlaybackRegistry.proxyBaseUrl ?: return null
        return Uri.parse("$base/cover/${Uri.encode(coverArt)}?size=300")
    }

    private fun get(path: String): String? {
        val base = PlaybackRegistry.proxyBaseUrl ?: return null
        val connection = URL(base + path).openConnection() as HttpURLConnection
        return try {
            connection.connectTimeout = 5_000
            connection.readTimeout = 20_000
            if (connection.responseCode != 200) null
            else connection.inputStream.bufferedReader().use { it.readText() }
        } catch (_: Exception) {
            null
        } finally {
            connection.disconnect()
        }
    }

    private fun JSONObject.optStringOrNull(key: String): String? =
        if (!has(key) || isNull(key)) null else optString(key).takeIf { it.isNotEmpty() }
}
