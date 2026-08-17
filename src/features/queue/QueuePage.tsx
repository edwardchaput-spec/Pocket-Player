import { Link } from 'react-router-dom';

import { EmptyState, PageHeader } from '../../components/AsyncState';
import { formatDuration } from '../../lib/format';
import { usePlaybackStore } from '../player/playbackStore';

export function QueuePage() {
  const state = usePlaybackStore();
  return (
    <main className="page-content queue-page">
      <PageHeader>
        <div>
          <p className="eyebrow">Now playing</p>
          <h1>Queue</h1>
        </div>
        <div className="button-row">
          <button
            className={`secondary-button ${state.shuffleMode ? 'is-active' : ''}`}
            type="button"
            onClick={() => state.toggleShuffle()}
          >
            Shuffle {state.shuffleMode ? 'on' : 'off'}
          </button>
          <button className="secondary-button" type="button" onClick={() => state.cycleRepeat()}>
            Repeat: {state.repeatMode}
          </button>
          <button
            className="danger-button"
            type="button"
            disabled={!state.queue.length}
            onClick={() => state.clear()}
          >
            Clear
          </button>
        </div>
      </PageHeader>
      {!state.queue.length ? (
        <EmptyState
          title="Queue is empty"
          detail="Play an album or add tracks from your library."
        />
      ) : (
        <ol className="queue-list">
          {state.queue.map((item, index) => (
            <li
              key={item.occurrenceId}
              className={index === state.currentIndex ? 'is-current' : ''}
            >
              <button className="queue-main" type="button" onClick={() => state.jumpTo(index)}>
                <span className="queue-position">
                  {index === state.currentIndex ? '▶' : index + 1}
                </span>
                <span>
                  <strong>{item.track.title}</strong>
                  <small>
                    {item.track.artist ?? 'Unknown artist'} · {item.track.album ?? 'Unknown album'}
                  </small>
                </span>
                <span>{formatDuration(item.track.duration)}</span>
              </button>
              <div className="queue-actions">
                <button
                  type="button"
                  disabled={index === 0}
                  aria-label={`Move ${item.track.title} up`}
                  onClick={() => state.move(index, index - 1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={index === state.queue.length - 1}
                  aria-label={`Move ${item.track.title} down`}
                  onClick={() => state.move(index, index + 1)}
                >
                  ↓
                </button>
                {item.track.albumId && (
                  <Link
                    to={`/albums/${encodeURIComponent(item.track.albumId)}`}
                    aria-label={`Open album ${item.track.album ?? ''}`}
                  >
                    Album
                  </Link>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${item.track.title} from queue`}
                  onClick={() => state.removeAt(index)}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
