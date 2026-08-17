use std::collections::HashMap;
use std::{path::PathBuf, sync::Arc};

use chrono::Utc;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use crate::{
    error::{AppError, AppResult},
    navidrome::Song,
};

#[derive(Clone)]
pub struct LocalDatabase {
    path: Arc<PathBuf>,
    write_guard: Arc<Mutex<()>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackEventInput {
    pub event_id: String,
    pub profile_id: String,
    pub playback_session_id: String,
    pub track_id: String,
    pub event_type: String,
    pub position: f64,
    pub listened_ms: u64,
    #[serde(default)]
    pub source_context: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListeningStatistics {
    pub total_listened_ms: u64,
    pub completed_plays: u64,
    pub unique_tracks: u64,
    pub top_tracks: Vec<TopTrack>,
    pub daily: Vec<DailyListening>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopTrack {
    pub track_id: String,
    pub title: String,
    pub artist: Option<String>,
    pub plays: u64,
    pub listened_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyListening {
    pub date: String,
    pub listened_ms: u64,
    pub plays: u64,
}

#[derive(Debug, Clone, Default)]
pub struct TrackHistory {
    pub completed_plays: u64,
    pub skips: u64,
    pub last_played: Option<String>,
}

impl LocalDatabase {
    pub fn open(path: PathBuf) -> AppResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|_| AppError::storage())?;
        }
        let database = Self {
            path: Arc::new(path),
            write_guard: Arc::new(Mutex::new(())),
        };
        database.migrate()?;
        Ok(database)
    }

    fn connection(&self) -> AppResult<Connection> {
        let connection = Connection::open(self.path.as_ref()).map_err(|_| AppError::storage())?;
        connection
            .execute_batch("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")
            .map_err(|_| AppError::storage())?;
        Ok(connection)
    }

    fn migrate(&self) -> AppResult<()> {
        let connection = self.connection()?;
        connection
            .execute_batch(
                "PRAGMA journal_mode = WAL;
                 CREATE TABLE IF NOT EXISTS schema_migrations (
                   version INTEGER PRIMARY KEY,
                   applied_at TEXT NOT NULL
                 );
                 CREATE TABLE IF NOT EXISTS metadata_cache (
                   profile_id TEXT NOT NULL,
                   track_id TEXT NOT NULL,
                   song_json TEXT NOT NULL,
                   cached_at TEXT NOT NULL,
                   PRIMARY KEY (profile_id, track_id)
                 );
                 CREATE INDEX IF NOT EXISTS metadata_cache_profile ON metadata_cache(profile_id);
                 CREATE TABLE IF NOT EXISTS playback_events (
                   event_id TEXT PRIMARY KEY,
                   profile_id TEXT NOT NULL,
                   playback_session_id TEXT NOT NULL,
                   track_id TEXT NOT NULL,
                   event_type TEXT NOT NULL CHECK(event_type IN ('now_playing','completed','skipped','error')),
                   occurred_at TEXT NOT NULL,
                   position REAL NOT NULL,
                   listened_ms INTEGER NOT NULL,
                   source_context TEXT
                 );
                 CREATE UNIQUE INDEX IF NOT EXISTS playback_completed_once
                   ON playback_events(profile_id, playback_session_id, event_type)
                   WHERE event_type = 'completed';
                 CREATE INDEX IF NOT EXISTS playback_events_profile_time
                   ON playback_events(profile_id, occurred_at DESC);
                 INSERT OR IGNORE INTO schema_migrations(version, applied_at)
                   VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ','now'));",
            )
            .map_err(|_| AppError::storage())?;
        Ok(())
    }

    pub async fn replace_track_cache(&self, profile_id: &str, songs: &[Song]) -> AppResult<()> {
        let _guard = self.write_guard.lock().await;
        let path = self.path.clone();
        let profile_id = profile_id.to_owned();
        let songs: Vec<(String, String)> = songs
            .iter()
            .map(|song| {
                serde_json::to_string(song)
                    .map(|json| (song.id.clone(), json))
                    .map_err(|_| AppError::storage())
            })
            .collect::<AppResult<_>>()?;
        tokio::task::spawn_blocking(move || {
            let mut connection = Connection::open(path.as_ref()).map_err(|_| AppError::storage())?;
            let transaction = connection.transaction().map_err(|_| AppError::storage())?;
            transaction
                .execute("DELETE FROM metadata_cache WHERE profile_id = ?1", [&profile_id])
                .map_err(|_| AppError::storage())?;
            let cached_at = Utc::now().to_rfc3339();
            {
                let mut statement = transaction
                    .prepare("INSERT INTO metadata_cache(profile_id, track_id, song_json, cached_at) VALUES (?1, ?2, ?3, ?4)")
                    .map_err(|_| AppError::storage())?;
                for (track_id, song_json) in songs {
                    statement
                        .execute(params![profile_id, track_id, song_json, cached_at])
                        .map_err(|_| AppError::storage())?;
                }
            }
            transaction.commit().map_err(|_| AppError::storage())
        })
        .await
        .map_err(|_| AppError::storage())?
    }

    pub async fn load_track_cache(&self, profile_id: &str) -> AppResult<Vec<Song>> {
        let path = self.path.clone();
        let profile_id = profile_id.to_owned();
        tokio::task::spawn_blocking(move || {
            let connection = Connection::open(path.as_ref()).map_err(|_| AppError::storage())?;
            let mut statement = connection
                .prepare(
                    "SELECT song_json FROM metadata_cache WHERE profile_id = ?1 ORDER BY track_id",
                )
                .map_err(|_| AppError::storage())?;
            let rows = statement
                .query_map([profile_id], |row| row.get::<_, String>(0))
                .map_err(|_| AppError::storage())?;
            let mut songs = Vec::new();
            for row in rows {
                let json = row.map_err(|_| AppError::storage())?;
                if let Ok(song) = serde_json::from_str(&json) {
                    songs.push(song);
                }
            }
            Ok(songs)
        })
        .await
        .map_err(|_| AppError::storage())?
    }

    pub async fn record_event(&self, input: PlaybackEventInput) -> AppResult<()> {
        validate_event(&input)?;
        let _guard = self.write_guard.lock().await;
        let path = self.path.clone();
        tokio::task::spawn_blocking(move || {
            let connection = Connection::open(path.as_ref()).map_err(|_| AppError::storage())?;
            connection
                .execute(
                    "INSERT OR IGNORE INTO playback_events
                     (event_id, profile_id, playback_session_id, track_id, event_type, occurred_at, position, listened_ms, source_context)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                    params![
                        input.event_id,
                        input.profile_id,
                        input.playback_session_id,
                        input.track_id,
                        input.event_type,
                        Utc::now().to_rfc3339(),
                        input.position,
                        i64::try_from(input.listened_ms).unwrap_or(i64::MAX),
                        input.source_context,
                    ],
                )
                .map_err(|_| AppError::storage())?;
            Ok(())
        })
        .await
        .map_err(|_| AppError::storage())?
    }

    pub async fn statistics(&self, profile_id: &str) -> AppResult<ListeningStatistics> {
        let path = self.path.clone();
        let profile_id = profile_id.to_owned();
        tokio::task::spawn_blocking(move || statistics_sync(path.as_ref(), &profile_id))
            .await
            .map_err(|_| AppError::storage())?
    }

    pub async fn track_history(
        &self,
        profile_id: &str,
    ) -> AppResult<HashMap<String, TrackHistory>> {
        let path = self.path.clone();
        let profile_id = profile_id.to_owned();
        tokio::task::spawn_blocking(move || {
            let connection = Connection::open(path.as_ref()).map_err(|_| AppError::storage())?;
            let mut statement = connection
                .prepare(
                    "SELECT track_id,
                            SUM(CASE WHEN event_type = 'completed' THEN 1 ELSE 0 END),
                            SUM(CASE WHEN event_type = 'skipped' THEN 1 ELSE 0 END),
                            MAX(CASE WHEN event_type = 'completed' THEN occurred_at END)
                     FROM playback_events WHERE profile_id = ?1 GROUP BY track_id",
                )
                .map_err(|_| AppError::storage())?;
            let rows = statement
                .query_map([profile_id], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        TrackHistory {
                            completed_plays: row.get::<_, i64>(1)?.max(0) as u64,
                            skips: row.get::<_, i64>(2)?.max(0) as u64,
                            last_played: row.get(3)?,
                        },
                    ))
                })
                .map_err(|_| AppError::storage())?;
            rows.collect::<Result<HashMap<_, _>, _>>()
                .map_err(|_| AppError::storage())
        })
        .await
        .map_err(|_| AppError::storage())?
    }

    pub async fn clear_profile(&self, profile_id: &str) -> AppResult<()> {
        let _guard = self.write_guard.lock().await;
        let path = self.path.clone();
        let profile_id = profile_id.to_owned();
        tokio::task::spawn_blocking(move || {
            let mut connection =
                Connection::open(path.as_ref()).map_err(|_| AppError::storage())?;
            let transaction = connection.transaction().map_err(|_| AppError::storage())?;
            transaction
                .execute(
                    "DELETE FROM metadata_cache WHERE profile_id = ?1",
                    [&profile_id],
                )
                .map_err(|_| AppError::storage())?;
            transaction
                .execute(
                    "DELETE FROM playback_events WHERE profile_id = ?1",
                    [&profile_id],
                )
                .map_err(|_| AppError::storage())?;
            transaction.commit().map_err(|_| AppError::storage())
        })
        .await
        .map_err(|_| AppError::storage())?
    }
}

