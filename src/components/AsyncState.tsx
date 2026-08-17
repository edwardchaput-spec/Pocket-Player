import { PropsWithChildren } from 'react';

export function PageHeader({ children }: PropsWithChildren) {
  return <header className="page-header">{children}</header>;
}

export function LoadingCards() {
  return (
    <div className="album-grid" aria-label="Loading albums" aria-busy="true">
      {Array.from({ length: 12 }, (_, index) => (
        <div className="album-card skeleton-card" key={index}>
          <div className="skeleton square" />
          <div className="skeleton line" />
          <div className="skeleton short-line" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="state-panel">
      <h2>{title}</h2>
      <p>{detail}</p>
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="state-panel" role="alert">
      <h2>Couldn’t load this view</h2>
      <p>{message}</p>
      <button className="secondary-button" type="button" onClick={retry}>
        Retry
      </button>
    </div>
  );
}
