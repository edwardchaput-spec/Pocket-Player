use std::{sync::Arc, time::Duration};

use reqwest::{Response, StatusCode, redirect};
use serde_json::Value;
use url::Url;
use zeroize::Zeroizing;

use crate::{
    error::{AppError, AppResult},
    profile::ServerInfo,
};

use super::{
    auth::{CLIENT_ID, PROTOCOL_VERSION, fresh_salt, token_for},
    models::{
        AlbumDetail, AlbumSummary, ArtistDetail, ArtistSummary, Extension, Genre, LyricsList,
        PlaylistDetail, PlaylistSummary, SearchResults,
    },
};

#[derive(Clone)]
pub struct NavidromeClient {
    http: reqwest::Client,
    base_url: Url,
    username: Arc<str>,
    password: Arc<Zeroizing<String>>,
}

impl NavidromeClient {
    pub fn new(base_url: Url, username: String, password: Zeroizing<String>) -> AppResult<Self> {
        Self::with_timeout(base_url, username, password, Duration::from_secs(20))
    }

    #[doc(hidden)]
    pub fn with_timeout(
        base_url: Url,
        username: String,
        password: Zeroizing<String>,
        request_timeout: Duration,
    ) -> AppResult<Self> {
        let expected_host = base_url.host_str().map(str::to_owned);
        let expected_scheme = base_url.scheme().to_owned();
        let expected_port = base_url.port_or_known_default();
        let policy = redirect::Policy::custom(move |attempt| {
            if attempt.previous().len() >= 3 {
                return attempt.error("redirect limit reached");
            }
            let same_origin = attempt.url().host_str() == expected_host.as_deref()
                && attempt.url().scheme() == expected_scheme
                && attempt.url().port_or_known_default() == expected_port;
            if same_origin {
                attempt.follow()
            } else {
                attempt.error("cross-origin redirect rejected")
            }
        });
        let http = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(8))
            .timeout(request_timeout)
            .redirect(policy)
            .user_agent(concat!("NavidromeDesktop/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|_| {
                AppError::new(
                    "HTTP_CLIENT_ERROR",
                    "The network client could not be initialized.",
                    false,
                )
            })?;
        Ok(Self {
            http,
            base_url,
            username: Arc::from(username),
            password: Arc::new(password),
        })
    }

    pub fn base_url(&self) -> &Url {
        &self.base_url
    }

    pub fn username(&self) -> &str {
        &self.username
    }

    pub async fn ping(&self) -> AppResult<ServerInfo> {
        let root = self.request_json("ping", &[]).await?;
        Ok(ServerInfo {
            server_type: root.get("type").and_then(Value::as_str).map(str::to_owned),
            server_version: root
                .get("serverVersion")
                .and_then(Value::as_str)
                .map(str::to_owned),
            open_subsonic_capabilities: Vec::new(),
        })
    }

    pub async fn get_open_subsonic_extensions(&self) -> AppResult<Vec<String>> {
        let root = self.request_json("getOpenSubsonicExtensions", &[]).await?;
        let extensions: Vec<Extension> = serde_json::from_value(
            root.get("openSubsonicExtensions")
                .cloned()
                .unwrap_or_else(|| Value::Array(Vec::new())),
        )
        .map_err(|_| malformed("The server returned malformed capability information."))?;
        Ok(extensions
            .into_iter()
            .map(|extension| extension.name)
            .collect())
    }

    pub async fn get_music_folders(&self) -> AppResult<()> {
        let root = self.request_json("getMusicFolders", &[]).await?;
        require_payload(&root, "musicFolders")?;
        Ok(())
    }

    pub async fn get_newest_albums(&self, size: u32, offset: u32) -> AppResult<Vec<AlbumSummary>> {
        self.get_album_list("newest", size, offset).await
    }

    pub async fn get_album_list(
        &self,
        list_type: &str,
        size: u32,
        offset: u32,
    ) -> AppResult<Vec<AlbumSummary>> {
        const ALLOWED_TYPES: &[&str] = &[
            "random",
            "newest",
            "frequent",
            "recent",
            "starred",
            "alphabeticalByName",
            "alphabeticalByArtist",
            "highest",
            "byYear",
            "byGenre",
        ];
        if !ALLOWED_TYPES.contains(&list_type) {
            return Err(AppError::invalid_input("The album view is not supported."));
        }
        let size = size.clamp(1, 100).to_string();
        let offset = offset.to_string();
        let root = self
            .request_json_retry(
                "getAlbumList2",
                &[("type", list_type), ("size", &size), ("offset", &offset)],
            )
            .await?;
        let album_list = require_payload(&root, "albumList2")?;
        serde_json::from_value(
            album_list
                .get("album")
                .cloned()
                .unwrap_or_else(|| Value::Array(Vec::new())),
        )
        .map_err(|_| malformed("The server returned malformed album data."))
    }

    pub async fn get_album(&self, album_id: &str) -> AppResult<AlbumDetail> {
        validate_id(album_id)?;
        let root = self
            .request_json_retry("getAlbum", &[("id", album_id)])
            .await?;
        serde_json::from_value(require_payload(&root, "album")?.clone())
            .map_err(|_| malformed("The server returned malformed album details."))
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn search(
        &self,
        query: &str,
        artist_offset: u32,
        artist_count: u32,
        song_offset: u32,
        song_count: u32,
        album_offset: u32,
        album_count: u32,
    ) -> AppResult<SearchResults> {
        if query.len() > 500 || query.chars().any(char::is_control) {
            return Err(AppError::invalid_input("The search query is invalid."));
        }
        let artist_offset = artist_offset.to_string();
        let artist_count = artist_count.clamp(0, 500).to_string();
        let album_offset = album_offset.to_string();
        let album_count = album_count.clamp(0, 500).to_string();
        let song_offset = song_offset.to_string();
        let song_count = song_count.clamp(0, 500).to_string();
        let root = self
            .request_json_retry(
                "search3",
                &[
                    ("query", query),
                    ("artistOffset", &artist_offset),
                    ("artistCount", &artist_count),
                    ("albumOffset", &album_offset),
                    ("albumCount", &album_count),
                    ("songOffset", &song_offset),
                    ("songCount", &song_count),
                ],
            )
            .await?;
        serde_json::from_value(require_payload(&root, "searchResult3")?.clone())
            .map_err(|_| malformed("The server returned malformed search results."))
    }

    pub async fn get_artists(&self) -> AppResult<Vec<ArtistSummary>> {
        let root = self.request_json_retry("getArtists", &[]).await?;
        let artists = require_payload(&root, "artists")?;
        let mut result = Vec::new();
        if let Some(indices) = artists.get("index").and_then(Value::as_array) {
            for index in indices {
                let mut group: Vec<ArtistSummary> = serde_json::from_value(
                    index
                        .get("artist")
                        .cloned()
                        .unwrap_or_else(|| Value::Array(Vec::new())),
                )
                .map_err(|_| malformed("The server returned malformed artist data."))?;
                result.append(&mut group);
            }
        }
        Ok(result)
    }

    pub async fn get_artist(&self, artist_id: &str) -> AppResult<ArtistDetail> {
        validate_id(artist_id)?;
        let root = self
            .request_json_retry("getArtist", &[("id", artist_id)])
            .await?;
        serde_json::from_value(require_payload(&root, "artist")?.clone())
            .map_err(|_| malformed("The server returned malformed artist details."))
    }

    pub async fn get_genres(&self) -> AppResult<Vec<Genre>> {
        let root = self.request_json_retry("getGenres", &[]).await?;
        let genres = require_payload(&root, "genres")?;
        serde_json::from_value(
            genres
                .get("genre")
                .cloned()
                .unwrap_or_else(|| Value::Array(Vec::new())),
        )
        .map_err(|_| malformed("The server returned malformed genre data."))
    }

    pub async fn get_songs_by_genre(
        &self,
        genre: &str,
        count: u32,
        offset: u32,
    ) -> AppResult<Vec<super::models::Song>> {
        if genre.trim().is_empty() || genre.len() > 200 || genre.chars().any(char::is_control) {
            return Err(AppError::invalid_input("The genre is invalid."));
        }
        let count = count.clamp(1, 500).to_string();
        let offset = offset.to_string();
        let root = self
            .request_json_retry(
                "getSongsByGenre",
                &[("genre", genre), ("count", &count), ("offset", &offset)],
            )
            .await?;
        let songs = require_payload(&root, "songsByGenre")?;
        serde_json::from_value(
            songs
                .get("song")
                .cloned()
                .unwrap_or_else(|| Value::Array(Vec::new())),
        )
        .map_err(|_| malformed("The server returned malformed genre tracks."))
    }

    pub async fn get_starred(&self) -> AppResult<SearchResults> {
        let root = self.request_json_retry("getStarred2", &[]).await?;
        serde_json::from_value(require_payload(&root, "starred2")?.clone())
            .map_err(|_| malformed("The server returned malformed favourite data."))
    }

    pub async fn get_lyrics(&self, song_id: &str) -> AppResult<LyricsList> {
        validate_id(song_id)?;
        let root = self
            .request_json_retry("getLyricsBySongId", &[("id", song_id)])
            .await?;
        serde_json::from_value(require_payload(&root, "lyricsList")?.clone())
            .map_err(|_| malformed("The server returned malformed lyrics data."))
    }

    pub async fn get_playlists(&self) -> AppResult<Vec<PlaylistSummary>> {
        let root = self.request_json_retry("getPlaylists", &[]).await?;
        let playlists = require_payload(&root, "playlists")?;
        serde_json::from_value(
            playlists
                .get("playlist")
                .cloned()
                .unwrap_or_else(|| Value::Array(Vec::new())),
        )
        .map_err(|_| malformed("The server returned malformed playlist data."))
    }

    pub async fn get_playlist(&self, playlist_id: &str) -> AppResult<PlaylistDetail> {
        validate_id(playlist_id)?;
        let root = self
            .request_json_retry("getPlaylist", &[("id", playlist_id)])
            .await?;
        serde_json::from_value(require_payload(&root, "playlist")?.clone())
            .map_err(|_| malformed("The server returned malformed playlist details."))
    }

    pub async fn set_starred(
        &self,
        item_id: &str,
        item_type: &str,
        starred: bool,
    ) -> AppResult<()> {
        validate_id(item_id)?;
        let key = match item_type {
            "song" => "id",
            "album" => "albumId",
            "artist" => "artistId",
            _ => {
                return Err(AppError::invalid_input(
                    "The favourite item type is invalid.",
                ));
            }
        };
        self.request_json(if starred { "star" } else { "unstar" }, &[(key, item_id)])
            .await?;
        Ok(())
    }

    pub async fn set_rating(&self, item_id: &str, rating: u8) -> AppResult<()> {
        validate_id(item_id)?;
        if rating > 5 {
            return Err(AppError::invalid_input("Ratings must be between 0 and 5."));
        }
        let rating = rating.to_string();
        self.request_json("setRating", &[("id", item_id), ("rating", &rating)])
            .await?;
        Ok(())
    }

    pub async fn create_playlist(
        &self,
        name: &str,
        song_ids: &[String],
    ) -> AppResult<PlaylistDetail> {
        if name.trim().is_empty() || name.len() > 200 || name.chars().any(char::is_control) {
            return Err(AppError::invalid_input("Enter a valid playlist name."));
        }
        for id in song_ids {
            validate_id(id)?;
        }
        let mut query = vec![("name", name)];
        query.extend(song_ids.iter().map(|id| ("songId", id.as_str())));
        let root = self.request_json("createPlaylist", &query).await?;
        serde_json::from_value(require_payload(&root, "playlist")?.clone())
            .map_err(|_| malformed("The server returned malformed playlist details."))
    }

    pub async fn replace_playlist(
        &self,
        playlist_id: &str,
        name: Option<&str>,
        song_ids: &[String],
    ) -> AppResult<PlaylistDetail> {
        validate_id(playlist_id)?;
        for id in song_ids {
            validate_id(id)?;
        }
        let mut query = vec![("playlistId", playlist_id)];
        if let Some(name) = name {
            if name.trim().is_empty() || name.len() > 200 || name.chars().any(char::is_control) {
                return Err(AppError::invalid_input("Enter a valid playlist name."));
            }
            query.push(("name", name));
        }
        query.extend(song_ids.iter().map(|id| ("songId", id.as_str())));
        let root = self.request_json("createPlaylist", &query).await?;
        serde_json::from_value(require_payload(&root, "playlist")?.clone())
            .map_err(|_| malformed("The server returned malformed playlist details."))
    }

    pub async fn delete_playlist(&self, playlist_id: &str) -> AppResult<()> {
        validate_id(playlist_id)?;
        self.request_json("deletePlaylist", &[("id", playlist_id)])
            .await?;
        Ok(())
    }

    pub async fn save_play_queue(
        &self,
        song_ids: &[String],
        current_id: Option<&str>,
        position_ms: u64,
    ) -> AppResult<()> {
        for id in song_ids {
            validate_id(id)?;
        }
        if let Some(id) = current_id {
            validate_id(id)?;
        }
        let position = position_ms.to_string();
        let mut query: Vec<(&str, &str)> = song_ids.iter().map(|id| ("id", id.as_str())).collect();
        if let Some(id) = current_id {
            query.push(("current", id));
        }
        query.push(("position", &position));
        self.request_json("savePlayQueue", &query).await?;
        Ok(())
    }

    pub async fn scrobble(&self, song_id: &str, submission: bool) -> AppResult<()> {
        validate_id(song_id)?;
        self.request_json(
            "scrobble",
            &[
                ("id", song_id),
                ("submission", if submission { "true" } else { "false" }),
            ],
        )
        .await?;
        Ok(())
    }

    pub async fn get_cover_art_response(
        &self,
        cover_id: &str,
        size: Option<u32>,
    ) -> AppResult<Response> {
        validate_id(cover_id)?;
        let size_string = size.map(|value| value.to_string());
        let mut query = vec![("id", cover_id)];
        if let Some(ref value) = size_string {
            query.push(("size", value));
        }
        self.request_raw("getCoverArt", &query, None).await
    }

    pub async fn get_stream_response(
        &self,
        song_id: &str,
        range: Option<&str>,
    ) -> AppResult<Response> {
        validate_id(song_id)?;
        self.request_raw("stream", &[("id", song_id)], range).await
    }

    async fn request_json_retry(&self, endpoint: &str, query: &[(&str, &str)]) -> AppResult<Value> {
        let mut attempts = 0_u8;
        loop {
            match self.request_json(endpoint, query).await {
                Err(error) if error.retryable && attempts < 2 => {
                    attempts += 1;
                    let mut random = [0_u8; 1];
                    let _ = getrandom::fill(&mut random);
                    let jitter = u64::from(random[0] % 75);
                    tokio::time::sleep(Duration::from_millis(100 * u64::from(attempts) + jitter))
                        .await;
                }
                result => return result,
            }
        }
    }

    async fn request_json(&self, endpoint: &str, query: &[(&str, &str)]) -> AppResult<Value> {
        let response = self.request_raw(endpoint, query, None).await?;
        let status = response.status();
        if !status.is_success() {
            return Err(http_status_error(status));
        }
        let value: Value = response
            .json()
            .await
            .map_err(|_| malformed("The server returned invalid JSON."))?;
        parse_envelope(value)
    }

    async fn request_raw(
        &self,
        endpoint: &str,
        query: &[(&str, &str)],
        range: Option<&str>,
    ) -> AppResult<Response> {
        let salt = fresh_salt()?;
        let token = Zeroizing::new(token_for(&self.password, &salt));
        let mut url = self.endpoint_url(endpoint)?;
        {
            let mut pairs = url.query_pairs_mut();
            pairs.extend_pairs(query.iter().copied());
            pairs
                .append_pair("u", &self.username)
                .append_pair("t", &token)
                .append_pair("s", &salt)
                .append_pair("v", PROTOCOL_VERSION)
                .append_pair("c", CLIENT_ID);
            if !matches!(endpoint, "stream" | "getCoverArt") {
                pairs.append_pair("f", "json");
            }
        }
        let mut request = self.http.get(url);
        if let Some(value) = range {
            request = request.header(reqwest::header::RANGE, value);
        }
        request.send().await.map_err(map_reqwest_error)
    }

    fn endpoint_url(&self, endpoint: &str) -> AppResult<Url> {
        if !endpoint.chars().all(|c| c.is_ascii_alphanumeric()) {
            return Err(AppError::invalid_input("Invalid API endpoint."));
        }
        let mut url = self.base_url.clone();
        let base_path = self.base_url.path().trim_end_matches('/');
        url.set_path(&format!("{base_path}/rest/{endpoint}.view"));
        url.set_query(None);
        Ok(url)
    }
}

