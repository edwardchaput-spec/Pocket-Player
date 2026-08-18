use std::{
    cmp::Ordering,
    collections::{BTreeMap, BTreeSet, HashMap, HashSet},
    sync::Arc,
};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tokio::sync::{Mutex, RwLock};

use crate::{
    error::{AppError, AppResult},
    local_data::LocalDatabase,
    navidrome::{NavidromeClient, Song},
};

const INDEX_BATCH_SIZE: u32 = 500;
const MAX_INDEXED_TRACKS: usize = 250_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryIndexStatus {
    pub ready: bool,
    pub track_count: usize,
    pub refreshed_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackQuery {
    #[serde(default)]
    pub query: String,
    #[serde(default)]
    pub genre: Option<String>,
    #[serde(default)]
    pub tag: Option<String>,
    #[serde(default = "default_sort")]
    pub sort_by: String,
    #[serde(default)]
    pub descending: bool,
    #[serde(default)]
    pub offset: usize,
    #[serde(default = "default_page_size")]
    pub size: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackQueryResult {
    pub tracks: Vec<Song>,
    pub total: usize,
    pub refreshed_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagSummary {
    pub name: String,
    pub song_count: usize,
    pub album_count: usize,
    pub categories: Vec<String>,
}

pub struct LibraryIndex {
    database: Arc<LocalDatabase>,
    data: RwLock<Option<Arc<IndexedLibrary>>>,
    refresh_guard: Mutex<()>,
}

struct IndexedLibrary {
    tracks: Vec<IndexedSong>,
    tags: Vec<TagSummary>,
    tag_tracks: HashMap<String, Vec<usize>>,
    refreshed_at: String,
}

struct IndexedSong {
    song: Song,
    search_text: String,
    genre_text: String,
    tags: Vec<IndexedTag>,
}

struct IndexedTag {
    key: String,
    name: String,
    categories: BTreeSet<String>,
}

impl LibraryIndex {
    pub fn new(database: Arc<LocalDatabase>) -> Self {
        Self {
            database,
            data: RwLock::new(None),
            refresh_guard: Mutex::new(()),
        }
    }

    pub async fn clear(&self) {
        *self.data.write().await = None;
    }

    pub async fn activate(&self, profile_id: &str) -> AppResult<()> {
        let songs = self.database.load_track_cache(profile_id).await?;
        *self.data.write().await = if songs.is_empty() {
            None
        } else {
            Some(Arc::new(IndexedLibrary::new(
                songs,
                Utc::now().to_rfc3339(),
            )))
        };
        Ok(())
    }

    pub async fn status(&self) -> LibraryIndexStatus {
        let data = self.data.read().await;
        LibraryIndexStatus {
            ready: data.is_some(),
            track_count: data.as_ref().map_or(0, |index| index.tracks.len()),
            refreshed_at: data.as_ref().map(|index| index.refreshed_at.clone()),
        }
    }

    pub async fn refresh(
        &self,
        client: &NavidromeClient,
        profile_id: &str,
    ) -> AppResult<LibraryIndexStatus> {
        let _guard = self.refresh_guard.lock().await;
        let mut songs = Vec::new();
        let mut offset = 0_u32;
        loop {
            let page = client
                .search("", 0, 0, offset, INDEX_BATCH_SIZE, 0, 0)
                .await?
                .songs;
            let page_len = page.len();
            songs.extend(page);
            if songs.len() > MAX_INDEXED_TRACKS {
                return Err(AppError::new(
                    "LIBRARY_TOO_LARGE",
                    "The library exceeds the current 250,000-track index limit.",
                    false,
                ));
            }
            if page_len < INDEX_BATCH_SIZE as usize {
                break;
            }
            offset = offset.saturating_add(INDEX_BATCH_SIZE);
        }

        let refreshed_at = Utc::now().to_rfc3339();
        self.database
            .replace_track_cache(profile_id, &songs)
            .await?;
        let indexed = Arc::new(IndexedLibrary::new(songs, refreshed_at.clone()));
        let track_count = indexed.tracks.len();
        *self.data.write().await = Some(indexed);
        Ok(LibraryIndexStatus {
            ready: true,
            track_count,
            refreshed_at: Some(refreshed_at),
        })
    }

    pub async fn query(
        &self,
        client: &NavidromeClient,
        profile_id: &str,
        input: TrackQuery,
    ) -> AppResult<TrackQueryResult> {
        if self.data.read().await.is_none() {
            self.refresh(client, profile_id).await?;
        }
        let index = self.data.read().await.clone().ok_or_else(|| {
            AppError::new(
                "INDEX_UNAVAILABLE",
                "The library index is unavailable.",
                true,
            )
        })?;
        let size = input.size.clamp(1, 500);
        let query_terms: Vec<String> = input
            .query
            .split_whitespace()
            .map(|term| term.to_lowercase())
            .collect();
        let genre = input
            .genre
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_lowercase);
        let tag = input
            .tag
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_lowercase);
        let candidates: Vec<&IndexedSong> = tag.as_ref().map_or_else(
            || index.tracks.iter().collect(),
            |value| {
                index
                    .tag_tracks
                    .get(value)
                    .into_iter()
                    .flatten()
                    .filter_map(|track_index| index.tracks.get(*track_index))
                    .collect()
            },
        );
        let mut matches: Vec<&IndexedSong> = candidates
            .into_iter()
            .filter(|track| {
                query_terms
                    .iter()
                    .all(|term| track.search_text.contains(term))
            })
            .filter(|track| {
                genre
                    .as_ref()
                    .is_none_or(|value| track.genre_text == *value)
            })
            .collect();
        validate_sort(&input.sort_by)?;
        matches.sort_by(|left, right| compare_songs(&left.song, &right.song, &input.sort_by));
        if input.descending {
            matches.reverse();
        }
        let total = matches.len();
        let tracks = matches
            .into_iter()
            .skip(input.offset.min(total))
            .take(size)
            .map(|track| track.song.clone())
            .collect();
        Ok(TrackQueryResult {
            tracks,
            total,
            refreshed_at: index.refreshed_at.clone(),
        })
    }

    pub async fn all_songs(
        &self,
        client: &NavidromeClient,
        profile_id: &str,
    ) -> AppResult<Vec<Song>> {
        if self.data.read().await.is_none() {
            self.refresh(client, profile_id).await?;
        }
        let data = self.data.read().await;
        Ok(data
            .as_ref()
            .map(|index| {
                index
                    .tracks
                    .iter()
                    .map(|track| track.song.clone())
                    .collect()
            })
            .unwrap_or_default())
    }

    pub async fn tags(
        &self,
        client: &NavidromeClient,
        profile_id: &str,
    ) -> AppResult<Vec<TagSummary>> {
        if self.data.read().await.is_none() {
            self.refresh(client, profile_id).await?;
        }
        Ok(self
            .data
            .read()
            .await
            .as_ref()
            .map(|index| index.tags.clone())
            .unwrap_or_default())
    }
}

impl IndexedLibrary {
    fn new(songs: Vec<Song>, refreshed_at: String) -> Self {
        let tracks: Vec<IndexedSong> = songs.into_iter().map(IndexedSong::new).collect();
        let mut accumulators: BTreeMap<String, TagAccumulator> = BTreeMap::new();
        let mut tag_tracks: HashMap<String, Vec<usize>> = HashMap::new();
        for (track_index, track) in tracks.iter().enumerate() {
            let album_key = track
                .song
                .album_id
                .as_deref()
                .or(track.song.album.as_deref())
                .map(str::to_lowercase);
            for tag in &track.tags {
                tag_tracks
                    .entry(tag.key.clone())
                    .or_default()
                    .push(track_index);
                let accumulator = accumulators
                    .entry(tag.key.clone())
                    .or_insert_with(|| TagAccumulator::new(tag.name.clone()));
                accumulator.song_count += 1;
                accumulator
                    .categories
                    .extend(tag.categories.iter().cloned());
                if let Some(album) = &album_key {
                    accumulator.albums.insert(album.clone());
                }
            }
        }
        let tags = accumulators
            .into_values()
            .map(|tag| TagSummary {
                name: tag.name,
                song_count: tag.song_count,
                album_count: tag.albums.len(),
                categories: tag.categories.into_iter().collect(),
            })
            .collect();
        Self {
            tracks,
            tags,
            tag_tracks,
            refreshed_at,
        }
    }
}

struct TagAccumulator {
    name: String,
    song_count: usize,
    albums: HashSet<String>,
    categories: BTreeSet<String>,
}

impl TagAccumulator {
    fn new(name: String) -> Self {
        Self {
            name,
            song_count: 0,
            albums: HashSet::new(),
            categories: BTreeSet::new(),
        }
    }
}

impl IndexedSong {
    fn new(song: Song) -> Self {
        let genre_text = song.genre.clone().unwrap_or_default().to_lowercase();
        let tags = indexed_tags(&song);
        let search_text = [
            Some(song.title.as_str()),
            song.artist.as_deref(),
            song.display_artist.as_deref(),
            song.album.as_deref(),
            song.display_album_artist.as_deref(),
            song.genre.as_deref(),
            song.suffix.as_deref(),
            song.comment.as_deref(),
            song.music_brainz_id.as_deref(),
        ]
        .into_iter()
        .flatten()
        .chain(song.genres.iter().map(|genre| genre.name.as_str()))
        .chain(song.moods.iter().map(String::as_str))
        .collect::<Vec<_>>()
        .join("\u{1f}")
        .to_lowercase();
        Self {
            song,
            search_text,
            genre_text,
            tags,
        }
    }
}

fn indexed_tags(song: &Song) -> Vec<IndexedTag> {
    let mut values: BTreeMap<String, (String, BTreeSet<String>)> = BTreeMap::new();
    let mut add = |name: &str, category: &str| {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return;
        }
        let key = trimmed.to_lowercase();
        let entry = values
            .entry(key)
            .or_insert_with(|| (trimmed.to_owned(), BTreeSet::new()));
        entry.1.insert(category.to_owned());
    };
    if let Some(genre) = &song.genre {
        add(genre, "Genre");
    }
    for genre in &song.genres {
        add(&genre.name, "Genre");
    }
    for mood in &song.moods {
        add(mood, "Mood");
    }
    values
        .into_iter()
        .map(|(key, (name, categories))| IndexedTag {
            key,
            name,
            categories,
        })
        .collect()
}

