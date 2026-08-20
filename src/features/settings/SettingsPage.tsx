import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { formatDate } from '../../lib/format';
import { logout, testConnection } from '../../lib/tauri/auth';
import { clearLocalLibraryData, exportDiagnostics } from '../../lib/tauri/playback';
import { getPlaylists } from '../../lib/tauri/library';
import { AppError, HomeSection, Session } from '../../lib/tauri/types';
import { usePlaybackStore } from '../player/playbackStore';
import { getThemeColorDefaults, isStrictHexColor } from './themeColors';
import './SettingsPage.css';

export function SettingsPage({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [testing, setTesting] = useState(false);
  const [clearingData, setClearingData] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const queryClient = useQueryClient();
  const player = usePlaybackStore();
  const profile = session.profile;
  const themeColorDefaults = getThemeColorDefaults(player.theme);
  const hasCustomColors = Object.values(player.customColors).some((color) => color !== null);
  const playlists = useQuery({
    queryKey: ['profile', profile.profileId, 'playlists'],
    queryFn: getPlaylists,
  });

  const homeOptions: Array<[HomeSection, string]> = [
    ['newest', 'Recently added'],
    ['trackMix', 'Track Mix'],
    ['recent', 'Recently played'],
    ['frequent', 'Frequently played'],
    ['starredAlbums', 'Favourite albums'],
    ['random', 'Random albums'],
    ['favouriteTracks', 'Favourite tracks'],
    ['pinnedPlaylists', 'Pinned playlists'],
  ];

  const toggleHomeSection = (section: HomeSection) => {
    player.setHomeSections(
      player.homeSections.includes(section)
        ? player.homeSections.filter((item) => item !== section)
        : [...player.homeSections, section],
    );
  };

  const moveHomeSection = (section: HomeSection, delta: number) => {
    const from = player.homeSections.indexOf(section);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= player.homeSections.length) return;
    const sections = [...player.homeSections];
    sections.splice(from, 1);
    sections.splice(to, 0, section);
    player.setHomeSections(sections);
  };

  const test = async () => {
    setTesting(true);
    setMessage(null);
    try {
      await testConnection();
      setMessage({ kind: 'success', text: 'Connection successful.' });
    } catch (cause) {
      setMessage({ kind: 'error', text: (cause as AppError).message });
    } finally {
      setTesting(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Log out and remove this app’s remembered Windows credential?')) return;
    setMessage(null);
    try {
      await logout();
      player.clear();
      queryClient.clear();
      onLogout();
    } catch (cause) {
      setMessage({ kind: 'error', text: (cause as AppError).message });
    }
  };

  const clearLocalData = async () => {
    if (
      !window.confirm(
        'Clear the local metadata index and this desktop’s listening history? Navidrome data will not be changed.',
      )
    )
      return;
    setClearingData(true);
    setMessage(null);
    try {
      await clearLocalLibraryData();
      queryClient.removeQueries({ queryKey: ['profile', profile.profileId] });
      setMessage({ kind: 'success', text: 'Local index and listening history cleared.' });
    } catch (cause) {
      setMessage({ kind: 'error', text: (cause as AppError).message });
    } finally {
      setClearingData(false);
    }
  };

  const createDiagnostics = async () => {
    setExporting(true);
    setMessage(null);
    try {
      const result = await exportDiagnostics();
      setMessage({ kind: 'success', text: `Redacted diagnostics saved to ${result.path}` });
    } catch (cause) {
      setMessage({ kind: 'error', text: (cause as AppError).message });
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className="page-content settings-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Application</p>
          <h1>Settings</h1>
        </div>
      </header>
      <section className="settings-card">
        <h2>Navidrome connection</h2>
        <dl>
          <div>
            <dt>Server</dt>
            <dd>{profile.serverUrl}</dd>
          </div>
          <div>
            <dt>Username</dt>
            <dd>{profile.username}</dd>
          </div>
          <div>
            <dt>Last connected</dt>
            <dd>{formatDate(profile.lastSuccessfulConnection)}</dd>
          </div>
          <div>
            <dt>Server type</dt>
            <dd>{profile.server.serverType ?? 'Not reported'}</dd>
          </div>
          <div>
            <dt>Server version</dt>
            <dd>{profile.server.serverVersion ?? 'Not reported'}</dd>
          </div>
        </dl>
        <div>
          <h3>OpenSubsonic capabilities</h3>
          {profile.server.openSubsonicCapabilities.length ? (
            <ul className="capability-list">
              {profile.server.openSubsonicCapabilities.map((capability) => (
                <li key={capability}>{capability}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">No optional capabilities were reported.</p>
          )}
        </div>
        {message && (
          <p
            className={`message ${message.kind === 'error' ? 'error-message' : 'success-message'}`}
            role="status"
          >
            {message.text}
          </p>
        )}
        <div className="button-row">
          <button
            className="secondary-button"
            type="button"
            disabled={testing}
            onClick={() => void test()}
          >
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          <button className="danger-button" type="button" onClick={() => void disconnect()}>
            Log out
          </button>
          <button
            className="danger-button"
            type="button"
            disabled={clearingData}
            onClick={() => void clearLocalData()}
          >
            {clearingData ? 'Clearing…' : 'Clear local data'}
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={exporting}
            onClick={() => void createDiagnostics()}
          >
            {exporting ? 'Exporting…' : 'Export redacted diagnostics'}
          </button>
        </div>
      </section>
      <section className="settings-card settings-preferences">
        <h2>Appearance and visualiser</h2>
        <div className="preference-grid">
          <label>
            <span>Theme</span>
            <select
              value={player.theme}
              onChange={(event) =>
                player.setTheme(event.target.value as 'dark' | 'light' | 'system')
              }
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">Follow Windows</option>
            </select>
          </label>
          <label>
            <span>Density</span>
            <select
              value={player.density}
              onChange={(event) =>
                player.setDensity(event.target.value as 'comfortable' | 'compact')
              }
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </label>
          <label>
            <span>Visualiser quality</span>
            <select
              value={player.visualizerQuality}
              onChange={(event) => player.setVisualizerQuality(Number(event.target.value))}
            >
              <option value={1}>Low</option>
              <option value={2}>Balanced</option>
              <option value={3}>High</option>
            </select>
          </label>
          <label>
            <span>Visualiser sensitivity · {player.visualizerSensitivity.toFixed(2)}×</span>
            <input
              type="range"
              min="0.35"
              max="2.5"
              step="0.05"
              value={player.visualizerSensitivity}
              onChange={(event) => player.setVisualizerSensitivity(Number(event.target.value))}
            />
          </label>
          <label>
            <span>Automatic preset rotation</span>
            <select
              value={player.visualizerRotationSeconds}
              onChange={(event) => player.setVisualizerRotationSeconds(Number(event.target.value))}
            >
              <option value={15}>Every 15 seconds</option>
              <option value={30}>Every 30 seconds</option>
              <option value={60}>Every minute</option>
              <option value={120}>Every 2 minutes</option>
            </select>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={player.visualizerAutoRotate}
              onChange={(event) => player.setVisualizerAutoRotate(event.target.checked)}
            />
            Rotate visualiser presets automatically
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={player.visualizerRandomMode}
              onChange={(event) => player.setVisualizerRandomMode(event.target.checked)}
            />
            Randomise automatic preset order
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={player.notifications}
              onChange={(event) => player.setNotifications(event.target.checked)}
            />
            Track-change notifications
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={player.closeToTray}
              onChange={(event) => player.setCloseToTray(event.target.checked)}
            />
            Keep playing in the tray when the main window closes
          </label>
        </div>
      </section>
      <section className="settings-card">
        <div className="custom-colour-heading">
          <div>
            <h2>Custom colours</h2>
            <p className="muted">
              These optional colours layer over your selected {player.theme} theme. Text colours
              adapt automatically when you replace the background; keep the surface at a similar
              brightness for consistent contrast across cards and controls.
            </p>
          </div>
          <button
            type="button"
            className="secondary-button"
            disabled={!hasCustomColors}
            onClick={() => player.resetCustomColors()}
          >
            Reset to theme defaults
          </button>
        </div>
        <div className="custom-colour-layout">
          <div className="custom-colour-grid">
            {(
              [
                ['accent', 'Accent', 'Buttons, focus and active details'],
                ['background', 'Background', 'The main application canvas'],
                ['surface', 'Surface', 'Cards, panels and raised controls'],
              ] as const
            ).map(([token, label, detail]) => {
              const customColor = player.customColors[token];
              return (
                <label className="custom-colour-control" key={token}>
                  <span className="custom-colour-label">
                    {label}
                    <small>
                      {detail} · {customColor?.toUpperCase() ?? 'Theme default'}
                    </small>
                  </span>
                  <input
                    type="color"
                    aria-label={`${label} colour`}
                    value={customColor ?? themeColorDefaults[token]}
                    onChange={(event) => {
                      if (isStrictHexColor(event.target.value)) {
                        player.setCustomColor(token, event.target.value);
                      }
                    }}
                  />
                </label>
              );
            })}
          </div>
          <div className="theme-colour-preview" role="img" aria-label="Theme colour preview">
            <div className="theme-colour-preview-surface">
              <span>Live preview</span>
              <div>
                <strong>Pocket Player</strong>
                <small>Custom colour palette</small>
              </div>
              <div className="theme-colour-preview-accent" aria-hidden="true" />
            </div>
          </div>
        </div>
      </section>
      <section className="settings-card">
        <h2>Home sections</h2>
        <p className="muted">
          Choose what appears on Home and use the arrow buttons to set its order.
        </p>
        <ol className="settings-order-list">
          {homeOptions.map(([section, label]) => {
            const position = player.homeSections.indexOf(section);
            const enabled = position >= 0;
            return (
              <li key={section}>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => toggleHomeSection(section)}
                  />
                  {label}
                </label>
                <div className="button-row">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Move ${label} up`}
                    disabled={!enabled || position === 0}
                    onClick={() => moveHomeSection(section, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Move ${label} down`}
                    disabled={!enabled || position === player.homeSections.length - 1}
                    onClick={() => moveHomeSection(section, 1)}
                  >
                    ↓
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
        <h3>Pinned playlists</h3>
        {playlists.isPending ? (
          <p className="muted">Loading playlists…</p>
        ) : playlists.isError ? (
          <p className="error-message">Could not load playlists.</p>
        ) : playlists.data.length ? (
          <div className="settings-checkbox-grid">
            {playlists.data.map((playlist) => (
              <label key={playlist.id} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={player.pinnedPlaylistIds.includes(playlist.id)}
                  onChange={(event) =>
                    player.setPinnedPlaylistIds(
                      event.target.checked
                        ? [...player.pinnedPlaylistIds, playlist.id]
                        : player.pinnedPlaylistIds.filter((id) => id !== playlist.id),
                    )
                  }
                />
                {playlist.name}
              </label>
            ))}
          </div>
        ) : (
          <p className="muted">Create a playlist first, then pin it here.</p>
        )}
      </section>
    </main>
  );
}
