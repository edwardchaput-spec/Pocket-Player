import { memo, RefObject, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { formatDuration } from '../../lib/format';
import { usePlaybackStore } from '../player/playbackStore';
import './QueuePopover.css';

interface QueuePopoverProps {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}

export const QueuePopover = memo(function QueuePopover({
  open,
  onClose,
  triggerRef,
}: QueuePopoverProps) {
  const state = usePlaybackStore(
    useShallow((playback) => ({
      queue: playback.queue,
      currentIndex: playback.currentIndex,
      position: playback.position,
      duration: playback.duration,
      shuffleMode: playback.shuffleMode,
      repeatMode: playback.repeatMode,
      toggleShuffle: playback.toggleShuffle,
      cycleRepeat: playback.cycleRepeat,
      clear: playback.clear,
      jumpTo: playback.jumpTo,
      move: playback.move,
      removeAt: playback.removeAt,
    })),
  );
  const panelRef = useRef<HTMLElement>(null);
  const currentTrackRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
      triggerRef.current?.focus();
    };
    const closeFromOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      onClose();
    };

    document.addEventListener('keydown', closeFromKeyboard);
    document.addEventListener('pointerdown', closeFromOutside);
    return () => {
      document.removeEventListener('keydown', closeFromKeyboard);
      document.removeEventListener('pointerdown', closeFromOutside);
    };
  }, [onClose, open, triggerRef]);

  useEffect(() => {
    if (!open) return;
    currentTrackRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [open, state.currentIndex]);

  if (!open) return null;

  const position = state.currentIndex == null ? 0 : state.currentIndex + 1;
  const current = state.currentIndex == null ? undefined : state.queue[state.currentIndex];

  return (
    <>
      <section
        ref={panelRef}
        id="player-queue-popover"
        className="queue-popover"
        role="region"
        aria-labelledby="queue-popover-title"
      >
        <div className="queue-popover__inner">
          <header className="queue-popover__header">
            <div>
              <span className="queue-popover__signal" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <div>
                <p>Playback sequence</p>
                <h2 id="queue-popover-title">Queue</h2>
              </div>
            </div>
            <span
              className="queue-popover__count"
              aria-label={`${position} of ${state.queue.length}`}
            >
              {String(position).padStart(2, '0')}
              <i>/</i>
              {String(state.queue.length).padStart(2, '0')}
            </span>
            <button
              className="queue-popover__close"
              type="button"
              aria-label="Close queue"
              onClick={() => {
                onClose();
                triggerRef.current?.focus();
              }}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m5.5 5.5 9 9m0-9-9 9" />
              </svg>
            </button>
          </header>

          {current && (
            <div
              className="queue-popover__current"
              aria-label={`Now playing ${current.track.title}, ${formatDuration(state.position)} of ${formatDuration(state.duration || current.track.duration)}`}
            >
              <span>Now playing</span>
              <strong>{current.track.title}</strong>
              <time>
                {formatDuration(state.position)} /{' '}
                {formatDuration(state.duration || current.track.duration)}
              </time>
            </div>
          )}

          <div className="queue-popover__tools" role="group" aria-label="Queue options">
            <button
              className={state.shuffleMode ? 'is-active' : ''}
              type="button"
              aria-pressed={state.shuffleMode}
              onClick={() => state.toggleShuffle()}
            >
              Shuffle <span>{state.shuffleMode ? 'On' : 'Off'}</span>
            </button>
            <button type="button" onClick={() => state.cycleRepeat()}>
              Repeat <span>{state.repeatMode === 'queue' ? 'All' : state.repeatMode}</span>
            </button>
            <button
              className="is-danger"
              type="button"
              onClick={() => {
                onClose();
                state.clear();
              }}
            >
              Clear
            </button>
          </div>

          <ol className="queue-popover__list">
            {state.queue.map((item, index) => {
              const isCurrent = index === state.currentIndex;
              return (
                <li
                  ref={isCurrent ? currentTrackRef : undefined}
                  key={item.occurrenceId}
                  className={isCurrent ? 'is-current' : ''}
                >
                  <button
                    className="queue-popover__track"
                    type="button"
                    aria-label={`Play ${item.track.title}, by ${item.track.displayArtist ?? item.track.artist ?? 'Unknown artist'}${item.track.album ? `, from ${item.track.album}` : ''}, ${formatDuration(item.track.duration)}`}
                    aria-current={isCurrent ? 'true' : undefined}
                    onClick={() => state.jumpTo(index)}
                  >
                    <span className="queue-popover__position" aria-hidden="true">
                      {isCurrent ? <i /> : String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="queue-popover__copy">
                      <strong>{item.track.title}</strong>
                      <small>
                        {item.track.displayArtist ?? item.track.artist ?? 'Unknown artist'}
                        {item.track.album ? ` · ${item.track.album}` : ''}
                      </small>
                    </span>
                    <span className="queue-popover__duration">
                      {formatDuration(item.track.duration)}
                    </span>
                  </button>
                  <div className="queue-popover__actions">
                    <button
                      type="button"
                      disabled={index === 0}
                      aria-label={`Move ${item.track.title} up`}
                      onClick={() => state.move(index, index - 1)}
                    >
                      <svg viewBox="0 0 18 18" aria-hidden="true">
                        <path d="m5 10 4-4 4 4M9 6v7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      disabled={index === state.queue.length - 1}
                      aria-label={`Move ${item.track.title} down`}
                      onClick={() => state.move(index, index + 1)}
                    >
                      <svg viewBox="0 0 18 18" aria-hidden="true">
                        <path d="m5 8 4 4 4-4M9 5v7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${item.track.title} from queue`}
                      onClick={() => state.removeAt(index)}
                    >
                      <svg viewBox="0 0 18 18" aria-hidden="true">
                        <path d="M5.5 5.5l7 7m0-7-7 7" />
                      </svg>
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
          <footer className="queue-popover__footer">
            <span>Drag-free precision controls</span>
            <i aria-hidden="true" />
          </footer>
        </div>
      </section>
      <span className="queue-popover__pointer" aria-hidden="true" />
    </>
  );
});
