use std::collections::{HashMap, HashSet};

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
    score: f64,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Source {
    Familiar,
    Underplayed,
    Related,
    Recent,
    Discovery,
}

pub fn generate_mix(
    songs: Vec<Song>,
    history: &HashMap<String, TrackHistory>,
    input: MixInput,
) -> AppResult<MixResult> {
    validate_input(&input)?;
    let seed = input.random_seed.clone().unwrap_or_else(|| {
        let mut bytes = [0_u8; 16];
        let _ = getrandom::fill(&mut bytes);
        hex::encode(bytes)
    });
    let seed_track = input
        .seed_track_id
        .as_deref()
        .and_then(|id| songs.iter().find(|song| song.id == id));
    let seed_genre = input
        .genre
        .clone()
        .or_else(|| seed_track.and_then(|song| song.genre.clone()));
    let seed_artist = input
        .seed_artist_id
        .clone()
        .or_else(|| seed_track.and_then(|song| song.artist_id.clone()));
    let mut random = DeterministicRandom::new(&seed);
    let mut warnings = Vec::new();
    let mut candidates: Vec<Candidate> = songs
        .into_iter()
        .filter(|song| recipe_filter(song, &input, seed_genre.as_deref(), seed_artist.as_deref()))
        .map(|track| {
            let local = history.get(&track.id).cloned().unwrap_or_default();
            let source = classify(
                &track,
                &local,
                seed_genre.as_deref(),
                seed_artist.as_deref(),
            );
            let score = score(&track, &local, source, input.adventure, random.next());
            Candidate {
                track,
                source,
                score,
            }
        })
        .collect();
    if candidates.is_empty() {
        return Ok(MixResult {
            seed,
            items: Vec::new(),
            warnings: vec!["No indexed tracks matched this recipe.".to_owned()],
        });
    }
    candidates.sort_by(|left, right| right.score.total_cmp(&left.score));
    let length = input.length.min(candidates.len());
    let targets = [
        (Source::Familiar, length * 30 / 100),
        (Source::Underplayed, length * 25 / 100),
        (Source::Related, length * 20 / 100),
        (Source::Recent, length * 15 / 100),
        (Source::Discovery, length * 10 / 100),
    ];
    let mut selected = Vec::with_capacity(length);
    let mut selected_ids = HashSet::new();
    let mut album_counts: HashMap<String, usize> = HashMap::new();
    for (source, target) in targets {
        let before = selected.len();
        select_from_source(
            &candidates,
            source,
            target,
            &mut selected,
            &mut selected_ids,
            &mut album_counts,
        );
        if selected.len() - before < target {
            warnings.push(format!(
                "The {} source had fewer eligible tracks than requested.",
                source.label()
            ));
        }
    }
    for candidate in &candidates {
        if selected.len() >= length {
            break;
        }
        try_select(
            candidate,
            &mut selected,
            &mut selected_ids,
            &mut album_counts,
            false,
        );
    }
    Ok(MixResult {
        seed,
        items: selected
            .into_iter()
            .map(|candidate| MixItem {
                reason: candidate.source.reason(&candidate.track),
                score: (candidate.score * 100.0).round() / 100.0,
                track: candidate.track,
            })
            .collect(),
        warnings,
    })
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

fn recipe_filter(
    song: &Song,
    input: &MixInput,
    seed_genre: Option<&str>,
    seed_artist: Option<&str>,
) -> bool {
    let excluded_genre = input.excluded_genres.iter().any(|excluded| {
        song.genre
            .as_deref()
            .is_some_and(|genre| genre.eq_ignore_ascii_case(excluded))
            || song
                .genres
                .iter()
                .any(|genre| genre.name.eq_ignore_ascii_case(excluded))
    });
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
                || seed_genre.is_some_and(|genre| song.genre.as_deref() == Some(genre))
        }
        "songRadio" => seed_genre.is_none_or(|genre| song.genre.as_deref() == Some(genre)),
        "genreMix" => input.genre.as_deref() == song.genre.as_deref(),
        "decadeMix" => input.year.is_some_and(|year| {
            let decade = year.div_euclid(10) * 10;
            song.year
                .is_some_and(|value| (decade..decade + 10).contains(&value))
        }),
        "recentlyAdded" => song.created.is_some(),
        "forgottenFavourites" => song.starred.is_some() && song.play_count.unwrap_or(0) < 3,
        "rediscoverYear" => song.year == input.year,
        "lowPlayDiscovery" => song.play_count.unwrap_or(0) <= 2,
        _ => true,
    }
}

fn classify(
    track: &Song,
    history: &TrackHistory,
    seed_genre: Option<&str>,
    seed_artist: Option<&str>,
) -> Source {
    if seed_artist.is_some_and(|id| track.artist_id.as_deref() == Some(id))
        || seed_genre.is_some_and(|genre| track.genre.as_deref() == Some(genre))
    {
        Source::Related
    } else if track.created.is_some() && track.play_count.unwrap_or(0) == 0 {
        Source::Recent
    } else if track.starred.is_some()
        || track.user_rating.unwrap_or(0) >= 4
        || history.completed_plays >= 3
    {
        Source::Familiar
    } else if track.play_count.unwrap_or(0) <= 1 && history.completed_plays == 0 {
        Source::Underplayed
    } else {
        Source::Discovery
    }
}

