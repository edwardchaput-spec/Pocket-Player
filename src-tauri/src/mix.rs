//! Track Mix generation.
//!
//! The mix is built in four steps:
//!
//! 1. **Filter** the indexed library by the recipe, the user's exclusions and
//!    (by default) audiobooks / spoken word.
//! 2. **Score** every eligible track. Familiarity (stars, ratings, plays) and
//!    novelty (few plays) are blended by the adventure slider; recent skips,
//!    very recent plays and prolific artists are dampened so a 10,000-track
//!    library does not collapse onto the same few hundred songs.
//! 3. **Sample** with Gumbel-top-k: each track's score is perturbed with
//!    seeded Gumbel noise, so every build is a fresh weighted draw (higher
//!    scores are likelier, never guaranteed) while a fixed seed stays
//!    reproducible. Per-source quotas shift with adventure, and per-artist /
//!    per-album caps keep the result varied, relaxing only when the recipe
//!    is too narrow to fill otherwise.
//! 4. **Sequence** the picks so the same artist or album never plays back to
//!    back when it can be avoided.

use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::{
    error::{AppError, AppResult},
    local_data::TrackHistory,
    navidrome::Song,
};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MixInput {
    pub recipe: String,
    #[serde(default)]
    pub seed_track_id: Option<String>,
    #[serde(default)]
    pub seed_artist_id: Option<String>,
    #[serde(default)]
    pub genre: Option<String>,
    #[serde(default)]
    pub year: Option<i32>,
    #[serde(default = "default_length")]
    pub length: usize,
    #[serde(default = "default_adventure")]
    pub adventure: f64,
    #[serde(default)]
    pub excluded_genres: Vec<String>,
    #[serde(default)]
    pub excluded_tags: Vec<String>,
    #[serde(default)]
    pub include_audiobooks: bool,
    #[serde(default)]
    pub random_seed: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MixResult {
    pub seed: String,
    pub items: Vec<MixItem>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MixItem {
    pub track: Song,
    pub reason: String,
    pub score: f64,
}

#[derive(Clone)]
struct Candidate {
    track: Song,
    source: Source,
    reason: String,
    /// Deterministic preference before noise (log-weight).
    affinity: f64,
    /// Affinity plus seeded Gumbel noise; the sampling key.
    key: f64,
    artist_key: String,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
enum Source {
    Related,
    Familiar,
    Recent,
    Underplayed,
    Discovery,
}

const SOURCES: [Source; 5] = [
    Source::Related,
    Source::Familiar,
    Source::Recent,
    Source::Underplayed,
    Source::Discovery,
];

/// Tracks at or above this length are treated as audiobook chapters,
/// DJ sets or similar long-form audio rather than mix material.
const LONG_FORM_SECONDS: u64 = 40 * 60;

pub fn generate_mix(
    songs: Vec<Song>,
    history: &HashMap<String, TrackHistory>,
    input: MixInput,
) -> AppResult<MixResult> {
    generate_mix_at(songs, history, input, Utc::now())
}

fn generate_mix_at(
    songs: Vec<Song>,
    history: &HashMap<String, TrackHistory>,
    input: MixInput,
    now: DateTime<Utc>,
) -> AppResult<MixResult> {
    validate_input(&input)?;
    let seed = input.random_seed.clone().unwrap_or_else(|| {
        let mut bytes = [0_u8; 16];
        let _ = getrandom::fill(&mut bytes);
        hex::encode(bytes)
    });
    let mut random = DeterministicRandom::new(&seed);
    let adventure = input.adventure;

    let seed_track = input
        .seed_track_id
        .as_deref()
        .and_then(|id| songs.iter().find(|song| song.id == id))
        .cloned();
    let seed_genre = input
        .genre
        .clone()
        .or_else(|| seed_track.as_ref().and_then(|song| song.genre.clone()));
    let seed_artist = input
        .seed_artist_id
        .clone()
        .or_else(|| seed_track.as_ref().and_then(|song| song.artist_id.clone()));
    // "Related" is only a meaningful bucket when the recipe has a seed that
    // not every eligible track already matches.
    let related_seed = matches!(
        input.recipe.as_str(),
        "trackMix" | "artistRadio" | "songRadio"
    )
    .then(|| RelatedSeed {
        genre: seed_genre.clone(),
        artist: seed_artist.clone(),
    })
    .filter(|seed| seed.genre.is_some() || seed.artist.is_some());

    let mut audiobooks_skipped = 0_usize;
    let eligible: Vec<Song> = songs
        .into_iter()
        .filter(|song| {
            if !input.include_audiobooks && is_audiobook_like(song) {
                audiobooks_skipped += 1;
                return false;
            }
            recipe_filter(song, &input, seed_genre.as_deref(), seed_artist.as_deref())
        })
        .collect();
    if eligible.is_empty() {
        let mut warnings = vec!["No indexed tracks matched this recipe.".to_owned()];
        if audiobooks_skipped > 0 {
            warnings.push(audiobook_note(audiobooks_skipped));
        }
        return Ok(MixResult {
            seed,
            items: Vec::new(),
            warnings,
        });
    }

    let stats = LibraryStats::new(&eligible);
    let temperature = 0.75 + 0.75 * adventure;
    let mut candidates: Vec<Candidate> = eligible
        .into_iter()
        .map(|track| {
            let local = history.get(&track.id).cloned().unwrap_or_default();
            let artist_key = artist_key(&track);
            let profile = TrackProfile::new(&track, &local, &stats, related_seed.as_ref(), now);
            let artist_tracks = stats.artist_tracks.get(&artist_key).copied().unwrap_or(1);
            let seed_artist_match = related_seed
                .as_ref()
                .and_then(|seed| seed.artist.as_deref())
                .is_some_and(|id| track.artist_id.as_deref() == Some(id));
            let affinity = profile.affinity(adventure, artist_tracks, seed_artist_match);
            let key = affinity + temperature * random.gumbel();
            Candidate {
                source: profile.source,
                reason: profile.reason(&track),
                affinity,
                key,
                artist_key,
                track,
            }
        })
        .collect();
    candidates.sort_by(|left, right| right.key.total_cmp(&left.key));

    let length = input.length.min(candidates.len());
    let mut picker = Picker::new(length, input.recipe == "artistRadio");

    // A seeded radio starts from its seed track.
    if let Some(seed_track) = &seed_track
        && let Some(candidate) = candidates
            .iter()
            .find(|item| item.track.id == seed_track.id)
    {
        picker.take(candidate);
    }

    // Quotas per source, normalised over the sources that actually exist.
    let mut available: HashMap<Source, usize> = HashMap::new();
    for item in &candidates {
        *available.entry(item.source).or_default() += 1;
    }
    let shares: Vec<(Source, f64)> = SOURCES
        .iter()
        .filter(|source| available.get(source).copied().unwrap_or(0) > 0)
        .map(|&source| (source, source.share(adventure, related_seed.is_some())))
        .filter(|(_, share)| *share > 0.0)
        .collect();
    let total_share: f64 = shares.iter().map(|(_, share)| share).sum();
    if total_share > 0.0 {
        for &(source, share) in &shares {
            let target = ((share / total_share) * length as f64).round() as usize;
            picker.fill(
                candidates.iter().filter(|item| item.source == source),
                target,
                Strictness::Strict,
            );
        }
    }
    // Top up from the whole pool, relaxing diversity only as far as needed.
    for strictness in [Strictness::Strict, Strictness::Relaxed, Strictness::Open] {
        picker.fill(candidates.iter(), length, strictness);
    }

    let selected = sequence(picker.selected, &mut random);
    let mut warnings = Vec::new();
    if selected.len() < input.length {
        warnings.push(format!(
            "Only {} tracks matched this recipe; widen the recipe or remove exclusions for a longer mix.",
            selected.len()
        ));
        if audiobooks_skipped > 0 {
            warnings.push(audiobook_note(audiobooks_skipped));
        }
    }
    Ok(MixResult {
        seed,
        items: selected
            .into_iter()
            .map(|candidate| MixItem {
                reason: candidate.reason,
                score: (candidate.affinity * 100.0).round() / 100.0,
                track: candidate.track,
            })
            .collect(),
        warnings,
    })
}

fn audiobook_note(count: usize) -> String {
    format!(
        "{count} audiobook or long-form tracks were left out; turn on \u{201c}Include audiobooks\u{201d} to use them."
    )
}

fn validate_input(input: &MixInput) -> AppResult<()> {
    const RECIPES: &[&str] = &[
        "trackMix",
        "artistRadio",
        "songRadio",
        "genreMix",
        "decadeMix",
        "recentlyAdded",
        "forgottenFavourites",
        "rediscoverYear",
        "lowPlayDiscovery",
    ];
    if !RECIPES.contains(&input.recipe.as_str())
        || !(5..=500).contains(&input.length)
        || !input.adventure.is_finite()
        || !(0.0..=1.0).contains(&input.adventure)
    {
        return Err(AppError::invalid_input("The mix recipe is invalid."));
    }
    if matches!(input.recipe.as_str(), "genreMix")
        && input.genre.as_deref().is_none_or(str::is_empty)
    {
        return Err(AppError::invalid_input("Choose a genre for this mix."));
    }
    if matches!(input.recipe.as_str(), "decadeMix" | "rediscoverYear") && input.year.is_none() {
        return Err(AppError::invalid_input("Choose a year for this mix."));
    }
    Ok(())
}

/// Audiobooks, podcasts and spoken word, recognised from the Subsonic media
/// type, genre tags, folder or album naming, or a chapter-length duration.
pub fn is_audiobook_like(song: &Song) -> bool {
    const GENRE_MARKERS: &[&str] = &[
        "audiobook",
        "audio book",
        "audio-book",
        "spoken",
        "speech",
        "podcast",
        "audio drama",
        "radio play",
        "radio drama",
        "storytelling",
        "lecture",
        "hörbuch",
        "hörspiel",
        "livre audio",
    ];
    const PATH_MARKERS: &[&str] = &[
        "audiobook",
        "audio book",
        "audio-book",
        "podcast",
        "hörbuch",
    ];
    if song.media_type.as_deref().is_some_and(|kind| {
        kind.eq_ignore_ascii_case("audiobook") || kind.eq_ignore_ascii_case("podcast")
    }) {
        return true;
    }
    let genre_matches = |value: &str| {
        let value = value.to_lowercase();
        GENRE_MARKERS.iter().any(|marker| value.contains(marker))
    };
    if song.genre.as_deref().is_some_and(genre_matches)
        || song.genres.iter().any(|genre| genre_matches(&genre.name))
    {
        return true;
    }
    if song.path.as_deref().is_some_and(|path| {
        let path = path.to_lowercase();
        PATH_MARKERS.iter().any(|marker| path.contains(marker))
    }) {
        return true;
    }
    if song.album.as_deref().is_some_and(|album| {
        let album = album.to_lowercase();
        album.contains("unabridged") || album.contains("audiobook")
    }) {
        return true;
    }
    song.duration
        .is_some_and(|seconds| seconds >= LONG_FORM_SECONDS)
}

fn recipe_filter(
    song: &Song,
    input: &MixInput,
    seed_genre: Option<&str>,
    seed_artist: Option<&str>,
) -> bool {
    let excluded_genre = input
        .excluded_genres
        .iter()
        .any(|excluded| shares_genre(song, excluded));
    let excluded_tag = input.excluded_tags.iter().any(|excluded| {
        song.moods
            .iter()
            .any(|tag| tag.eq_ignore_ascii_case(excluded))
            || song
                .comment
                .as_deref()
                .is_some_and(|comment| comment.eq_ignore_ascii_case(excluded))
    });
    if excluded_genre || excluded_tag {
        return false;
    }
    match input.recipe.as_str() {
        "artistRadio" => {
            seed_artist.is_none_or(|id| song.artist_id.as_deref() == Some(id))
                || seed_genre.is_some_and(|genre| shares_genre(song, genre))
        }
        "songRadio" => seed_genre.is_none_or(|genre| shares_genre(song, genre)),
        "genreMix" => input
            .genre
            .as_deref()
            .is_some_and(|genre| shares_genre(song, genre)),
        "decadeMix" => input.year.is_some_and(|year| {
            let decade = year.div_euclid(10) * 10;
            song.year
                .is_some_and(|value| (decade..decade + 10).contains(&value))
        }),
        "recentlyAdded" => song.created.is_some(),
        "forgottenFavourites" => {
            (song.starred.is_some() || song.user_rating.unwrap_or(0) >= 4)
                && song.play_count.unwrap_or(0) < 3
        }
        "rediscoverYear" => song.year == input.year,
        "lowPlayDiscovery" => song.play_count.unwrap_or(0) <= 2,
        _ => true,
    }
}

fn shares_genre(song: &Song, genre: &str) -> bool {
    song.genre
        .as_deref()
        .is_some_and(|value| value.eq_ignore_ascii_case(genre))
        || song
            .genres
            .iter()
            .any(|value| value.name.eq_ignore_ascii_case(genre))
}

fn artist_key(song: &Song) -> String {
    song.artist_id
        .clone()
        .or_else(|| song.artist.as_deref().map(str::to_lowercase))
        .unwrap_or_default()
}

struct RelatedSeed {
    genre: Option<String>,
    artist: Option<String>,
}

struct LibraryStats {
    artist_tracks: HashMap<String, usize>,
    max_plays: f64,
    /// Tracks created at or after this timestamp count as recently added.
    recent_cutoff: Option<String>,
}

impl LibraryStats {
    fn new(songs: &[Song]) -> Self {
        let mut artist_tracks = HashMap::new();
        let mut max_plays = 0_u64;
        let mut created: Vec<&str> = Vec::with_capacity(songs.len());
        for song in songs {
            *artist_tracks.entry(artist_key(song)).or_default() += 1;
            max_plays = max_plays.max(song.play_count.unwrap_or(0));
            if let Some(value) = song.created.as_deref() {
                created.push(value);
            }
        }
        // Newest ~12% by import date (ISO-8601 sorts lexically).
        created.sort_unstable();
        let recent_cutoff = (created.len() >= 8)
            .then(|| created[created.len() - created.len().div_ceil(8)].to_owned())
            .filter(|cutoff| {
                created
                    .first()
                    .is_some_and(|oldest| *oldest < cutoff.as_str())
            });
        Self {
            artist_tracks,
            max_plays: max_plays as f64,
            recent_cutoff,
        }
    }
}

struct TrackProfile {
    source: Source,
    familiarity: f64,
    novelty: f64,
    related: bool,
    penalty: f64,
    plays: u64,
}

impl TrackProfile {
    fn new(
        track: &Song,
        history: &TrackHistory,
        stats: &LibraryStats,
        seed: Option<&RelatedSeed>,
        now: DateTime<Utc>,
    ) -> Self {
        let plays = track.play_count.unwrap_or(0).max(history.completed_plays);
        let rating = f64::from(track.user_rating.unwrap_or(0)) / 5.0;
        let play_share = if stats.max_plays > 0.0 {
            (plays as f64).ln_1p() / stats.max_plays.ln_1p()
        } else {
            0.0
        };
        let starred = if track.starred.is_some() { 0.45 } else { 0.0 };
        let familiarity = (starred + rating * 0.35 + play_share * 0.45).min(1.0);
        let novelty = 1.0 / (1.0 + plays as f64).sqrt();
        let related = seed.is_some_and(|seed| {
            seed.artist
                .as_deref()
                .is_some_and(|id| track.artist_id.as_deref() == Some(id))
                || seed
                    .genre
                    .as_deref()
                    .is_some_and(|genre| shares_genre(track, genre))
        });
        let recent = stats
            .recent_cutoff
            .as_deref()
            .zip(track.created.as_deref())
            .is_some_and(|(cutoff, created)| created >= cutoff);
        let source = if related {
            Source::Related
        } else if track.starred.is_some()
            || track.user_rating.unwrap_or(0) >= 4
            || plays >= 5
            || history.completed_plays >= 3
        {
            Source::Familiar
        } else if recent {
            Source::Recent
        } else if plays <= 1 {
            Source::Underplayed
        } else {
            Source::Discovery
        };
        // Skips, and anything heard in the last few days, rest for a while.
        let mut penalty = (history.skips as f64).min(4.0) * 0.6;
        if let Some(days) = history
            .last_played
            .as_deref()
            .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
            .map(|played| (now - played.with_timezone(&Utc)).num_hours() as f64 / 24.0)
        {
            penalty += if days < 2.0 {
                2.5
            } else if days < 7.0 {
                1.2
            } else if days < 21.0 {
                0.4
            } else {
                0.0
            };
        }
        Self {
            source,
            familiarity,
            novelty,
            related,
            penalty,
            plays,
        }
    }

    fn affinity(&self, adventure: f64, artist_tracks: usize, seed_artist: bool) -> f64 {
        let blend = (1.0 - adventure) * 2.6 * self.familiarity + adventure * 2.6 * self.novelty;
        // Prolific artists would otherwise dominate any weighted draw.
        let artist_damping = if seed_artist {
            0.0
        } else {
            0.45 * (artist_tracks as f64).ln()
        };
        let related = if self.related { 0.6 } else { 0.0 };
        blend + related - artist_damping - self.penalty
    }

    fn reason(&self, track: &Song) -> String {
        match self.source {
            Source::Related => track.genre.as_ref().map_or_else(
                || "Related to the seed".to_owned(),
                |genre| format!("Related by {genre}"),
            ),
            Source::Familiar if track.starred.is_some() => "Favourite".to_owned(),
            Source::Familiar if track.user_rating.unwrap_or(0) >= 4 => {
                format!("Rated {}\u{2605}", track.user_rating.unwrap_or(0))
            }
            Source::Familiar => "Familiar and often played".to_owned(),
            Source::Recent if self.plays == 0 => "Recently added, not yet played".to_owned(),
            Source::Recent => "Recently added".to_owned(),
            Source::Underplayed if self.plays == 0 => "Never played".to_owned(),
            Source::Underplayed => "Barely played".to_owned(),
            Source::Discovery => "From across your library".to_owned(),
        }
    }
}

impl Source {
    /// Relative share of the mix; familiar material yields to
    /// underplayed and discovery picks as adventure rises.
    fn share(self, adventure: f64, seeded: bool) -> f64 {
        match self {
            Self::Related if seeded => 0.30,
            Self::Related => 0.0,
            Self::Familiar => 0.05 + 0.40 * (1.0 - adventure),
            Self::Recent => 0.12,
            Self::Underplayed => 0.08 + 0.32 * adventure,
            Self::Discovery => 0.15 + 0.15 * adventure,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Strictness {
    /// Artist and album caps enforced.
    Strict,
    /// Caps doubled.
    Relaxed,
    /// Only uniqueness enforced.
    Open,
}

struct Picker {
    length: usize,
    artist_cap: usize,
    album_cap: usize,
    exempt_artist_cap: bool,
    selected: Vec<Candidate>,
    ids: HashSet<String>,
    artists: HashMap<String, usize>,
    albums: HashMap<String, usize>,
}

impl Picker {
    fn new(length: usize, exempt_artist_cap: bool) -> Self {
        Self {
            length,
            artist_cap: (length / 20).max(2),
            album_cap: 2,
            exempt_artist_cap,
            selected: Vec::with_capacity(length),
            ids: HashSet::new(),
            artists: HashMap::new(),
            albums: HashMap::new(),
        }
    }

    fn fill<'a>(
        &mut self,
        pool: impl Iterator<Item = &'a Candidate>,
        target: usize,
        strictness: Strictness,
    ) {
        let mut added = 0;
        for candidate in pool {
            if added >= target || self.selected.len() >= self.length {
                break;
            }
            if self.accepts(candidate, strictness) {
                self.take(candidate);
                added += 1;
            }
        }
    }

    fn accepts(&self, candidate: &Candidate, strictness: Strictness) -> bool {
        if self.ids.contains(&candidate.track.id) {
            return false;
        }
        let multiplier = match strictness {
            Strictness::Strict => 1,
            Strictness::Relaxed => 2,
            Strictness::Open => return true,
        };
        let artist_ok = self.exempt_artist_cap
            || candidate.artist_key.is_empty()
            || self
                .artists
                .get(&candidate.artist_key)
                .copied()
                .unwrap_or(0)
                < self.artist_cap * multiplier;
        let album_ok = candidate.track.album_id.as_ref().is_none_or(|album| {
            self.albums.get(album).copied().unwrap_or(0) < self.album_cap * multiplier
        });
        artist_ok && album_ok
    }

    fn take(&mut self, candidate: &Candidate) {
        if !self.ids.insert(candidate.track.id.clone()) {
            return;
        }
        *self
            .artists
            .entry(candidate.artist_key.clone())
            .or_default() += 1;
        if let Some(album) = &candidate.track.album_id {
            *self.albums.entry(album.clone()).or_default() += 1;
        }
        self.selected.push(candidate.clone());
    }
}

/// Orders the picks: shuffled, then greedily spaced so an artist does not
/// repeat within the last few tracks and an album within a wider window.
/// The first pick (the seed track, when one was forced) stays first.
fn sequence(selected: Vec<Candidate>, random: &mut DeterministicRandom) -> Vec<Candidate> {
    const ARTIST_GAP: usize = 4;
    const ALBUM_GAP: usize = 8;
    let mut iter = selected.into_iter();
    let Some(first) = iter.next() else {
        return Vec::new();
    };
    let mut remaining: Vec<Candidate> = iter.collect();
    for index in (1..remaining.len()).rev() {
        let swap = ((random.next() * (index + 1) as f64) as usize).min(index);
        remaining.swap(index, swap);
    }
    let mut ordered = vec![first];
    while !remaining.is_empty() {
        let clashes = |candidate: &Candidate, artist_gap: usize, album_gap: usize| {
            let artist_clash = !candidate.artist_key.is_empty()
                && ordered
                    .iter()
                    .rev()
                    .take(artist_gap)
                    .any(|previous: &Candidate| previous.artist_key == candidate.artist_key);
            let album_clash = candidate.track.album_id.is_some()
                && ordered
                    .iter()
                    .rev()
                    .take(album_gap)
                    .any(|previous: &Candidate| {
                        previous.track.album_id == candidate.track.album_id
                    });
            artist_clash || album_clash
        };
        let position = remaining
            .iter()
            .position(|candidate| !clashes(candidate, ARTIST_GAP, ALBUM_GAP))
            .or_else(|| {
                remaining
                    .iter()
                    .position(|candidate| !clashes(candidate, 1, 1))
            })
            .unwrap_or(0);
        ordered.push(remaining.remove(position));
    }
    ordered
}

fn default_length() -> usize {
    50
}

fn default_adventure() -> f64 {
    0.5
}

struct DeterministicRandom(u64);

impl DeterministicRandom {
    fn new(seed: &str) -> Self {
        let digest = Sha256::digest(seed.as_bytes());
        let mut bytes = [0_u8; 8];
        bytes.copy_from_slice(&digest[..8]);
        Self(u64::from_le_bytes(bytes).max(1))
    }

    /// Uniform in [0, 1).
    fn next(&mut self) -> f64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        (self.0 >> 11) as f64 / (1_u64 << 53) as f64
    }

    /// Standard Gumbel noise for Gumbel-top-k sampling.
    fn gumbel(&mut self) -> f64 {
        let uniform = self.next().clamp(1e-12, 1.0 - 1e-12);
        -(-uniform.ln()).ln()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn song(index: usize, artists: usize, extra: serde_json::Value) -> Song {
        let mut value = serde_json::json!({
            "id": format!("track-{index}"),
            "title": format!("Track {index}"),
            "artist": format!("Artist {}", index % artists),
            "artistId": format!("artist-{}", index % artists),
            "album": format!("Album {}", index % (artists * 3)),
            "albumId": format!("album-{}", index % (artists * 3)),
            "genre": if index.is_multiple_of(2) { "Rock" } else { "Jazz" },
            "duration": 240,
            "playCount": index % 7,
            "created": format!("2024-01-{:02}T00:00:00Z", 1 + index % 28),
        });
        if let (Some(target), Some(extra)) = (value.as_object_mut(), extra.as_object()) {
            for (key, item) in extra {
                target.insert(key.clone(), item.clone());
            }
        }
        serde_json::from_value(value).expect("song")
    }

    fn library(size: usize, artists: usize) -> Vec<Song> {
        (0..size)
            .map(|index| song(index, artists, serde_json::json!({})))
            .collect()
    }

    fn input(length: usize, adventure: f64, seed: &str) -> MixInput {
        MixInput {
            recipe: "trackMix".to_owned(),
            seed_track_id: None,
            seed_artist_id: None,
            genre: None,
            year: None,
            length,
            adventure,
            excluded_genres: Vec::new(),
            excluded_tags: Vec::new(),
            include_audiobooks: false,
            random_seed: Some(seed.to_owned()),
        }
    }

    fn mix(songs: Vec<Song>, request: MixInput) -> MixResult {
        generate_mix_at(songs, &HashMap::new(), request, now()).expect("mix")
    }

    fn ids(result: &MixResult) -> Vec<String> {
        result
            .items
            .iter()
            .map(|item| item.track.id.clone())
            .collect()
    }

    fn now() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-11-07T12:00:00Z")
            .expect("date")
            .with_timezone(&Utc)
    }

    #[test]
    fn fixed_seed_is_deterministic_and_unique() {
        let first = mix(library(200, 40), input(30, 0.5, "fixed"));
        let second = mix(library(200, 40), input(30, 0.5, "fixed"));
        assert_eq!(ids(&first), ids(&second));
        assert_eq!(ids(&first).iter().collect::<HashSet<_>>().len(), 30);
    }

    #[test]
    fn different_seeds_produce_substantially_different_mixes() {
        let songs = library(2_000, 300);
        for adventure in [0.0, 0.5, 1.0] {
            let first = ids(&mix(songs.clone(), input(50, adventure, "a")));
            let second: HashSet<_> = ids(&mix(songs.clone(), input(50, adventure, "b")))
                .into_iter()
                .collect();
            let overlap = first.iter().filter(|id| second.contains(*id)).count();
            assert!(
                overlap < 20,
                "adventure {adventure}: {overlap} of 50 repeated"
            );
        }
    }

    #[test]
    fn spreads_artists_and_avoids_back_to_back_repeats() {
        let result = mix(library(3_000, 120), input(100, 1.0, "spread"));
        assert_eq!(result.items.len(), 100);
        let mut per_artist: HashMap<String, usize> = HashMap::new();
        for item in &result.items {
            *per_artist
                .entry(item.track.artist_id.clone().unwrap_or_default())
                .or_default() += 1;
        }
        assert!(per_artist.values().all(|count| *count <= 5));
        assert!(per_artist.len() >= 20);
        for pair in result.items.windows(2) {
            assert_ne!(pair[0].track.artist_id, pair[1].track.artist_id);
        }
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn narrow_recipes_still_fill_by_relaxing_diversity() {
        // Three artists, sixty tracks: caps must relax to reach 40.
        let result = mix(library(60, 3), input(40, 1.0, "narrow"));
        assert_eq!(result.items.len(), 40);
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn audiobooks_are_excluded_by_default() {
        let mut songs = library(100, 20);
        songs.push(song(1_000, 1, serde_json::json!({ "genre": "Audiobook" })));
        songs.push(song(
            1_001,
            1,
            serde_json::json!({ "genre": "Spoken Word" }),
        ));
        songs.push(song(1_002, 1, serde_json::json!({ "type": "audiobook" })));
        songs.push(song(
            1_003,
            1,
            serde_json::json!({ "path": "Audiobooks/Some Author/Chapter 01.mp3" }),
        ));
        songs.push(song(
            1_004,
            1,
            serde_json::json!({ "album": "A Novel (Unabridged)" }),
        ));
        songs.push(song(1_005, 1, serde_json::json!({ "duration": 3_600 })));
        let excluded: HashSet<_> = (1_000..=1_005)
            .map(|index| format!("track-{index}"))
            .collect();

        let default_mix = mix(songs.clone(), input(100, 1.0, "x"));
        assert!(
            default_mix
                .items
                .iter()
                .all(|item| !excluded.contains(&item.track.id))
        );

        let mut with_books = input(106, 1.0, "x");
        with_books.include_audiobooks = true;
        let with_books = mix(songs, with_books);
        assert_eq!(
            with_books
                .items
                .iter()
                .filter(|item| excluded.contains(&item.track.id))
                .count(),
            6
        );
    }

    #[test]
    fn adventure_shifts_toward_unplayed_tracks() {
        let songs: Vec<Song> = (0..1_000_usize)
            .map(|index| {
                let plays = if index.is_multiple_of(2) { 40 } else { 0 };
                song(
                    index,
                    200,
                    serde_json::json!({ "playCount": plays, "created": null }),
                )
            })
            .collect();
        let unplayed = |adventure: f64| {
            (0..8)
                .map(|run| {
                    mix(songs.clone(), input(50, adventure, &format!("run-{run}")))
                        .items
                        .iter()
                        .filter(|item| item.track.play_count == Some(0))
                        .count()
                })
                .sum::<usize>()
        };
        assert!(unplayed(1.0) > unplayed(0.0) + 100);
    }

    #[test]
    fn recently_played_tracks_rest() {
        let songs = library(40, 40);
        let history: HashMap<String, TrackHistory> = (0..20)
            .map(|index| {
                (
                    format!("track-{index}"),
                    TrackHistory {
                        completed_plays: 1,
                        skips: 0,
                        last_played: Some("2026-11-07T08:00:00Z".to_owned()),
                    },
                )
            })
            .collect();
        let result = generate_mix_at(songs, &history, input(10, 0.5, "rest"), now()).expect("mix");
        let rested = result
            .items
            .iter()
            .filter(|item| history.contains_key(&item.track.id))
            .count();
        assert!(rested <= 3, "{rested} recently played tracks picked");
    }

    #[test]
    fn song_radio_starts_with_its_seed() {
        let mut request = input(20, 0.5, "radio");
        request.recipe = "songRadio".to_owned();
        request.seed_track_id = Some("track-10".to_owned());
        let result = mix(library(200, 30), request);
        assert_eq!(result.items[0].track.id, "track-10");
        assert!(
            result
                .items
                .iter()
                .all(|item| item.track.genre.as_deref() == Some("Rock"))
        );
    }
}