fn validate_event(input: &PlaybackEventInput) -> AppResult<()> {
    let valid_text = |value: &str, max: usize| {
        !value.is_empty() && value.len() <= max && !value.chars().any(char::is_control)
    };
    if !valid_text(&input.event_id, 100)
        || !valid_text(&input.profile_id, 128)
        || !valid_text(&input.playback_session_id, 100)
        || !valid_text(&input.track_id, 512)
        || !matches!(
            input.event_type.as_str(),
            "now_playing" | "completed" | "skipped" | "error"
        )
        || !input.position.is_finite()
        || input.position < 0.0
    {
        return Err(AppError::invalid_input("The playback event is invalid."));
    }
    Ok(())
}

fn statistics_sync(path: &PathBuf, profile_id: &str) -> AppResult<ListeningStatistics> {
    let connection = Connection::open(path).map_err(|_| AppError::storage())?;
    let (total_listened_ms, completed_plays, unique_tracks): (i64, i64, i64) = connection
        .query_row(
            "SELECT COALESCE(SUM(listened_ms),0), COUNT(*), COUNT(DISTINCT track_id)
             FROM playback_events WHERE profile_id = ?1 AND event_type = 'completed'",
            [profile_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|_| AppError::storage())?;
    let mut top_statement = connection
        .prepare(
            "SELECT e.track_id, COUNT(*), SUM(e.listened_ms), m.song_json
             FROM playback_events e
             LEFT JOIN metadata_cache m ON m.profile_id = e.profile_id AND m.track_id = e.track_id
             WHERE e.profile_id = ?1 AND e.event_type = 'completed'
             GROUP BY e.track_id ORDER BY COUNT(*) DESC, SUM(e.listened_ms) DESC LIMIT 20",
        )
        .map_err(|_| AppError::storage())?;
    let top_rows = top_statement
        .query_map([profile_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        })
        .map_err(|_| AppError::storage())?;
    let mut top_tracks = Vec::new();
    for row in top_rows {
        let (track_id, plays, listened_ms, song_json) = row.map_err(|_| AppError::storage())?;
        let song: Option<Song> = song_json
            .as_deref()
            .and_then(|json| serde_json::from_str(json).ok());
        top_tracks.push(TopTrack {
            title: song
                .as_ref()
                .map_or_else(|| "Unknown track".to_owned(), |item| item.title.clone()),
            artist: song.and_then(|item| item.artist),
            track_id,
            plays: plays.max(0) as u64,
            listened_ms: listened_ms.max(0) as u64,
        });
    }
    let mut daily_statement = connection
        .prepare(
            "SELECT substr(occurred_at,1,10), SUM(listened_ms), COUNT(*)
             FROM playback_events WHERE profile_id = ?1 AND event_type = 'completed'
             GROUP BY substr(occurred_at,1,10) ORDER BY 1 DESC LIMIT 31",
        )
        .map_err(|_| AppError::storage())?;
    let daily = daily_statement
        .query_map([profile_id], |row| {
            Ok(DailyListening {
                date: row.get(0)?,
                listened_ms: row.get::<_, i64>(1)?.max(0) as u64,
                plays: row.get::<_, i64>(2)?.max(0) as u64,
            })
        })
        .map_err(|_| AppError::storage())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| AppError::storage())?;
    Ok(ListeningStatistics {
        total_listened_ms: total_listened_ms.max(0) as u64,
        completed_plays: completed_plays.max(0) as u64,
        unique_tracks: unique_tracks.max(0) as u64,
        top_tracks,
        daily,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_event_types_and_positions() {
        let mut input = PlaybackEventInput {
            event_id: "event".to_owned(),
            profile_id: "profile".to_owned(),
            playback_session_id: "session".to_owned(),
            track_id: "track".to_owned(),
            event_type: "completed".to_owned(),
            position: 30.0,
            listened_ms: 30_000,
            source_context: None,
        };
        assert!(validate_event(&input).is_ok());
        input.event_type = "invented".to_owned();
        assert_eq!(
            validate_event(&input).expect_err("invalid type").code,
            "INVALID_INPUT"
        );
    }

    #[test]
    fn database_migration_is_repeatable() {
        let path = std::env::temp_dir().join(format!(
            "navidrome-desktop-migration-{}.sqlite3",
            uuid::Uuid::new_v4()
        ));
        let database = LocalDatabase::open(path.clone()).expect("first migration");
        LocalDatabase::open(path.clone()).expect("repeat migration");
        let version: i64 = database
            .connection()
            .expect("migration database")
            .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
                row.get(0)
            })
            .expect("schema version");
        assert_eq!(version, 1);
        drop(database);
        for candidate in [
            path.clone(),
            PathBuf::from(format!("{}-wal", path.display())),
            PathBuf::from(format!("{}-shm", path.display())),
        ] {
            let _ = std::fs::remove_file(candidate);
        }
    }
}
