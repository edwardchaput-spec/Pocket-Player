import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { sessionFixture, songsFixture } from '../../test/fixtures';
import { usePlaybackStore } from '../player/playbackStore';
import { VisualizerStage } from './VisualizerStage';

vi.mock('./VisualizerCanvas', () => ({
  VisualizerCanvas: () => <canvas className="visualizer-canvas" />,
}));

const root = document.documentElement;

beforeEach(() => {
  usePlaybackStore.setState(usePlaybackStore.getInitialState(), true);
});

afterEach(() => {
  root.classList.remove('visualizer-immersive', 'visualizer-chrome-revealed');
});

function renderStage() {
  return render(<VisualizerStage session={sessionFixture} track={songsFixture[0]!} />);
}

function swipe(element: HTMLElement, dx: number, dy: number) {
  fireEvent.pointerDown(element, { clientX: 200, clientY: 400, pointerId: 1 });
  fireEvent.pointerUp(element, { clientX: 200 + dx, clientY: 400 + dy, pointerId: 1 });
}

it('goes fully immersive and reveals navigation on tap or upward swipe', async () => {
  const { unmount } = renderStage();
  const stage = screen.getByRole('region', { name: 'Music visualizer' });

  await userEvent.click(screen.getByRole('button', { name: 'Full screen' }));
  expect(stage).toHaveClass('is-immersive');
  expect(root).toHaveClass('visualizer-immersive');
  expect(root).not.toHaveClass('visualizer-chrome-revealed');

  swipe(stage, 0, -120);
  expect(root).toHaveClass('visualizer-chrome-revealed');
  swipe(stage, 0, 120);
  expect(root).not.toHaveClass('visualizer-chrome-revealed');
  swipe(stage, 0, 0);
  expect(root).toHaveClass('visualizer-chrome-revealed');

  unmount();
  expect(root).not.toHaveClass('visualizer-immersive');
});

it('changes scene with a sideways swipe while immersive', async () => {
  renderStage();
  const stage = screen.getByRole('region', { name: 'Music visualizer' });
  await userEvent.click(screen.getByRole('button', { name: 'Full screen' }));
  const before = usePlaybackStore.getState().visualizer;

  swipe(stage, -150, 10);

  expect(usePlaybackStore.getState().visualizer).not.toBe(before);
});

it('offers scenes as selectable tiles', async () => {
  renderStage();
  await userEvent.click(screen.getByRole('button', { name: /Scenes/ }));
  const tiles = screen.getAllByRole('button', { pressed: false });
  const target = tiles.find((tile) => tile.classList.contains('preset-main'))!;

  await userEvent.click(target);

  expect(target).toHaveAttribute('aria-pressed', 'true');
});
