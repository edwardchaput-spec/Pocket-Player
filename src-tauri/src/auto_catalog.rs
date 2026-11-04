//! Read-only Android Auto browse tree (ADR-011).
//!
//! Nodes are `kind` or `kind:<opaque id>` strings. The Kotlin media service
//! reaches these through the token-protected loopback proxy, so the car never
//! sees credentials or authenticated Navidrome URLs.

use serde::Serialize;

use crate::{
    error::{AppError, AppResult},
    media_proxy::valid_media_id,
    navidrome::{NavidromeClient, Song},
};

const LIST_LIMIT: u32 = 60;
const MAX_CHILDREN: usize = 500;
const SEARCH_SONGS: u32 = 50;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Node {
    Root,
    AlbumList(&'static str),
    Playlists,
    Artists,
    Artist(String),
    Album(String),
    Playlist(String),
    Search(String),
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BrowseItem {
    pub id: String,
    pub title: String,
    pub subtitle: Option<String>,
    pub cover_art: Option<String>,
    pub browsable: bool,
}

pub fn parse_node(raw: &str) -> AppResult<Node> {
    let invalid = || AppError::invalid_input("The browse node is invalid.");
    if raw.len() > 600 || raw.chars().any(char::is_control) {
        return Err(invalid());
    }
    let (kind, value) = match raw.split_once(':') {
        Some((kind, value)) => (kind, Some(value)),
        None => (raw, None),
    };
    let id = |value: Option<&str>| match value {
        Some(id) if valid_media_id(id) => Ok(id.to_owned()),
        _ => Err(invalid()),
    };
    match (kind, value) {
        ("root", None) => Ok(Node::Root),
        ("playlists", None) => Ok(Node::Playlists),
        ("artists", None) => Ok(Node::Artists),
        (list, None) => ALBUM_LISTS
            .iter()
            .find(|name| **name == list)
            .map(|name| Node::AlbumList(name))
            .ok_or_else(invalid),
        ("artist", value) => id(value).map(Node::Artist),
        ("album", value) => id(value).map(Node::Album),
        ("playlist", value) => id(value).map(Node::Playlist),
        ("search", Some(query)) if !query.trim().is_empty() && query.len() <= 200 => {
            Ok(Node::Search(query.trim().to_owned()))
        }
        _ => Err(invalid()),
    }
}

pub async fn children(client: &NavidromeClient, node: &Node) -> AppResult<Vec<BrowseItem>> {
    let mut items = match node {
        Node::Root => root_items(),
        Node::AlbumList(list) => client
            .get_album_list(list, LIST_LIMIT, 0)
            .await?
            .into_iter()
            .map(|album| BrowseItem {
                id: format!("album:{}", album.id),
                title: album.name,
                subtitle: album.artist,
                cover_art: album.cover_art,
                browsable: true,
            })
            .collect(),
        Node::Playlists => client
            .get_playlists()
            .await?
            .into_iter()
            .map(|playlist| BrowseItem {
                id: format!("playlist:{}", playlist.id),
                title: playlist.name,
                subtitle: playlist.song_count.map(|count| format!("{count} tracks")),
                cover_art: playlist.cover_art,
                browsable: true,
            })
            .collect(),
        Node::Artists => client
            .get_artists()
            .await?
            .into_iter()
            .map(|artist| BrowseItem {
                id: format!("artist:{}", artist.id),
                title: artist.name,
                subtitle: None,
                cover_art: artist.cover_art,
                browsable: true,
            })
            .collect(),
        Node::Artist(id) => client
            .get_artist(id)
            .await?
            .albums
            .into_iter()
            .map(|album| BrowseItem {
                id: format!("album:{}", album.id),
                title: album.name,
                subtitle: album.year.map(|year| year.to_string()),
                cover_art: album.cover_art,
                browsable: true,
            })
            .collect(),
        Node::Album(_) | Node::Playlist(_) | Node::Search(_) => tracks(client, node)
            .await?
            .into_iter()
            .map(song_item)
            .collect(),
    };
    items.truncate(MAX_CHILDREN);
    Ok(items)
}

pub async fn tracks(client: &NavidromeClient, node: &Node) -> AppResult<Vec<Song>> {
    match node {
        Node::Album(id) => Ok(client.get_album(id).await?.songs),
        Node::Playlist(id) => Ok(client.get_playlist(id).await?.songs),
        Node::Search(query) => Ok(client
            .search(query, 0, 0, 0, SEARCH_SONGS, 0, 0)
            .await?
            .songs),
        _ => Err(AppError::invalid_input("This browse node has no tracks.")),
    }
}

fn root_items() -> Vec<BrowseItem> {
    [
        ("newest", "Recently added"),
        ("playlists", "Playlists"),
        ("artists", "Artists"),
        ("recent", "Recently played"),
        ("frequent", "Most played"),
        ("starred", "Favourite albums"),
        ("random", "Random albums"),
    ]
    .into_iter()
    .map(|(id, title)| BrowseItem {
        id: id.to_owned(),
        title: title.to_owned(),
        subtitle: None,
        cover_art: None,
        browsable: true,
    })
    .collect()
}

const ALBUM_LISTS: &[&str] = &["newest", "recent", "frequent", "starred", "random"];

fn song_item(song: Song) -> BrowseItem {
    BrowseItem {
        id: song.id,
        title: song.title,
        subtitle: song.display_artist.or(song.artist),
        cover_art: song.cover_art,
        browsable: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_known_nodes_and_keeps_ids_opaque() {
        assert_eq!(parse_node("root").unwrap(), Node::Root);
        assert_eq!(parse_node("newest").unwrap(), Node::AlbumList("newest"));
        assert_eq!(
            parse_node("album:al:01:x").unwrap(),
            Node::Album("al:01:x".to_owned())
        );
        assert_eq!(
            parse_node("search:  night ferry ").unwrap(),
            Node::Search("night ferry".to_owned())
        );
    }

    #[test]
    fn rejects_unknown_or_unsafe_nodes() {
        for raw in [
            "",
            "albums",
            "album:",
            "album:../x",
            "album:a/b",
            "root:x",
            "search:",
            "search:   ",
            "newest\n",
        ] {
            assert!(parse_node(raw).is_err(), "{raw:?} should be rejected");
        }
    }

    #[test]
    fn root_lists_primary_destinations_first() {
        let ids: Vec<_> = root_items().into_iter().map(|item| item.id).collect();
        assert_eq!(
            ids,
            [
                "newest",
                "playlists",
                "artists",
                "recent",
                "frequent",
                "starred",
                "random"
            ]
        );
    }
}
