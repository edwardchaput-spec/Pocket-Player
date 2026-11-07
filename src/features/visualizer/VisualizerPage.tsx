import { EmptyState } from '../../components/AsyncState';
import { Session } from '../../lib/tauri/types';
import { currentQueueItem, usePlaybackStore } from '../player/playbackStore';
import { VisualizerStage } from './VisualizerStage';

export function VisualizerPage({ session }: { session: Session }) {
  const current = usePlaybackStore(currentQueueItem);
  if (!current)
    return (
      <main className="page-content">
        <EmptyState
          title="Nothing playing"
          detail="Start a track and the visualiser will react to it."
        />
      </main>
    );
  return (
    <main className="page-content visualizer-page">
      <VisualizerStage session={session} track={current.track} />
    </main>
  );
}
