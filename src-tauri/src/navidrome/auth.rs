use md5::{Digest, Md5};
use zeroize::Zeroizing;

use crate::error::{AppError, AppResult};

pub const CLIENT_ID: &str = "burtonsvilla-desktop";
pub const PROTOCOL_VERSION: &str = "1.16.1";

pub fn token_for(password: &str, salt: &str) -> String {
    let mut digest = Md5::new();
    digest.update(password.as_bytes());
    digest.update(salt.as_bytes());
    hex::encode(digest.finalize())
}

pub fn fresh_salt() -> AppResult<Zeroizing<String>> {
    let mut bytes = Zeroizing::new([0_u8; 16]);
    getrandom::fill(bytes.as_mut()).map_err(|_| {
        AppError::new(
            "RANDOM_SOURCE_ERROR",
            "Secure randomness is unavailable.",
            true,
        )
    })?;
    Ok(Zeroizing::new(hex::encode(*bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_subsonic_token_vector() {
        assert_eq!(
            token_for("sesame", "c19b2d"),
            "26719a1196d2a940705a59634eb18eab"
        );
    }

    #[test]
    fn salts_are_lowercase_hex_and_unique() {
        let first = fresh_salt().expect("OS RNG");
        let second = fresh_salt().expect("OS RNG");
        assert_eq!(first.len(), 32);
        assert!(
            first
                .chars()
                .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
        );
        assert_ne!(first.as_str(), second.as_str());
    }
}
