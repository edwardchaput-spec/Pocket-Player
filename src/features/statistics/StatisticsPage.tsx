import { useQuery } from '@tanstack/react-query';

import { EmptyState, ErrorState, PageHeader } from '../../components/AsyncState';
import { getListeningStatistics } from '../../lib/tauri/playback';
import { Session } from '../../lib/tauri/types';

export function StatisticsPage({ session }: { session: Session }) {
  const query = useQuery({
    queryKey: ['profile', session.profile.profileId, 'local-statistics'],
    queryFn: getListeningStatistics,
  });
  if (query.isPending)
    return (
      <main className="page-content">
        <div className="state-panel">Calculating local statistics…</div>
      </main>
    );
  if (query.isError)
    return (
      <main className="page-content">
        <ErrorState message={query.error.message} retry={() => void query.refetch()} />
      </main>
    );
  const stats = query.data;
  const maximum = Math.max(...stats.daily.map((day) => day.listenedMs), 1);
  return (
    <main className="page-content">
      <PageHeader>
        <div>
          <p className="eyebrow">This desktop</p>
          <h1>Listening statistics</h1>
        </div>
        <p className="muted">These figures include playback observed by this app only.</p>
      </PageHeader>
      <div className="stat-grid">
        <Stat label="Listening time" value={formatListening(stats.totalListenedMs)} />
        <Stat label="Completed plays" value={stats.completedPlays.toLocaleString()} />
        <Stat label="Unique tracks" value={stats.uniqueTracks.toLocaleString()} />
      </div>
      {stats.completedPlays === 0 ? (
        <EmptyState
          title="No completed plays yet"
          detail="Statistics appear after qualifying plays are recorded by this desktop app."
        />
      ) : (
        <div className="statistics-layout">
          <section className="settings-card">
            <h2>Last 31 active days</h2>
            <div className="daily-chart" aria-label="Daily listening time">
              {[...stats.daily].reverse().map((day) => (
                <div
                  key={day.date}
                  className="daily-bar"
                  title={`${day.date}: ${formatListening(day.listenedMs)}`}
                >
                  <span style={{ height: `${Math.max(4, (day.listenedMs / maximum) * 100)}%` }} />
                  <small>{day.date.slice(5)}</small>
                </div>
              ))}
            </div>
          </section>
          <section className="settings-card">
            <h2>Top tracks</h2>
            <ol className="top-tracks">
              {stats.topTracks.map((track) => (
                <li key={track.trackId}>
                  <span>
                    <strong>{track.title}</strong>
                    <small>{track.artist ?? 'Unknown artist'}</small>
                  </span>
                  <span>
                    {track.plays} plays · {formatListening(track.listenedMs)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <section className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

function formatListening(milliseconds: number): string {
  const minutes = Math.round(milliseconds / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ${minutes % 60} min`;
}
