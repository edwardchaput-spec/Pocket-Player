import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';

import { Profile, Session } from '../lib/tauri/types';

interface AuthValue {
  session: Session | null;
  savedProfile: Profile | null;
  setSession: (session: Session | null) => void;
  setSavedProfile: (profile: Profile | null) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [savedProfile, setSavedProfile] = useState<Profile | null>(null);
  const value = useMemo(
    () => ({ session, savedProfile, setSession, setSavedProfile }),
    [session, savedProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
