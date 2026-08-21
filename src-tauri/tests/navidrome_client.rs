use std::time::Duration;

use httpmock::{Method::GET, MockServer};
use navidrome_desktop_lib::navidrome::NavidromeClient;
use serde_json::json;
use url::Url;
use zeroize::Zeroizing;

fn client(server: &MockServer) -> NavidromeClient {
    NavidromeClient::new(
        Url::parse(&server.base_url()).expect("mock server URL"),
        "alice".to_owned(),
        Zeroizing::new("correct horse battery staple".to_owned()),
    )
    .expect("client")
}

fn fast_client(server: &MockServer) -> NavidromeClient {
    NavidromeClient::with_timeout(
        Url::parse(&server.base_url()).expect("mock server URL"),
        "alice".to_owned(),
        Zeroizing::new("test password".to_owned()),
        Duration::from_millis(50),
    )
    .expect("client")
}

#[tokio::test]
async fn successful_ping_reads_safe_server_information() {
    let server = MockServer::start_async().await;
    let mock = server
        .mock_async(|when, then| {
            when.method(GET)
                .path("/rest/ping.view")
                .query_param("u", "alice");
            then.status(200).json_body(json!({
                "subsonic-response": {
                    "status": "ok",
                    "version": "1.16.1",
                    "type": "navidrome",
                    "serverVersion": "0.58.0"
                }
            }));
        })
        .await;
    let info = client(&server).ping().await.expect("ping succeeds");
    assert_eq!(info.server_type.as_deref(), Some("navidrome"));
    assert_eq!(info.server_version.as_deref(), Some("0.58.0"));
    mock.assert_async().await;
}

#[tokio::test]
async fn invalid_credentials_are_mapped_from_protocol_error() {
    let server = MockServer::start_async().await;
    server
        .mock_async(|when, then| {
            when.method(GET).path("/rest/ping.view");
            then.status(200).json_body(json!({
                "subsonic-response": {
                    "status": "failed",
                    "error": {"code": 40, "message": "Wrong username or password"}
                }
            }));
        })
        .await;
    let error = client(&server).ping().await.expect_err("ping must fail");
    assert_eq!(error.code, "INVALID_CREDENTIALS");
    assert!(!error.message.contains("correct horse"));
}

#[tokio::test]
async fn newest_albums_are_typed_and_paginated() {
    let server = MockServer::start_async().await;
    let mock = server
        .mock_async(|when, then| {
            when
                .method(GET)
                .path("/rest/getAlbumList2.view")
                .query_param("type", "newest")
                .query_param("size", "24")
                .query_param("offset", "48");
            then.status(200).json_body(json!({
                "subsonic-response": {
                    "status": "ok",
                    "albumList2": {"album": [{"id": "opaque:album", "name": "A New Album", "artist": "Artist"}]}
                }
            }));
        })
        .await;
    let albums = client(&server)
        .get_newest_albums(24, 48)
        .await
        .expect("albums");
    assert_eq!(albums[0].id, "opaque:album");
    mock.assert_async().await;
}

#[tokio::test]
async fn album_detail_includes_opaque_track_ids() {
    let server = MockServer::start_async().await;
    server
        .mock_async(|when, then| {
            when
                .method(GET)
                .path("/rest/getAlbum.view")
                .query_param("id", "album/string-id");
            then.status(200).json_body(json!({
                "subsonic-response": {
                    "status": "ok",
                    "album": {
                        "id": "album/string-id",
                        "name": "Album",
                        "song": [{"id": "song:alpha", "title": "Track", "discNumber": 1, "track": 1}]
                    }
                }
            }));
        })
        .await;
    let album = client(&server)
        .get_album("album/string-id")
        .await
        .expect("album detail");
    assert_eq!(album.songs[0].id, "song:alpha");

    let frontend_value = serde_json::to_value(&album).expect("frontend album JSON");
    assert_eq!(frontend_value["songs"][0]["id"], "song:alpha");
    assert!(frontend_value.get("song").is_none());
}

