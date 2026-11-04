use std::{collections::HashMap, sync::Arc};

use axum::{
    Router,
    body::Body,
    extract::{Path, Query, State},
    http::{HeaderMap, HeaderValue, Method, Response, StatusCode, header},
    routing::get,
};
use futures_util::StreamExt;
use tokio::{
    net::TcpListener,
    sync::{RwLock, oneshot},
};

use crate::{auto_catalog, error::AppError, navidrome::NavidromeClient};

const ALLOWED_ORIGINS: &[&str] = &[
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "tauri://localhost",
];

const SAFE_UPSTREAM_HEADERS: &[header::HeaderName] = &[
    header::CONTENT_TYPE,
    header::CONTENT_LENGTH,
    header::CONTENT_RANGE,
    header::ACCEPT_RANGES,
    header::ETAG,
    header::LAST_MODIFIED,
    header::CACHE_CONTROL,
];

pub type SharedClient = Arc<RwLock<Option<NavidromeClient>>>;

#[derive(Clone)]
struct ProxyState {
    token: Arc<str>,
    client: SharedClient,
}

pub struct ProxyHandle {
    pub base_url: String,
    shutdown: Option<oneshot::Sender<()>>,
}

impl ProxyHandle {
    pub fn shutdown(&mut self) {
        if let Some(sender) = self.shutdown.take() {
            let _ = sender.send(());
        }
    }
}

pub async fn start(client: SharedClient) -> Result<ProxyHandle, std::io::Error> {
    let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).await?;
    let address = listener.local_addr()?;
    debug_assert_eq!(
        address.ip(),
        std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST)
    );
    let mut token_bytes = [0_u8; 32];
    getrandom::fill(&mut token_bytes).map_err(std::io::Error::other)?;
    let token: Arc<str> = Arc::from(hex::encode(token_bytes));
    let state = ProxyState {
        token: token.clone(),
        client,
    };
    let router = Router::new()
        .route("/{token}/health", get(health).head(health))
        .route("/{token}/stream/{id}", get(stream).head(stream))
        .route("/{token}/cover/{id}", get(cover).head(cover))
        .route("/{token}/auto/children", get(auto_children))
        .route("/{token}/auto/tracks", get(auto_tracks))
        .with_state(state);
    let (shutdown_sender, shutdown_receiver) = oneshot::channel();
    tauri::async_runtime::spawn(async move {
        let server = axum::serve(listener, router).with_graceful_shutdown(async move {
            let _ = shutdown_receiver.await;
        });
        if let Err(error) = server.await {
            tracing::error!(category = "media_proxy", %error, "loopback proxy stopped unexpectedly");
        }
    });
    Ok(ProxyHandle {
        base_url: format!("http://{address}/{token}"),
        shutdown: Some(shutdown_sender),
    })
}

async fn health(
    State(state): State<ProxyState>,
    Path(token): Path<String>,
    headers: HeaderMap,
) -> Response<Body> {
    if !valid_token(&state, &token) {
        return safe_error(StatusCode::NOT_FOUND, &headers);
    }
    with_cors(
        Response::builder()
            .status(StatusCode::NO_CONTENT)
            .body(Body::empty())
            .unwrap_or_else(|_| Response::new(Body::empty())),
        &headers,
    )
}

async fn stream(
    State(state): State<ProxyState>,
    Path((token, id)): Path<(String, String)>,
    method: Method,
    headers: HeaderMap,
) -> Response<Body> {
    if !valid_token(&state, &token) || !valid_media_id(&id) || !origin_allowed(&headers) {
        return safe_error(StatusCode::NOT_FOUND, &headers);
    }
    let range = headers
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok());
    let Some(client) = state.client.read().await.clone() else {
        return safe_error(StatusCode::SERVICE_UNAVAILABLE, &headers);
    };
    match client.get_stream_response(&id, range).await {
        Ok(upstream)
            if matches!(
                upstream.status(),
                StatusCode::OK | StatusCode::PARTIAL_CONTENT
            ) =>
        {
            upstream_response(upstream, method == Method::HEAD, &headers)
        }
        Ok(upstream) if upstream.status() == StatusCode::NOT_FOUND => {
            safe_error(StatusCode::NOT_FOUND, &headers)
        }
        Ok(_) => safe_error(StatusCode::BAD_GATEWAY, &headers),
        Err(error) => proxy_error(error, &headers),
    }
}