fn score(track: &Song, history: &TrackHistory, source: Source, adventure: f64, jitter: f64) -> f64 {
    let familiar = f64::from(track.user_rating.unwrap_or(0)) * 4.0
        + if track.starred.is_some() { 12.0 } else { 0.0 }
        + (track.play_count.unwrap_or(0) as f64).ln_1p() * 3.0;
    let discovery =
        18.0 / (1.0 + track.play_count.unwrap_or(0) as f64 + history.completed_plays as f64);
    let source_bonus = match source {
        Source::Related => 18.0,
        Source::Recent => 14.0,
        Source::Underplayed => 12.0,
        Source::Familiar => 10.0,
        Source::Discovery => 8.0,
    };
    familiar * (1.0 - adventure) + discovery * adventure + source_bonus
        - history.skips as f64 * 5.0
        - if history.last_played.is_some() {
            3.0
        } else {
            0.0
        }
        + jitter * 4.0
}

fn select_from_source(
    candidates: &[Candidate],
    source: Source,
    target: usize,
    selected: &mut Vec<Candidate>,
    selected_ids: &mut HashSet<String>,
    album_counts: &mut HashMap<String, usize>,
) {
    for candidate in candidates
        .iter()
        .filter(|candidate| candidate.source == source)
    {
        if selected.iter().filter(|item| item.source == source).count() >= target {
            break;
        }
        try_select(candidate, selected, selected_ids, album_counts, true);
    }
}

fn try_select(
    candidate: &Candidate,
    selected: &mut Vec<Candidate>,
    selected_ids: &mut HashSet<String>,
    album_counts: &mut HashMap<String, usize>,
    enforce_spacing: bool,
) {
    if selected_ids.contains(&candidate.track.id) {
        return;
    }
    if enforce_spacing
        && selected.last().is_some_and(|previous| {
            previous.track.artist_id.is_some()
                && previous.track.artist_id == candidate.track.artist_id
        })
    {
        return;
    }
    if let Some(album_id) = &candidate.track.album_id
        && album_counts.get(album_id).copied().unwrap_or(0) >= 3
    {
        return;
    }
    selected_ids.insert(candidate.track.id.clone());
    if let Some(album_id) = &candidate.track.album_id {
        *album_counts.entry(album_id.clone()).or_default() += 1;
    }
    selected.push(candidate.clone());
}

impl Source {
    fn label(self) -> &'static str {
        match self {
            Self::Familiar => "familiar",
            Self::Underplayed => "underplayed",
            Self::Related => "related",
            Self::Recent => "recent",
            Self::Discovery => "discovery",
        }
    }

    fn reason(self, track: &Song) -> String {
        match self {
            Self::Familiar if track.starred.is_some() => "Favourite".to_owned(),
            Self::Familiar => "Familiar and highly played".to_owned(),
            Self::Underplayed => "Underplayed discovery".to_owned(),
            Self::Related => track.genre.as_ref().map_or_else(
                || "Related to the seed".to_owned(),
                |genre| format!("Related by {genre}"),
            ),
            Self::Recent => "Recently added and unplayed".to_owned(),
            Self::Discovery => "Broad library discovery".to_owned(),
        }
    }
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

    fn next(&mut self) -> f64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0 as f64 / u64::MAX as f64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn songs() -> Vec<Song> {
        (0..20)
            .map(|index| {
                serde_json::from_value(serde_json::json!({
                    "id": format!("track-{index}"),
                    "title": format!("Track {index}"),
                    "artist": format!("Artist {}", index % 5),
                    "artistId": format!("artist-{}", index % 5),
                    "albumId": format!("album-{}", index % 8),
                    "genre": if index % 2 == 0 { "Rock" } else { "Jazz" },
                    "playCount": index,
                }))
                .expect("song")
            })
            .collect()
    }

    #[test]
    fn fixed_seed_is_deterministic_and_unique() {
        let input = MixInput {
            recipe: "trackMix".to_owned(),
            seed_track_id: None,
            seed_artist_id: None,
            genre: None,
            year: None,
            length: 10,
            adventure: 0.5,
            excluded_genres: Vec::new(),
            excluded_tags: Vec::new(),
            random_seed: Some("fixed".to_owned()),
        };
        let first = generate_mix(songs(), &HashMap::new(), input.clone()).expect("mix");
        let second = generate_mix(songs(), &HashMap::new(), input).expect("mix");
        let first_ids: Vec<_> = first.items.iter().map(|item| &item.track.id).collect();
        let second_ids: Vec<_> = second.items.iter().map(|item| &item.track.id).collect();
        assert_eq!(first_ids, second_ids);
        assert_eq!(
            first_ids.iter().collect::<HashSet<_>>().len(),
            first_ids.len()
        );
    }
}
