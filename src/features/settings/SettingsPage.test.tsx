import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { sessionFixture } from '../../test/fixtures';
import { usePlaybackStore } from '../player/playbackStore';
import { SettingsPage } from './SettingsPage';

vi.mock('../../lib/tauri/auth', () => ({
  logout: vi.fn(() => Promise.resolve()),
  testConnection: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../lib/tauri/library', () => ({
  getPlaylists: vi.fn(() => Promise.resolve([])),
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

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SettingsPage session={sessionFixture} onLogout={vi.fn()} />
    </QueryClientProvider>,
  );
}
