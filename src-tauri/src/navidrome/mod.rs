pub mod auth;
pub mod client;
pub mod models;

pub use client::NavidromeClient;
pub use models::{
    AlbumDetail, AlbumSummary, ArtistDetail, ArtistSummary, Genre, LyricsList, PlaylistDetail,
    PlaylistSummary, SearchResults, Song,
};
