import { useEffect, useRef, useState } from 'react';

import { restoreSession } from '../lib/tauri/auth';
import { AppError } from '../lib/tauri/types';
import { LoginScreen } from '../features/auth/LoginScreen';
import { MiniPlayerWindow } from '../features/player/MiniPlayerWindow';
import { isMiniPlayerWindow } from '../lib/tauri/desktop';
import { AppShell } from './AppShell';
import { useAuth } from './AuthContext';

export function App() {
  if (isMiniPlayerWindow()) return <MiniPlayerWindow />;
  return <MainApplication />;
}

function MainApplication() {
  const { session, savedProfile, setSession, setSavedProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [restorationError, setRestorationError] = useState<AppError | null>(null);
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    void restoreSession()
      .then((startup) => {
        setSession(startup.session ?? null);
        setSavedProfile(startup.savedProfile ?? null);
        setRestorationError(startup.restorationError ?? null);
      })
      .catch((error: AppError) => setRestorationError(error))
      .finally(() => setLoading(false));
  }, [setSavedProfile, setSession]);

  if (loading) {
    return (
      <main className="startup-screen" aria-busy="true">
        <div className="brand-mark">♪</div>
        <p>Opening your library…</p>
      </main>
    );
  }
  if (!session) {
    return (
      <LoginScreen
        savedProfile={savedProfile}
        initialError={restorationError}
        onConnected={(connected) => {
          setRestorationError(null);
          setSavedProfile(null);
          setSession(connected);
        }}
      />
    );
  }
  return (
    <AppShell
      session={session}
      onLogout={() => {
        setSession(null);
        setSavedProfile(null);
      }}
    />
  );
}