fn validate_id(id: &str) -> AppResult<()> {
    if id.is_empty() || id.len() > 512 || id.chars().any(char::is_control) {
        Err(AppError::invalid_input("The media identifier is invalid."))
    } else {
        Ok(())
    }
}

fn parse_envelope(value: Value) -> AppResult<Value> {
    let root = value
        .get("subsonic-response")
        .and_then(Value::as_object)
        .ok_or_else(|| malformed("The Subsonic response envelope is missing."))?;
    if root.get("status").and_then(Value::as_str) == Some("ok") {
        return Ok(Value::Object(root.clone()));
    }
    let error = root.get("error").and_then(Value::as_object);
    let code = error
        .and_then(|item| item.get("code"))
        .and_then(Value::as_i64)
        .unwrap_or_default();
    Err(protocol_error(code))
}

fn require_payload<'a>(root: &'a Value, key: &str) -> AppResult<&'a Value> {
    root.get(key)
        .ok_or_else(|| malformed(format!("The successful response did not contain {key}.")))
}

fn protocol_error(code: i64) -> AppError {
    let (app_code, message) = match code {
        10 => (
            "REQUIRED_PARAMETER_MISSING",
            "The server reported a missing API parameter.",
        ),
        20 => (
            "CLIENT_PROTOCOL_INCOMPATIBLE",
            "This client protocol is not supported by the server.",
        ),
        30 => (
            "SERVER_PROTOCOL_INCOMPATIBLE",
            "The server protocol is not compatible with this client.",
        ),
        40 => (
            "INVALID_CREDENTIALS",
            "The username or password is incorrect.",
        ),
        41 => (
            "TOKEN_AUTH_UNSUPPORTED",
            "The server does not support secure token authentication.",
        ),
        42 => (
            "AUTH_MECHANISM_UNSUPPORTED",
            "The server does not support this authentication mechanism.",
        ),
        43 => (
            "AUTH_MECHANISM_CONFLICT",
            "The server rejected conflicting authentication mechanisms.",
        ),
        44 => ("INVALID_API_KEY", "The server rejected the API key."),
        50 => (
            "PERMISSION_DENIED",
            "This account is not authorised for that operation.",
        ),
        70 => ("NOT_FOUND", "The requested Navidrome item was not found."),
        _ => ("SERVER_PROTOCOL_ERROR", "Navidrome rejected the request."),
    };
    AppError::new(app_code, message, false).detail(format!("Subsonic error {code}"))
}

