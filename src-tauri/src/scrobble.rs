use std::{collections::HashMap, sync::Arc};

use tokio::sync::Mutex;

use crate::{
    error::{AppError, AppResult},
    navidrome::NavidromeClient,
};

#[derive(Debug, Default)]
struct SubmissionState {
    track_id: String,
    now_playing_in_flight: bool,
    now_playing_accepted: bool,
    completed_in_flight: bool,
    completed_accepted: bool,
}

#[derive(Default)]
pub struct ScrobbleRegistry {
    sessions: Mutex<HashMap<String, SubmissionState>>,
}

impl ScrobbleRegistry {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    pub async fn report(
        &self,
        client: &NavidromeClient,
        playback_session_id: &str,
        track_id: &str,
        submission: bool,
    ) -> AppResult<bool> {
        if playback_session_id.is_empty() || playback_session_id.len() > 128 {
            return Err(AppError::invalid_input(
                "The playback session identifier is invalid.",
            ));
        }
        let reserved = {
            let mut sessions = self.sessions.lock().await;
            if sessions.len() > 4096 {
                sessions.retain(|_, state| !state.completed_accepted);
            }
            let state = sessions
                .entry(playback_session_id.to_owned())
                .or_insert_with(|| SubmissionState {
                    track_id: track_id.to_owned(),
                    ..SubmissionState::default()
                });
            if state.track_id != track_id {
                return Err(AppError::invalid_input(
                    "A playback session cannot be reused for another track.",
                ));
            }
            reserve(state, submission)
        };
        if !reserved {
            return Ok(false);
        }

        let result = client.scrobble(track_id, submission).await;
        let mut sessions = self.sessions.lock().await;
        if let Some(state) = sessions.get_mut(playback_session_id) {
            if submission {
                state.completed_in_flight = false;
                if result.is_ok() {
                    state.completed_accepted = true;
                }
            } else {
                state.now_playing_in_flight = false;
                if result.is_ok() {
                    state.now_playing_accepted = true;
                }
            }
        }
        result.map(|()| true)
    }

    pub async fn clear(&self) {
        self.sessions.lock().await.clear();
    }
}

fn reserve(state: &mut SubmissionState, submission: bool) -> bool {
    if submission {
        if state.completed_accepted || state.completed_in_flight {
            false
        } else {
            state.completed_in_flight = true;
            true
        }
    } else if state.now_playing_accepted || state.now_playing_in_flight {
        false
    } else {
        state.now_playing_in_flight = true;
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn registry_starts_empty_and_clears() {
        let registry = ScrobbleRegistry::default();
        registry.sessions.lock().await.insert(
            "session".to_owned(),
            SubmissionState {
                track_id: "track".to_owned(),
                ..SubmissionState::default()
            },
        );
        registry.clear().await;
        assert!(registry.sessions.lock().await.is_empty());
    }

    #[test]
    fn reservation_prevents_concurrent_and_accepted_duplicates() {
        let mut state = SubmissionState {
            track_id: "track".to_owned(),
            ..SubmissionState::default()
        };
        assert!(reserve(&mut state, true));
        assert!(!reserve(&mut state, true));
        state.completed_in_flight = false;
        state.completed_accepted = true;
        assert!(!reserve(&mut state, true));

        assert!(reserve(&mut state, false));
        assert!(!reserve(&mut state, false));
    }
}