#[tokio::test]
async fn artist_songs_preserve_album_order_and_sort_tracks_with_bounded_fan_out() {
    let server = MockServer::start_async().await;
    let artist = server
        .mock_async(|when, then| {
            when.method(GET)
                .path("/rest/getArtist.view")
                .query_param("id", "artist/string-id");
            then.status(200).json_body(json!({
                "subsonic-response": {
                    "status": "ok",
                    "artist": {
                        "id": "artist/string-id",
                        "name": "Artist",
                        "album": [
                            {"id": "album:later-response", "name": "First album"},
                            {"id": "album:earlier-response", "name": "Second album"}
                        ]
                    }
                }
            }));
        })
        .await;
    let first_album = server
        .mock_async(|when, then| {
            when.method(GET)
                .path("/rest/getAlbum.view")
                .query_param("id", "album:later-response");
            then.status(200)
                .delay(Duration::from_millis(50))
                .json_body(json!({
                    "subsonic-response": {
                        "status": "ok",
                        "album": {
                            "id": "album:later-response",
                            "name": "First album",
                            "song": [
                                {"id": "first:disc-two", "title": "Disc two", "discNumber": 2, "track": 1},
                                {"id": "first:track-two", "title": "Track two", "discNumber": 1, "track": 2},
                                {"id": "first:track-one", "title": "Track one", "discNumber": 1, "track": 1}
                            ]
                        }
                    }
                }));
        })
        .await;
    let second_album = server
        .mock_async(|when, then| {
            when.method(GET)
                .path("/rest/getAlbum.view")
                .query_param("id", "album:earlier-response");
            then.status(200).json_body(json!({
                "subsonic-response": {
                    "status": "ok",
                    "album": {
                        "id": "album:earlier-response",
                        "name": "Second album",
                        "song": [
                            {"id": "second:track", "title": "Second album track", "track": 1}
                        ]
                    }
                }
            }));
        })
        .await;

    let songs = client(&server)
        .get_artist_songs("artist/string-id")
        .await
        .expect("artist songs");

    assert_eq!(
        songs
            .iter()
            .map(|song| song.id.as_str())
            .collect::<Vec<_>>(),
        vec![
            "first:track-one",
            "first:track-two",
            "first:disc-two",
            "second:track"
        ]
    );
    artist.assert_calls_async(1).await;
    first_album.assert_calls_async(1).await;
    second_album.assert_calls_async(1).await;
}

#[tokio::test]
async fn artist_songs_fail_without_returning_a_partial_collection() {
    let server = MockServer::start_async().await;
    server
        .mock_async(|when, then| {
            when.method(GET)
                .path("/rest/getArtist.view")
                .query_param("id", "artist:partial");
            then.status(200).json_body(json!({
                "subsonic-response": {
                    "status": "ok",
                    "artist": {
                        "id": "artist:partial",
                        "name": "Artist",
                        "album": [
                            {"id": "album:available", "name": "Available"},
                            {"id": "album:missing", "name": "Missing"}
                        ]
                    }
                }
            }));
        })
        .await;
    server
        .mock_async(|when, then| {
            when.method(GET)
                .path("/rest/getAlbum.view")
                .query_param("id", "album:available");
            then.status(200).json_body(json!({
                "subsonic-response": {
                    "status": "ok",
                    "album": {
                        "id": "album:available",
                        "name": "Available",
                        "song": [{"id": "song:available", "title": "Available"}]
                    }
                }
            }));
        })
        .await;
    server
        .mock_async(|when, then| {
            when.method(GET)
                .path("/rest/getAlbum.view")
                .query_param("id", "album:missing");
            then.status(404);
        })
        .await;

    let error = client(&server)
        .get_artist_songs("artist:partial")
        .await
        .expect_err("a partial artist collection must fail");

    assert_eq!(error.code, "NOT_FOUND");
}

#[tokio::test]
async fn search_preserves_rich_track_tags_for_indexing_and_sorting() {
    let server = MockServer::start_async().await;
    let mock = server
        .mock_async(|when, then| {
            when.method(GET)
                .path("/rest/search3.view")
                .query_param("query", "")
                .query_param("songCount", "500");
            then.status(200).json_body(json!({
                "subsonic-response": {
                    "status": "ok",
                    "searchResult3": {
                        "song": [{
                            "id": "opaque:track",
                            "title": "Indexed Track",
                            "duration": 754,
                            "genre": "Progressive Rock",
                            "genres": [{"name": "Art Rock"}],
                            "moods": ["Energetic"],
                            "bitRate": 1411,
                            "bitDepth": 24,
                            "samplingRate": 96000,
                            "channelCount": 2,
                            "bpm": 128,
                            "musicBrainzId": "musicbrainz-opaque"
                        }]
                    }
                }
            }));
        })
        .await;
    let results = client(&server)
        .search("", 0, 0, 0, 500, 0, 0)
        .await
        .expect("rich search result");
    let track = &results.songs[0];
    assert_eq!(track.duration, Some(754));
    assert_eq!(track.bit_depth, Some(24));
    assert_eq!(track.sampling_rate, Some(96_000));
    assert_eq!(track.genres[0].name, "Art Rock");
    assert_eq!(track.moods, vec!["Energetic"]);
    mock.assert_async().await;
}