fn malformed(message: impl Into<String>) -> AppError {
    AppError::new("MALFORMED_RESPONSE", message, true)
}

fn http_status_error(status: StatusCode) -> AppError {
    match status {
        StatusCode::UNAUTHORIZED => AppError::new(
            "INVALID_CREDENTIALS",
            "The server rejected the credentials.",
            false,
        ),
        StatusCode::FORBIDDEN => AppError::new(
            "PERMISSION_DENIED",
            "This account is not authorised.",
            false,
        ),
        StatusCode::NOT_FOUND => AppError::new(
            "NOT_FOUND",
            "The requested server endpoint was not found.",
            false,
        ),
        StatusCode::TOO_MANY_REQUESTS => AppError::new(
            "RATE_LIMITED",
            "The server is temporarily rate limiting requests.",
            true,
        ),
        _ if status.is_server_error() => AppError::new(
            "SERVER_UNAVAILABLE",
            "Navidrome is temporarily unavailable.",
            true,
        ),
        _ => AppError::new(
            "HTTP_ERROR",
            "Navidrome returned an unexpected HTTP status.",
            false,
        ),
    }
}

fn map_reqwest_error(error: reqwest::Error) -> AppError {
    if error.is_timeout() {
        AppError::new("TIMEOUT", "The Navidrome request timed out.", true)
    } else if error.is_redirect() {
        AppError::new(
            "REDIRECT_REQUIRES_CANONICAL_URL",
            "The server redirected to a different address. Enter the canonical Navidrome URL.",
            false,
        )
    } else if error.is_connect() {
        AppError::new(
            "SERVER_UNREACHABLE",
            "Navidrome could not be reached.",
            true,
        )
    } else {
        AppError::new("NETWORK_ERROR", "The Navidrome request failed.", true)
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn parses_success_envelope() {
        let root =
            parse_envelope(json!({"subsonic-response": {"status": "ok", "version": "1.16.1"}}))
                .expect("success envelope");
        assert_eq!(root["version"], "1.16.1");
    }

    #[test]
    fn maps_error_40() {
        let error = parse_envelope(
            json!({"subsonic-response": {"status": "failed", "error": {"code": 40}}}),
        )
        .expect_err("must fail");
        assert_eq!(error.code, "INVALID_CREDENTIALS");
    }

    #[test]
    fn maps_error_50() {
        let error = parse_envelope(
            json!({"subsonic-response": {"status": "failed", "error": {"code": 50}}}),
        )
        .expect_err("must fail");
        assert_eq!(error.code, "PERMISSION_DENIED");
    }

    #[test]
    fn missing_payload_is_malformed() {
        let root = json!({"status": "ok"});
        assert_eq!(
            require_payload(&root, "album").expect_err("missing").code,
            "MALFORMED_RESPONSE"
        );
    }
}