fn default_sort() -> String {
    "title".to_owned()
}

fn default_page_size() -> usize {
    100
}

fn validate_sort(sort_by: &str) -> AppResult<()> {
    const SORT_FIELDS: &[&str] = &[
        "title",
        "artist",
        "album",
        "year",
        "genre",
        "duration",
        "track",
        "discNumber",
        "playCount",
        "rating",
        "starred",
        "bitRate",
        "bitDepth",
        "samplingRate",
        "channelCount",
        "size",
        "suffix",
        "created",
        "bpm",
    ];
    if SORT_FIELDS.contains(&sort_by) {
        Ok(())
    } else {
        Err(AppError::invalid_input(
            "The requested track sort is not supported.",
        ))
    }
}

fn compare_songs(left: &Song, right: &Song, field: &str) -> Ordering {
    let ordering = match field {
        "artist" => compare_text(left.artist.as_deref(), right.artist.as_deref()),
        "album" => compare_text(left.album.as_deref(), right.album.as_deref()),
        "year" => left.year.cmp(&right.year),
        "genre" => compare_text(left.genre.as_deref(), right.genre.as_deref()),
        "duration" => left.duration.cmp(&right.duration),
        "track" => left.track.cmp(&right.track),
        "discNumber" => left.disc_number.cmp(&right.disc_number),
        "playCount" => left.play_count.cmp(&right.play_count),
        "rating" => left.user_rating.cmp(&right.user_rating),
        "starred" => left.starred.is_some().cmp(&right.starred.is_some()),
        "bitRate" => left.bit_rate.cmp(&right.bit_rate),
        "bitDepth" => left.bit_depth.cmp(&right.bit_depth),
        "samplingRate" => left.sampling_rate.cmp(&right.sampling_rate),
        "channelCount" => left.channel_count.cmp(&right.channel_count),
        "size" => left.size.cmp(&right.size),
        "suffix" => compare_text(left.suffix.as_deref(), right.suffix.as_deref()),
        "created" => compare_text(left.created.as_deref(), right.created.as_deref()),
        "bpm" => left.bpm.cmp(&right.bpm),
        _ => compare_text(Some(&left.title), Some(&right.title)),
    };
    ordering.then_with(|| left.title.to_lowercase().cmp(&right.title.to_lowercase()))
}

