use url::Url;

const REDACTED: &str = "[REDACTED]";

pub fn redact_url(raw: &str) -> String {
    let Ok(mut url) = Url::parse(raw) else {
        return REDACTED.to_string();
    };
    let pairs: Vec<(String, String)> = url
        .query_pairs()
        .map(|(key, value)| {
            let value = if matches!(
                key.to_ascii_lowercase().as_str(),
                "p" | "t" | "s" | "apikey"
            ) {
                REDACTED.to_string()
            } else {
                value.into_owned()
            };
            (key.into_owned(), value)
        })
        .collect();
    url.set_query(None);
    if !pairs.is_empty() {
        url.query_pairs_mut().extend_pairs(pairs);
    }
    url.to_string()
}

pub fn redact_header(name: &str, value: &str) -> String {
    if name.eq_ignore_ascii_case("authorization") || name.eq_ignore_ascii_case("cookie") {
        REDACTED.to_string()
    } else {
        value.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_authenticated_query_values() {
        let safe = redact_url(
            "https://music.test/rest/ping.view?u=alice&t=token&s=salt&p=secret&apiKey=key&v=1.16.1",
        );
        assert!(safe.contains("u=alice"));
        assert!(safe.contains("v=1.16.1"));
        for secret in ["token", "salt", "secret", "key"] {
            assert!(!safe.contains(secret));
        }
    }

    #[test]
    fn redacts_sensitive_headers() {
        assert_eq!(redact_header("Authorization", "Bearer secret"), REDACTED);
        assert_eq!(redact_header("Cookie", "session=secret"), REDACTED);
    }
}
