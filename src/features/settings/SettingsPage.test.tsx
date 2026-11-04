import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { sessionFixture } from '../../test/fixtures';
import { usePlaybackStore } from '../player/playbackStore';
import { getPlaylists, refreshLibraryIndex } from '../../lib/tauri/library';
import { SettingsPage } from './SettingsPage';

vi.mock('../../lib/tauri/auth', () => ({
  logout: vi.fn(() => Promise.resolve()),
  testConnection: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../lib/tauri/library', () => ({
  getPlaylists: vi.fn(() => Promise.resolve([])),
  getLibraryIndexStatus: vi.fn(() =>
    Promise.resolve({ ready: true, trackCount: 1200, refreshedAt: '2026-11-01T10:00:00Z' }),
  ),
  refreshLibraryIndex: vi.fn(() =>
    Promise.resolve({ ready: true, trackCount: 1234, refreshedAt: '2026-11-04T16:30:00Z' }),
  ),
}));

vi.mock('../../lib/tauri/playback', () => ({
  clearLocalLibraryData: vi.fn(() => Promise.resolve()),
  exportDiagnostics: vi.fn(() => Promise.resolve({ path: 'diagnostics.json' })),
}));

beforeEach(() => {
  usePlaybackStore.getState().initializeSettings(sessionFixture.playerSettings);
});

it('layers custom colours over the selected theme and resets them together', async () => {
  renderSettings();

  expect(screen.getByText(/layer over your selected dark theme/i)).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Theme colour preview' })).toBeInTheDocument();

  const reset = screen.getByRole('button', { name: 'Reset to theme defaults' });
  expect(reset).toBeDisabled();

  fireEvent.change(screen.getByLabelText('Accent colour'), {
    target: { value: '#ff3366' },
  });
  expect(usePlaybackStore.getState().customColors.accent).toBe('#ff3366');
  expect(reset).toBeEnabled();

  await userEvent.click(reset);
  expect(usePlaybackStore.getState().customColors).toEqual({
    accent: null,
    background: null,
    surface: null,
  });
  expect(reset).toBeDisabled();
});

it('resyncs the library index and refetches cached server data', async () => {
  renderSettings();
  expect(await screen.findByText(/1,200 tracks/)).toBeInTheDocument();
  const callsBefore = vi.mocked(getPlaylists).mock.calls.length;

  await userEvent.click(screen.getByRole('button', { name: 'Resync with server' }));

  expect(await screen.findByText('Resynced with the server: 1,234 tracks.')).toBeInTheDocument();
  expect(refreshLibraryIndex).toHaveBeenCalledTimes(1);
  expect(vi.mocked(getPlaylists).mock.calls.length).toBeGreaterThan(callsBefore);
});

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SettingsPage session={sessionFixture} onLogout={vi.fn()} />
    </QueryClientProvider>,
  );
}