async fn cover(
    State(state): State<ProxyState>,
    Path((token, id)): Path<(String, String)>,
    Query(query): Query<HashMap<String, String>>,
    method: Method,
    headers: HeaderMap,
) -> Response<Body> {
    if !valid_token(&state, &token) || !valid_media_id(&id) || !origin_allowed(&headers) {
        return safe_error(StatusCode::NOT_FOUND, &headers);
    }
    let size = match query.get("size") {
        None => None,
        Some(raw) => match raw.parse::<u32>() {
            Ok(value) if (32..=1200).contains(&value) => Some(value),
            _ => return safe_error(StatusCode::BAD_REQUEST, &headers),
        },
    };
    if query.keys().any(|key| key != "size") {
        return safe_error(StatusCode::BAD_REQUEST, &headers);
    }
    let Some(client) = state.client.read().await.clone() else {
        return safe_error(StatusCode::SERVICE_UNAVAILABLE, &headers);
    };
    match client.get_cover_art_response(&id, size).await {
        Ok(upstream) if upstream.status().is_success() => {
            upstream_response(upstream, method == Method::HEAD, &headers)
        }
        Ok(upstream) if upstream.status() == StatusCode::NOT_FOUND => {
            safe_error(StatusCode::NOT_FOUND, &headers)
        }
        Ok(_) => safe_error(StatusCode::BAD_GATEWAY, &headers),
        Err(error) => proxy_error(error, &headers),
    }
}

/// Android Auto browse tree. Reached only by the in-process Kotlin service;
/// browser origins are refused outright.
async fn auto_children(
    State(state): State<ProxyState>,
    Path(token): Path<String>,
    Query(query): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response<Body> {
    auto_json(state, token, query, headers, |client, node| async move {
        auto_catalog::children(&client, &node)
            .await
            .map(|items| serde_json::json!({ "items": items }))
    })
    .await
}

async fn auto_tracks(
    State(state): State<ProxyState>,
    Path(token): Path<String>,
    Query(query): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Response<Body> {
    auto_json(state, token, query, headers, |client, node| async move {
        auto_catalog::tracks(&client, &node)
            .await
            .map(|songs| serde_json::json!({ "songs": songs }))
    })
    .await
}

async fn auto_json<F, Fut>(
    state: ProxyState,
    token: String,
    query: HashMap<String, String>,
    headers: HeaderMap,
    load: F,
) -> Response<Body>
where
    F: FnOnce(NavidromeClient, auto_catalog::Node) -> Fut,
    Fut: std::future::Future<Output = Result<serde_json::Value, AppError>>,
{
    if !valid_token(&state, &token) || headers.contains_key(header::ORIGIN) {
        return safe_error(StatusCode::NOT_FOUND, &HeaderMap::new());
    }
    if query.keys().any(|key| key != "node") {
        return safe_error(StatusCode::BAD_REQUEST, &HeaderMap::new());
    }
    let Some(node) = query
        .get("node")
        .and_then(|raw| auto_catalog::parse_node(raw).ok())
    else {
        return safe_error(StatusCode::BAD_REQUEST, &HeaderMap::new());
    };
    let Some(client) = state.client.read().await.clone() else {
        return safe_error(StatusCode::SERVICE_UNAVAILABLE, &HeaderMap::new());
    };
    match load(client, node).await {
        Ok(value) => {
            let mut response = Response::new(Body::from(value.to_string()));
            response.headers_mut().insert(
                header::CONTENT_TYPE,
                HeaderValue::from_static("application/json"),
            );
            response
                .headers_mut()
                .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
            response
        }
        Err(error) => proxy_error(error, &HeaderMap::new()),
    }
}

fn upstream_response(
    upstream: reqwest::Response,
    head: bool,
    request_headers: &HeaderMap,
) -> Response<Body> {
    let status = upstream.status();
    let upstream_headers = upstream.headers().clone();
    let body = if head {
        Body::empty()
    } else {
        Body::from_stream(
            upstream
                .bytes_stream()
                .map(|chunk| chunk.map_err(std::io::Error::other)),
        )
    };
    let mut response = Response::new(body);
    *response.status_mut() = status;
    for name in SAFE_UPSTREAM_HEADERS {
        if let Some(value) = upstream_headers.get(name) {
            response.headers_mut().insert(name, value.clone());
        }
    }
    with_cors(response, request_headers)
}

fn proxy_error(error: AppError, headers: &HeaderMap) -> Response<Body> {
    let status = match error.code.as_str() {
        "NOT_FOUND" => StatusCode::NOT_FOUND,
        "INVALID_CREDENTIALS" | "PERMISSION_DENIED" => StatusCode::BAD_GATEWAY,
        "TIMEOUT" => StatusCode::GATEWAY_TIMEOUT,
        _ => StatusCode::BAD_GATEWAY,
    };
    safe_error(status, headers)
}

fn safe_error(status: StatusCode, request_headers: &HeaderMap) -> Response<Body> {
    let mut response = Response::new(Body::from("media unavailable"));
    *response.status_mut() = status;
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/plain; charset=utf-8"),
    );
    with_cors(response, request_headers)
}

fn with_cors(mut response: Response<Body>, request_headers: &HeaderMap) -> Response<Body> {
    // Always vary on Origin: the same cover is fetched both by plain <img>
    // (no Origin) and by the visualiser's CORS request. Without this, the
    // webview reuses the cached non-CORS response and blocks the canvas load.
    response
        .headers_mut()
        .insert(header::VARY, HeaderValue::from_static("Origin"));
    if let Some(origin) = request_headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
        .filter(|value| ALLOWED_ORIGINS.contains(value))
        .and_then(|value| HeaderValue::from_str(value).ok())
    {
        response
            .headers_mut()
            .insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin);
    }
    response
}

