// Commands are implemented in Kotlin (android/) and reached from the webview
// through `plugin:pocket-playback|<command>`; listing them here generates the
// matching ACL permissions.
const COMMANDS: &[&str] = &[
    "subscribe",
    "configure",
    "set_queue",
    "play",
    "pause",
    "seek_to",
    "skip_to",
    "set_volume",
    "set_repeat_mode",
    "set_spectrum_enabled",
    "stop",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