fn compare_text(left: Option<&str>, right: Option<&str>) -> Ordering {
    left.unwrap_or_default()
        .to_lowercase()
        .cmp(&right.unwrap_or_default().to_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn song(id: &str, title: &str, duration: u64, genre: &str) -> Song {
        serde_json::from_value(serde_json::json!({
            "id": id,
            "title": title,
            "duration": duration,
            "genre": genre,
            "artist": "An Artist",
            "moods": ["Energetic"]
        }))
        .expect("song fixture")
    }

    #[test]
    fn duration_sort_is_numeric() {
        let short = song("short", "Short", 59, "Rock");
        let long = song("long", "Long", 600, "Rock");
        assert_eq!(compare_songs(&short, &long, "duration"), Ordering::Less);
    }

    #[test]
    fn search_index_contains_useful_tags() {
        let indexed = IndexedSong::new(song("one", "Song", 100, "Rock"));
        assert!(indexed.search_text.contains("rock"));
        assert!(indexed.search_text.contains("energetic"));
        assert!(indexed.search_text.contains("an artist"));
    }

    #[test]
    fn builds_a_deduplicated_exact_tag_catalogue() {
        let first: Song = serde_json::from_value(serde_json::json!({
            "id": "one",
            "title": "First",
            "album": "One album",
            "albumId": "album-one",
            "genre": "Rock",
            "genres": [{ "name": "rock" }, { "name": "Alternative" }],
            "moods": ["Energetic"]
        }))
        .expect("first song");
        let second: Song = serde_json::from_value(serde_json::json!({
            "id": "two",
            "title": "Second",
            "album": "Two album",
            "albumId": "album-two",
            "genres": [{ "name": "Alternative" }],
            "moods": ["Energetic"]
        }))
        .expect("second song");
        let library = IndexedLibrary::new(vec![first, second], "now".to_owned());

        let rock = library
            .tags
            .iter()
            .find(|tag| tag.name.eq_ignore_ascii_case("rock"))
            .expect("rock tag");
        assert_eq!(rock.song_count, 1);
        assert_eq!(rock.album_count, 1);
        let energetic = library
            .tags
            .iter()
            .find(|tag| tag.name == "Energetic")
            .expect("mood tag");
        assert_eq!(energetic.song_count, 2);
        assert_eq!(energetic.categories, vec!["Mood"]);

        let indexed = &library.tracks[0];
        assert_eq!(
            indexed.tags.iter().filter(|tag| tag.key == "rock").count(),
            1
        );
        assert_eq!(library.tag_tracks.get("rock"), Some(&vec![0]));
    }
}