fn origin_allowed(headers: &HeaderMap) -> bool {
    headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
        .is_none_or(|origin| ALLOWED_ORIGINS.contains(&origin))
}

fn valid_token(state: &ProxyState, candidate: &str) -> bool {
    constant_time_equal(state.token.as_bytes(), candidate.as_bytes())
}

pub fn valid_media_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 512
        && !id
            .chars()
            .any(|character| character.is_control() || matches!(character, '/' | '\\'))
}

fn constant_time_equal(expected: &[u8], candidate: &[u8]) -> bool {
    if expected.len() != candidate.len() {
        return false;
    }
    expected
        .iter()
        .zip(candidate)
        .fold(0_u8, |difference, (left, right)| {
            difference | (left ^ right)
        })
        == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_proxy_media_ids() {
        assert!(valid_media_id("opaque-song:01"));
        assert!(!valid_media_id(""));
        assert!(!valid_media_id("../secret"));
        assert!(!valid_media_id(&"a".repeat(513)));
    }

    #[tokio::test]
    async fn auto_routes_refuse_browsers_bad_nodes_and_missing_sessions() {
        let mut proxy = start(Arc::new(RwLock::new(None))).await.expect("proxy");
        let http = reqwest::Client::new();
        let get = |path: &str, origin: Option<&str>| {
            let mut request = http.get(format!("{}{path}", proxy.base_url));
            if let Some(origin) = origin {
                request = request.header(header::ORIGIN, origin);
            }
            request.send()
        };
        let status = |path, origin| {
            let response = get(path, origin);
            async move { response.await.expect("response").status() }
        };
        assert_eq!(
            status("/auto/children?node=root", Some("http://tauri.localhost")).await,
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            status("/auto/children?node=album:../x", None).await,
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            status("/auto/tracks?node=root&extra=1", None).await,
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            status("/auto/children?node=root", None).await,
            StatusCode::SERVICE_UNAVAILABLE
        );
        proxy.shutdown();
    }

    #[test]
    fn cors_responses_always_vary_on_origin() {
        let plain = with_cors(Response::new(Body::empty()), &HeaderMap::new());
        assert_eq!(plain.headers()[header::VARY], "Origin");
        assert!(
            !plain
                .headers()
                .contains_key(header::ACCESS_CONTROL_ALLOW_ORIGIN)
        );

        let mut request = HeaderMap::new();
        request.insert(
            header::ORIGIN,
            HeaderValue::from_static("http://tauri.localhost"),
        );
        let cors = with_cors(Response::new(Body::empty()), &request);
        assert_eq!(cors.headers()[header::VARY], "Origin");
        assert_eq!(
            cors.headers()[header::ACCESS_CONTROL_ALLOW_ORIGIN],
            "http://tauri.localhost"
        );

        request.insert(
            header::ORIGIN,
            HeaderValue::from_static("https://evil.example"),
        );
        let refused = with_cors(Response::new(Body::empty()), &request);
        assert!(
            !refused
                .headers()
                .contains_key(header::ACCESS_CONTROL_ALLOW_ORIGIN)
        );
    }

    #[test]
    fn token_comparison_rejects_wrong_values() {
        assert!(constant_time_equal(b"same", b"same"));
        assert!(!constant_time_equal(b"same", b"diff"));
        assert!(!constant_time_equal(b"same", b"short"));
    }
}
