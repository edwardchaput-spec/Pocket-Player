use std::net::{IpAddr, Ipv4Addr};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use url::Url;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    pub server_type: Option<String>,
    pub server_version: Option<String>,
    #[serde(default)]
    pub open_subsonic_capabilities: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SafeProfile {
    pub profile_id: String,
    pub server_url: String,
    pub username: String,
    pub remember_credential: bool,
    pub last_successful_connection: String,
    pub server: ServerInfo,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginInput {
    pub server_url: String,
    pub username: String,
    pub password: String,
    pub remember_credential: bool,
    #[serde(default)]
    pub allow_private_http: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NormalizedServerUrl {
    pub url: Url,
    pub private_http: bool,
}

pub fn normalize_server_url(raw: &str, allow_private_http: bool) -> AppResult<NormalizedServerUrl> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::invalid_input("Enter a Navidrome server URL."));
    }
    let mut url = Url::parse(trimmed)
        .map_err(|_| AppError::invalid_input("Enter a complete http:// or https:// URL."))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(AppError::invalid_input(
            "Only HTTP and HTTPS server URLs are supported.",
        ));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(AppError::invalid_input(
            "Remove the username or password embedded in the server URL.",
        ));
    }
    if url.fragment().is_some() {
        return Err(AppError::invalid_input(
            "Server URLs cannot contain a fragment.",
        ));
    }
    if url.host_str().is_none() {
        return Err(AppError::invalid_input(
            "The server URL must include a host.",
        ));
    }
    if url.query().is_some() {
        return Err(AppError::invalid_input(
            "The server URL cannot contain query parameters.",
        ));
    }

    let private_http = url.scheme() == "http" && is_private_host(&url);
    if url.scheme() == "http" && !private_http {
        return Err(AppError::new(
            "PUBLIC_HTTP_REJECTED",
            "Plain HTTP is allowed only for a private LAN server. Use HTTPS for this address.",
            false,
        ));
    }
    if private_http && !allow_private_http {
        return Err(AppError::new(
            "PRIVATE_HTTP_CONFIRMATION_REQUIRED",
            "This private server uses unencrypted HTTP. Confirm that you accept the LAN-only risk.",
            false,
        ));
    }

    let normalized_path = if url.path() == "/" {
        String::new()
    } else {
        url.path().trim_end_matches('/').to_string()
    };
    url.set_path(&normalized_path);

    Ok(NormalizedServerUrl { url, private_http })
}

pub fn profile_id(server_url: &str, username: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(server_url.as_bytes());
    hasher.update(b"\n");
    hasher.update(username.as_bytes());
    hex::encode(hasher.finalize())
}

fn is_private_host(url: &Url) -> bool {
    let Some(host) = url.host_str() else {
        return false;
    };
    if host.eq_ignore_ascii_case("localhost") || host.ends_with(".local") {
        return true;
    }
    host.parse::<IpAddr>().is_ok_and(is_private_ip)
}

fn is_private_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            ip.is_private() || ip.is_loopback() || ip.is_link_local() || in_shared_v4(ip)
        }
        IpAddr::V6(ip) => ip.is_loopback() || ip.is_unique_local() || ip.is_unicast_link_local(),
    }
}

fn in_shared_v4(ip: Ipv4Addr) -> bool {
    let octets = ip.octets();
    octets[0] == 100 && (64..=127).contains(&octets[1])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_path_and_preserves_port() {
        let result = normalize_server_url(" https://music.example.test:8443/navidrome/// ", false)
            .expect("valid HTTPS URL");
        assert_eq!(
            result.url.as_str(),
            "https://music.example.test:8443/navidrome"
        );
    }

    #[test]
    fn rejects_embedded_credentials() {
        let error = normalize_server_url("https://user:secret@example.test", false)
            .expect_err("credentials must be rejected");
        assert_eq!(error.code, "INVALID_INPUT");
    }

    #[test]
    fn private_http_requires_confirmation() {
        let error = normalize_server_url("http://192.168.1.20:4533", false)
            .expect_err("confirmation is required");
        assert_eq!(error.code, "PRIVATE_HTTP_CONFIRMATION_REQUIRED");
        assert!(normalize_server_url("http://192.168.1.20:4533", true).is_ok());
    }

    #[test]
    fn public_http_is_rejected_even_when_confirmed() {
        let error =
            normalize_server_url("http://example.test", true).expect_err("public HTTP is unsafe");
        assert_eq!(error.code, "PUBLIC_HTTP_REJECTED");
    }

    #[test]
    fn profile_id_is_stable() {
        assert_eq!(
            profile_id("https://example.test", "alice"),
            profile_id("https://example.test", "alice")
        );
        assert_ne!(
            profile_id("https://example.test", "alice"),
            profile_id("https://example.test", "bob")
        );
    }
}