#[tokio::test]
async fn malformed_json_is_safe_and_retryable() {
    let server = MockServer::start_async().await;
    server
        .mock_async(|when, then| {
            when.method(GET).path("/rest/ping.view");
            then.status(200)
                .header("content-type", "application/json")
                .body("{broken");
        })
        .await;
    let error = client(&server).ping().await.expect_err("invalid JSON");
    assert_eq!(error.code, "MALFORMED_RESPONSE");
    assert!(error.retryable);
}

#[tokio::test]
async fn timeout_is_bounded_and_typed() {
    let server = MockServer::start_async().await;
    server
        .mock_async(|when, then| {
            when.method(GET).path("/rest/ping.view");
            then.status(200)
                .delay(Duration::from_millis(250))
                .json_body(json!({"subsonic-response": {"status": "ok"}}));
        })
        .await;
    let error = fast_client(&server)
        .ping()
        .await
        .expect_err("must time out");
    assert_eq!(error.code, "TIMEOUT");
}

#[tokio::test]
async fn cross_host_redirect_is_rejected() {
    let source = MockServer::start_async().await;
    let destination = MockServer::start_async().await;
    let location = format!("{}/rest/ping.view", destination.base_url());
    source
        .mock_async(move |when, then| {
            when.method(GET).path("/rest/ping.view");
            then.status(302).header("location", &location);
        })
        .await;
    let error = client(&source)
        .ping()
        .await
        .expect_err("redirect must fail");
    assert_eq!(error.code, "REDIRECT_REQUIRES_CANONICAL_URL");
}

#[tokio::test]
async fn artwork_response_is_streamed_without_json_parsing() {
    let server = MockServer::start_async().await;
    server
        .mock_async(|when, then| {
            when.method(GET)
                .path("/rest/getCoverArt.view")
                .query_param("id", "cover-id")
                .query_param("size", "360");
            then.status(200)
                .header("content-type", "image/jpeg")
                .body("jpeg-bytes");
        })
        .await;
    let response = client(&server)
        .get_cover_art_response("cover-id", Some(360))
        .await
        .expect("artwork");
    assert_eq!(response.status(), 200);
    assert_eq!(response.bytes().await.expect("body"), "jpeg-bytes");
}

#[tokio::test]
async fn stream_forwards_range_and_preserves_partial_status() {
    let server = MockServer::start_async().await;
    let mock = server
        .mock_async(|when, then| {
            when.method(GET)
                .path("/rest/stream.view")
                .query_param("id", "song-id")
                .header("range", "bytes=1024-");
            then.status(206)
                .header("content-type", "audio/flac")
                .header("content-range", "bytes 1024-2047/4096")
                .body("partial-audio");
        })
        .await;
    let response = client(&server)
        .get_stream_response("song-id", Some("bytes=1024-"))
        .await
        .expect("stream");
    assert_eq!(response.status(), 206);
    mock.assert_async().await;
}

#[tokio::test]
async fn upstream_stream_failure_is_returned_without_secret_details() {
    let server = MockServer::start_async().await;
    server
        .mock_async(|when, then| {
            when.method(GET).path("/rest/stream.view");
            then.status(503).body("upstream private diagnostic");
        })
        .await;
    let response = client(&server)
        .get_stream_response("song-id", None)
        .await
        .expect("raw response remains available to proxy");
    assert_eq!(response.status(), 503);
}

#[tokio::test]
async fn now_playing_and_completed_scrobble_use_distinct_submission_values() {
    let server = MockServer::start_async().await;
    let now_playing = server
        .mock_async(|when, then| {
            when.method(GET)
                .path("/rest/scrobble.view")
                .query_param("id", "song-id")
                .query_param("submission", "false");
            then.status(200)
                .json_body(json!({"subsonic-response": {"status": "ok"}}));
        })
        .await;
    let completed = server
        .mock_async(|when, then| {
            when.method(GET)
                .path("/rest/scrobble.view")
                .query_param("id", "song-id")
                .query_param("submission", "true");
            then.status(200)
                .json_body(json!({"subsonic-response": {"status": "ok"}}));
        })
        .await;
    let client = client(&server);
    client
        .scrobble("song-id", false)
        .await
        .expect("now playing");
    client.scrobble("song-id", true).await.expect("completed");
    now_playing.assert_calls_async(1).await;
    completed.assert_calls_async(1).await;
}
